import React, { useState, useEffect } from 'react';
import { api, type GroupAggregateResponse } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, Zap, MapPin, Car, Footprints, Train, Compass } from 'lucide-react';

interface GroupReconciliationProps {
  sessionId: string;
  session?: any;
}

export function GroupReconciliation({ sessionId, session }: GroupReconciliationProps) {
  const [aggregate, setAggregate] = useState<GroupAggregateResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    
    async function fetchAggregate() {
      setLoading(true);
      try {
        const data = await api.sessions.getAggregate(sessionId);
        if (active) {
          setAggregate(data);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to fetch aggregate data');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    if (sessionId) {
      fetchAggregate();
    }

    return () => {
      active = false;
    };
  }, [sessionId, session]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 w-full" data-testid="group-reconciliation-loading">
        <Skeleton className="h-28 bg-white/5 border border-white/10 rounded-2xl animate-pulse" />
        <Skeleton className="h-28 bg-white/5 border border-white/10 rounded-2xl animate-pulse" />
        <Skeleton className="h-28 bg-white/5 border border-white/10 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (error || !aggregate || aggregate.memberCount === 0) {
    return null;
  }

  const { budget, energy, travel } = aggregate;

  // BUDGET CARD Dynamic Description
  const getBudgetDescription = (tier: number, label: string) => {
    if (tier <= 1) {
      return "Extremely wallet-friendly — cheap eats, casual spots, and keeping costs low.";
    }
    if (tier === 2) {
      return "Mostly wallet-friendly tonight — we'll still slip in a standout worth a small stretch.";
    }
    if (tier === 3) {
      return "A bit more upscale — nice sit-down spots, craft drinks, and an elevated vibe.";
    }
    return "Splurge-worthy experience — fine dining, premium venues, and going all out.";
  };

  // ENERGY CARD Calculations
  const energySplitEntries = Object.entries(energy.split || {}).filter(([_, count]) => count > 0);
  const totalEnergyVotes = energySplitEntries.reduce((sum, [_, count]) => sum + count, 0);

  // Energy splitting visual colors
  const getEnergyColorClass = (category: string) => {
    switch (category.toLowerCase()) {
      case 'chill':
        return 'bg-emerald-500';
      case 'vibey':
        return 'bg-blue-500';
      case 'going out':
      case 'going_out':
        return 'bg-amber-500';
      case 'full send':
      case 'full_send':
        return 'bg-rose-500';
      default:
        return 'bg-primary';
    }
  };

  const getEnergyLabel = (category: string) => {
    switch (category.toLowerCase()) {
      case 'chill':
        return 'Chill';
      case 'vibey':
        return 'Vibey';
      case 'going out':
      case 'going_out':
        return 'Going out';
      case 'full send':
      case 'full_send':
        return 'Full send';
      default:
        return category;
    }
  };

  const energySplitsText = energySplitEntries
    .map(([key, count]) => `${count} ${getEnergyLabel(key)}`)
    .join(' · ');

  // Get dynamic descriptions based on the blend/target to make it premium
  const getEnergyDescription = (target: string, split: Record<string, number>) => {
    const keys = Object.keys(split).map(k => k.toLowerCase());
    const hasChill = keys.includes('chill');
    const hasHigh = keys.includes('going out') || keys.includes('going_out') || keys.includes('full send') || keys.includes('full_send');
    
    if (hasChill && hasHigh) {
      return "We won't force it — favoring spots with a calmer corner so the low-key crowd isn't stuck.";
    }
    
    switch (target?.toLowerCase()) {
      case 'chill':
        return "Leaning low-key — we'll prioritize intimate spots, cozy seating, and warm atmospheres.";
      case 'vibey':
        return "Buzzy but comfortable — we'll find standout places with solid music and space to actually talk.";
      case 'going out':
      case 'going_out':
        return "Leaning lively — we'll highlight places with high energy, great crowds, and an upbeat vibe.";
      case 'full send':
      case 'full_send':
        return "High-octane tonight — we'll focus on the town's most energetic venues and premium late-night spots.";
      default:
        return "Tuned to the group's mood tonight — finding spots that hit the sweet spot.";
    }
  };

  // TRAVEL CARD Icon selection
  const getModeIcon = (mode: string | null) => {
    if (!mode) return <Compass size={14} className="text-muted-foreground shrink-0" />;
    switch (mode.toLowerCase()) {
      case 'walk':
        return <Footprints size={14} className="text-emerald-400 shrink-0" />;
      case 'transit':
        return <Train size={14} className="text-blue-400 shrink-0" />;
      case 'car':
        return <Car size={14} className="text-amber-400 shrink-0" />;
      default:
        return <Compass size={14} className="text-muted-foreground shrink-0" />;
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full" data-testid="group-reconciliation">
      {/* BUDGET CARD */}
      <Card className="bg-white/5 border-white/10 shadow-2xl backdrop-blur-md flex flex-col justify-between rounded-2xl overflow-hidden transition-all duration-300 hover:border-white/15 hover:bg-white/[0.07]" data-testid="budget-card">
        <CardHeader className="p-4 pb-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <DollarSign size={14} className="shrink-0" />
              <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">Budget Profile</span>
            </div>
            {budget.comfortTier === 2 && (
              <Badge variant="outline" className="text-[9px] uppercase font-bold py-0.5 px-1.5 border-amber-500/20 text-amber-400 bg-amber-500/5 select-none">
                Soft Limit
              </Badge>
            )}
          </div>
          <CardTitle className="text-sm font-extrabold text-white">
            Comfortable at {budget.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 text-xs text-muted-foreground leading-relaxed flex-1 flex items-end">
          <p>{getBudgetDescription(budget.comfortTier, budget.label)}</p>
        </CardContent>
      </Card>

      {/* ENERGY CARD */}
      <Card className="bg-white/5 border-white/10 shadow-2xl backdrop-blur-md flex flex-col justify-between rounded-2xl overflow-hidden transition-all duration-300 hover:border-white/15 hover:bg-white/[0.07]" data-testid="energy-card">
        <CardHeader className="p-4 pb-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-amber-400">
              <Zap size={14} className="shrink-0" />
              <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">Energy Level</span>
            </div>
            {energy.target && (
              <Badge variant="outline" className="text-[9px] uppercase font-bold py-0.5 px-1.5 border-amber-500/20 text-amber-400 bg-amber-500/5 select-none">
                leaning {energy.target}
              </Badge>
            )}
          </div>
          <CardTitle className="text-sm font-extrabold text-white">
            {energySplitsText || 'Mixed Vibes'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 flex-1 flex flex-col justify-end space-y-3">
          {totalEnergyVotes > 0 ? (
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden flex">
              {energySplitEntries.map(([category, count]) => {
                const pct = (count / totalEnergyVotes) * 100;
                return (
                  <div
                    key={category}
                    className={`${getEnergyColorClass(category)} transition-all duration-300`}
                    style={{ width: `${pct}%` }}
                    title={`${getEnergyLabel(category)}: ${count} (${Math.round(pct)}%)`}
                  />
                );
              })}
            </div>
          ) : (
            <div className="w-full h-2 bg-white/10 rounded-full" />
          )}
          <p className="text-[11px] text-muted-foreground leading-snug">
            {getEnergyDescription(energy.target, energy.split || {})}
          </p>
        </CardContent>
      </Card>

      {/* TRAVEL CARD */}
      <Card className="bg-white/5 border-white/10 shadow-2xl backdrop-blur-md flex flex-col rounded-2xl overflow-hidden transition-all duration-300 hover:border-white/15 hover:bg-white/[0.07]" data-testid="travel-card">
        <CardHeader className="p-4 pb-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-blue-400">
              <MapPin size={14} className="shrink-0" />
              <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">Getting There</span>
            </div>
            <Badge variant="outline" className="text-[9px] uppercase font-bold py-0.5 px-1.5 border-emerald-500/20 text-emerald-400 bg-emerald-500/5 select-none">
              all within limit
            </Badge>
          </div>
          <CardTitle className="text-sm font-extrabold text-white">
            Squad Travel
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 flex-1 overflow-y-auto max-h-[140px] scrollbar-thin">
          <div className="space-y-2.5">
            {travel.members && travel.members.length > 0 ? (
              travel.members.map((member) => (
                <div key={member.name} className="flex flex-col gap-1 py-1 border-b border-white/5 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0 max-w-[70%]">
                      {getModeIcon(member.mode)}
                      <span className="font-semibold truncate text-white">{member.name}</span>
                      <span className="text-muted-foreground truncate">
                        · from {member.neighborhood ?? '—'}
                      </span>
                    </div>
                    <div className="text-muted-foreground shrink-0 text-right text-[10px]">
                      {member.toleranceMin ? `${member.toleranceMin}m max` : '—'}
                    </div>
                  </div>
                  
                  {member.toleranceMin && (
                    <div className="w-full flex items-center h-1 bg-white/5 rounded-full overflow-hidden mt-0.5">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          member.toleranceMin <= 15 ? 'bg-emerald-500' :
                          member.toleranceMin <= 30 ? 'bg-blue-500' : 'bg-amber-500'
                        }`} 
                        style={{ width: `${Math.min(100, (member.toleranceMin / 60) * 100)}%` }} 
                      />
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No travel preferences shared yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
