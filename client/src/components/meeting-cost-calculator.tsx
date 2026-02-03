import { useState, useMemo } from 'react';
import { Calculator, DollarSign, Clock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface MeetingCostCalculatorProps {
  participantCount: number;
  defaultDurationMinutes?: number;
}

export function MeetingCostCalculator({ 
  participantCount, 
  defaultDurationMinutes = 60 
}: MeetingCostCalculatorProps) {
  const [open, setOpen] = useState(false);
  const [hourlyRate, setHourlyRate] = useState<string>('75');
  const [durationMinutes, setDurationMinutes] = useState<number>(defaultDurationMinutes);

  const costs = useMemo(() => {
    const rate = parseFloat(hourlyRate) || 0;
    const hours = durationMinutes / 60;
    const perPersonCost = rate * hours;
    const totalCost = perPersonCost * participantCount;
    
    return {
      perPersonCost: perPersonCost.toFixed(2),
      totalCost: totalCost.toFixed(2),
      hourlyTotal: (rate * participantCount).toFixed(2),
    };
  }, [hourlyRate, durationMinutes, participantCount]);

  const presetDurations = [30, 60, 90, 120];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 text-[10px] text-muted-foreground hover:text-primary gap-1"
          data-testid="button-meeting-cost"
        >
          <Calculator size={12} /> Meeting Cost
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-white/10 w-[95%] max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator size={18} className="text-primary" />
            Meeting Cost Calculator
          </DialogTitle>
          <DialogDescription>
            Estimate the financial impact of this group session.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-5 pt-2">
          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <DollarSign size={12} /> Average Hourly Rate
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                type="number"
                min="0"
                step="5"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                className="bg-white/5 border-white/10 pl-7 h-10"
                placeholder="75"
                data-testid="input-hourly-rate"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">Average cost per person per hour</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Clock size={12} /> Duration
            </Label>
            <div className="flex gap-2">
              {presetDurations.map((mins) => (
                <button
                  key={mins}
                  onClick={() => setDurationMinutes(mins)}
                  className={cn(
                    "flex-1 h-9 rounded-lg border text-xs font-medium transition-all",
                    durationMinutes === mins 
                      ? "bg-primary text-black border-primary font-bold" 
                      : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                  )}
                  data-testid={`button-duration-${mins}`}
                >
                  {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Users size={12} /> Participants
            </Label>
            <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
              {participantCount} {participantCount === 1 ? 'person' : 'people'}
            </div>
          </div>

          <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Per person</span>
              <span className="font-medium">${costs.perPersonCost}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Hourly burn rate</span>
              <span className="font-medium">${costs.hourlyTotal}/hr</span>
            </div>
            <div className="border-t border-white/10 pt-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Total Meeting Cost</span>
                <span className="text-2xl font-bold text-primary" data-testid="text-total-cost">
                  ${costs.totalCost}
                </span>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground text-center">
            This estimate helps visualize the value of everyone's time.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
