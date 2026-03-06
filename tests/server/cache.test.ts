import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LRUCache } from '../../server/cache';

describe('LRUCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for missing key', () => {
    const cache = new LRUCache<string>({ ttlMs: 1000 });
    expect(cache.get('missing')).toBeNull();
  });

  it('stores and retrieves values', () => {
    const cache = new LRUCache<string>({ ttlMs: 1000 });
    cache.set('key1', 'value1');
    const result = cache.get('key1');
    expect(result).not.toBeNull();
    expect(result!.data).toBe('value1');
  });

  it('expires entries after TTL', () => {
    const cache = new LRUCache<string>({ ttlMs: 1000 });
    cache.set('key1', 'value1');

    vi.advanceTimersByTime(1001);

    expect(cache.get('key1')).toBeNull();
  });

  it('returns stale data with staleWhileRevalidate', () => {
    const cache = new LRUCache<string>({ ttlMs: 1000, staleWhileRevalidate: true });
    cache.set('key1', 'value1');

    vi.advanceTimersByTime(1001);

    const result = cache.get('key1');
    expect(result).not.toBeNull();
    expect(result!.data).toBe('value1');
    expect(result!.stale).toBe(true);
  });

  it('evicts oldest entry when maxSize reached', () => {
    const cache = new LRUCache<string>({ ttlMs: 10000, maxSize: 2 });
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).not.toBeNull();
    expect(cache.get('key3')).not.toBeNull();
  });

  it('LRU order: recently accessed items survive eviction', () => {
    const cache = new LRUCache<string>({ ttlMs: 10000, maxSize: 2 });
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');

    // Access key1 to make it recent
    cache.get('key1');

    // key2 is now oldest, should be evicted
    cache.set('key3', 'value3');

    expect(cache.get('key1')).not.toBeNull();
    expect(cache.get('key2')).toBeNull();
    expect(cache.get('key3')).not.toBeNull();
  });

  it('delete removes an entry', () => {
    const cache = new LRUCache<string>({ ttlMs: 1000 });
    cache.set('key1', 'value1');
    cache.delete('key1');
    expect(cache.get('key1')).toBeNull();
  });

  it('clear removes all entries', () => {
    const cache = new LRUCache<string>({ ttlMs: 1000 });
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('stats returns current state', () => {
    const cache = new LRUCache<string>({ ttlMs: 5000, maxSize: 100 });
    cache.set('key1', 'value1');
    const stats = cache.stats();
    expect(stats.size).toBe(1);
    expect(stats.maxSize).toBe(100);
    expect(stats.ttlMs).toBe(5000);
  });

  it('revalidation tracking works', () => {
    const cache = new LRUCache<string>({ ttlMs: 1000 });
    expect(cache.isRevalidating('key1')).toBe(false);

    cache.startRevalidation('key1');
    expect(cache.isRevalidating('key1')).toBe(true);

    cache.endRevalidation('key1');
    expect(cache.isRevalidating('key1')).toBe(false);
  });

  it('marks entries as stale when approaching TTL (80% threshold)', () => {
    const cache = new LRUCache<string>({ ttlMs: 1000 });
    cache.set('key1', 'value1');

    // At 80% of TTL, entry should be stale
    vi.advanceTimersByTime(810);

    const result = cache.get('key1');
    expect(result).not.toBeNull();
    expect(result!.stale).toBe(true);
  });
});
