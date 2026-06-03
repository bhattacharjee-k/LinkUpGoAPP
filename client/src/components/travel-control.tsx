import React from 'react';
import { Input } from '@/components/ui/input';
import { Footprints, Train, Car } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TravelControlProps {
  neighborhood: string;
  onNeighborhoodChange: (v: string) => void;
  mode: 'walk' | 'transit' | 'car';
  onModeChange: (m: 'walk' | 'transit' | 'car') => void;
  toleranceMin: number;
  onToleranceChange: (n: number) => void;
  placeholder?: string;
}

export function TravelControl({
  neighborhood,
  onNeighborhoodChange,
  mode,
  onModeChange,
  toleranceMin,
  onToleranceChange,
  placeholder = 'e.g. East Village',
}: TravelControlProps) {
  const modes = [
    { id: 'walk', label: 'Walk', icon: Footprints },
    { id: 'transit', label: 'Transit', icon: Train },
    { id: 'car', label: 'Car', icon: Car },
  ] as const;

  const toleranceOptions = [15, 30, 45, 60];

  const handleModeClick = (newMode: 'walk' | 'transit' | 'car') => {
    onModeChange(newMode);
    const defaultTolerance = {
      walk: 15,
      transit: 30,
      car: 45,
    }[newMode];
    onToleranceChange(defaultTolerance);
  };

  return (
    <div className="space-y-3.5 w-full">
      {/* Starting Neighborhood Section */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground block">
          Coming from
        </label>
        <Input
          placeholder={placeholder}
          className="bg-white/5 border-white/10 h-9 text-sm w-full focus-visible:ring-primary"
          value={neighborhood}
          onChange={(e) => onNeighborhoodChange(e.target.value)}
          data-testid="input-starting-neighborhood"
        />
      </div>

      {/* Transport Mode Chips Section */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground block">
          How are you traveling?
        </label>
        <div className="flex gap-2">
          {modes.map(({ id, label, icon: Icon }) => {
            const active = mode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleModeClick(id)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 cursor-pointer flex-1 justify-center",
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-[0_0_10px_rgba(182,255,46,0.2)] font-semibold"
                    : "bg-white/5 border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
                )}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Travel Tolerance Options Section */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <label className="text-xs font-semibold text-muted-foreground">
            Willing to travel · by {mode}
          </label>
          <span className="text-xs font-bold text-primary">
            {toleranceMin} mins
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
          {toleranceOptions.map((mins) => {
            const active = toleranceMin === mins;
            return (
              <button
                key={mins}
                type="button"
                onClick={() => onToleranceChange(mins)}
                className={cn(
                  "py-1.5 rounded-md text-xs font-medium transition-all duration-200 cursor-pointer text-center",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                )}
              >
                {mins}m
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
