import React, { useState, useEffect } from 'react';
import {
  ENERGY_BANDS,
  type EnergyLevel,
  bandForNii,
  niiCenterForLevel,
} from '@shared/energy';
import { cn } from '@/lib/utils';
import { Zap } from 'lucide-react';

interface EnergySliderProps {
  value: EnergyLevel;
  onChange: (level: EnergyLevel) => void;
}

export function EnergySlider({ value, onChange }: EnergySliderProps) {
  const [sliderValue, setSliderValue] = useState(() => niiCenterForLevel(value));

  // Sync internal state if the prop changes to a different band
  useEffect(() => {
    if (bandForNii(sliderValue) !== value) {
      setSliderValue(niiCenterForLevel(value));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    setSliderValue(newValue);
    const derivedLevel = bandForNii(newValue);
    if (derivedLevel !== value) {
      onChange(derivedLevel);
    }
  };

  const currentBand = ENERGY_BANDS[value];

  return (
    <div className="space-y-3 w-full bg-white/5 border border-white/10 rounded-xl p-4 transition-all duration-200 hover:border-white/20">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">
          <Zap size={13} className="text-primary animate-pulse" />
          <span>Vibe Level</span>
        </div>
        <span className="text-sm font-bold text-primary px-2.5 py-0.5 rounded-full bg-primary/10">
          {value}
        </span>
      </div>

      <div className="relative pt-1">
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={sliderValue}
          onChange={handleChange}
          className={cn(
            "w-full h-2 rounded-full appearance-none cursor-pointer outline-none transition-all",
            "bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500",
            "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            // Webkit thumb styling (Chrome, Safari, Edge)
            "[&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:h-5",
            "[&::-webkit-slider-thumb]:w-5",
            "[&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:bg-white",
            "[&::-webkit-slider-thumb]:border-2",
            "[&::-webkit-slider-thumb]:border-primary",
            "[&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(245,158,11,0.5)]",
            "[&::-webkit-slider-thumb]:transition-all",
            "[&::-webkit-slider-thumb]:duration-150",
            "[&::-webkit-slider-thumb]:active:scale-125",
            "[&::-webkit-slider-thumb]:active:bg-primary",
            "[&::-webkit-slider-thumb]:hover:brightness-110",
            // Mozilla thumb styling (Firefox)
            "[&::-moz-range-thumb]:h-5",
            "[&::-moz-range-thumb]:w-5",
            "[&::-moz-range-thumb]:rounded-full",
            "[&::-moz-range-thumb]:bg-white",
            "[&::-moz-range-thumb]:border-2",
            "[&::-moz-range-thumb]:border-primary",
            "[&::-moz-range-thumb]:shadow-[0_0_10px_rgba(245,158,11,0.5)]",
            "[&::-moz-range-thumb]:transition-all",
            "[&::-moz-range-thumb]:duration-150",
            "[&::-moz-range-thumb]:active:scale-125",
            "[&::-moz-range-thumb]:active:bg-primary",
            "[&::-moz-range-thumb]:hover:brightness-110"
          )}
        />
      </div>

      <div className="flex justify-between px-1 text-[10px] font-semibold select-none text-muted-foreground/80">
        {(['Chill', 'Vibey', 'Going out', 'Full send'] as const).map((lvl) => (
          <button
            type="button"
            key={lvl}
            className={cn(
              "transition-all duration-200 hover:text-foreground active:scale-95",
              value === lvl ? "text-primary font-bold scale-105" : ""
            )}
            onClick={() => {
              onChange(lvl);
              setSliderValue(niiCenterForLevel(lvl));
            }}
          >
            {lvl}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground/90 bg-white/5 border border-white/5 rounded-lg p-2.5 min-h-[48px] flex items-center justify-center text-center italic">
        {currentBand.anchor}
      </p>
    </div>
  );
}
