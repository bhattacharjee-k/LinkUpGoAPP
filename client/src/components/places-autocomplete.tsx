import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { X, MapPin, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface PlacesAutocompleteProps {
  selectedPlaces: PlaceResult[];
  onPlacesChange: (places: PlaceResult[]) => void;
  maxPlaces?: number;
  city?: string;
  placeholder?: string;
}

export function PlacesAutocomplete({
  selectedPlaces,
  onPlacesChange,
  maxPlaces = 3,
  city = 'NYC',
  placeholder = 'Search for a place...',
}: PlacesAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchPlaces = async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/places/autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: searchQuery, city }),
      });

      if (!response.ok) throw new Error('Search failed');

      const data = await response.json();
      setSuggestions(data.places || []);
    } catch (error) {
      console.error('Places search error:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (value: string) => {
    setQuery(value);
    setShowSuggestions(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchPlaces(value), 300);
  };

  const handleSelectPlace = (place: PlaceResult) => {
    if (selectedPlaces.length >= maxPlaces) return;
    if (selectedPlaces.some(p => p.placeId === place.placeId)) return;

    onPlacesChange([...selectedPlaces, place]);
    setQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleRemovePlace = (placeId: string) => {
    onPlacesChange(selectedPlaces.filter(p => p.placeId !== placeId));
  };

  const canAddMore = selectedPlaces.length < maxPlaces;

  return (
    <div className="space-y-3" ref={containerRef}>
      {selectedPlaces.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedPlaces.map(place => (
            <div
              key={place.placeId}
              className="flex items-center gap-2 px-3 py-2 rounded-full bg-primary/20 border border-primary/30 text-sm"
            >
              <MapPin size={14} className="text-primary" />
              <span className="max-w-[150px] truncate">{place.name}</span>
              <button
                onClick={() => handleRemovePlace(place.placeId)}
                className="hover:text-red-400 transition-colors"
                data-testid={`remove-place-${place.placeId}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {canAddMore && (
        <div className="relative">
          <Input
            value={query}
            onChange={e => handleInputChange(e.target.value)}
            onFocus={() => query.length >= 2 && setShowSuggestions(true)}
            placeholder={placeholder}
            className="bg-white/5 border-white/10 h-12"
            data-testid="input-place-search"
          />
          {isLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
            </div>
          )}

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-background border border-white/10 rounded-lg shadow-xl overflow-hidden">
              {suggestions.map(place => (
                <button
                  key={place.placeId}
                  onClick={() => handleSelectPlace(place)}
                  className={cn(
                    "w-full px-4 py-3 text-left hover:bg-white/10 transition-colors flex items-start gap-3 border-b border-white/5 last:border-0",
                    selectedPlaces.some(p => p.placeId === place.placeId) && "opacity-50 cursor-not-allowed"
                  )}
                  disabled={selectedPlaces.some(p => p.placeId === place.placeId)}
                  data-testid={`select-place-${place.placeId}`}
                >
                  <MapPin size={16} className="mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{place.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{place.address}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!canAddMore && (
        <p className="text-xs text-muted-foreground">Maximum {maxPlaces} places selected</p>
      )}
    </div>
  );
}
