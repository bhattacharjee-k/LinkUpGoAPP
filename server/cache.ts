import { logger, devLog } from './logger';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
}

interface CacheOptions {
  ttlMs: number;
  maxSize?: number;
  staleWhileRevalidate?: boolean;
}

const DEFAULT_TTL = 10 * 60 * 1000;
const DEFAULT_MAX_SIZE = 500;

class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private ttlMs: number;
  private staleWhileRevalidate: boolean;
  private revalidating: Set<string> = new Set();
  
  constructor(options: CacheOptions = { ttlMs: DEFAULT_TTL }) {
    this.ttlMs = options.ttlMs;
    this.maxSize = options.maxSize || DEFAULT_MAX_SIZE;
    this.staleWhileRevalidate = options.staleWhileRevalidate || false;
  }
  
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() > entry.expiresAt;
  }
  
  private isStale(entry: CacheEntry<T>): boolean {
    return Date.now() > entry.expiresAt - (this.ttlMs * 0.2);
  }
  
  private evictOldest(): void {
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
  
  get(key: string): { data: T; stale: boolean } | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    if (this.isExpired(entry) && !this.staleWhileRevalidate) {
      this.cache.delete(key);
      return null;
    }
    
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    return {
      data: entry.data,
      stale: this.isStale(entry),
    };
  }
  
  set(key: string, data: T): void {
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }
    
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.ttlMs,
      createdAt: Date.now(),
    });
  }
  
  delete(key: string): boolean {
    return this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  size(): number {
    return this.cache.size;
  }
  
  stats(): { size: number; maxSize: number; ttlMs: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
    };
  }
  
  isRevalidating(key: string): boolean {
    return this.revalidating.has(key);
  }
  
  startRevalidation(key: string): void {
    this.revalidating.add(key);
  }
  
  endRevalidation(key: string): void {
    this.revalidating.delete(key);
  }
}

function normalizeKey(params: Record<string, any>): string {
  const sorted = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      const val = params[key];
      if (val !== undefined && val !== null && val !== '') {
        acc[key] = Array.isArray(val) ? val.sort().join(',') : String(val);
      }
      return acc;
    }, {} as Record<string, string>);
  
  return JSON.stringify(sorted);
}

export const suggestionsCache = new LRUCache<any>({
  ttlMs: 10 * 60 * 1000,
  maxSize: 200,
  staleWhileRevalidate: true,
});

export const placesCache = new LRUCache<any>({
  ttlMs: 15 * 60 * 1000,
  maxSize: 300,
  staleWhileRevalidate: true,
});

export const eventsCache = new LRUCache<any>({
  ttlMs: 5 * 60 * 1000,
  maxSize: 100,
  staleWhileRevalidate: true,
});

export async function getCachedOrFetch<T>(
  cache: LRUCache<T>,
  key: string,
  fetchFn: () => Promise<T>,
  options?: { forceRefresh?: boolean }
): Promise<T> {
  if (!options?.forceRefresh) {
    const cached = cache.get(key);
    
    if (cached) {
      devLog('cache', `HIT${cached.stale ? ' (stale)' : ''}`, { key: key.slice(0, 50) });
      
      if (cached.stale && !cache.isRevalidating(key)) {
        cache.startRevalidation(key);
        fetchFn()
          .then(data => {
            cache.set(key, data);
            devLog('cache', 'Revalidated', { key: key.slice(0, 50) });
          })
          .catch(err => {
            logger.warn({ error: err.message }, 'Cache revalidation failed');
          })
          .finally(() => {
            cache.endRevalidation(key);
          });
      }
      
      return cached.data;
    }
  }
  
  devLog('cache', 'MISS', { key: key.slice(0, 50) });
  
  const data = await fetchFn();
  cache.set(key, data);
  
  return data;
}

export function buildSuggestionsCacheKey(params: {
  city: string;
  neighborhood?: string;
  categories: string[];
  budget?: string;
  energy?: string;
  timeWindow?: string;
  specificDate?: string;
}): string {
  return `suggestions:${normalizeKey(params)}`;
}

export function buildPlacesCacheKey(params: {
  location: string;
  radius: number;
  types: string[];
}): string {
  return `places:${normalizeKey(params)}`;
}

export function buildEventsCacheKey(params: {
  city: string;
  startDate: string;
  endDate: string;
  categories?: string[];
}): string {
  return `events:${normalizeKey(params)}`;
}
