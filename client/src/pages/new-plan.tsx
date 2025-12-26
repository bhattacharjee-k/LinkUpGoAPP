import React, { useState } from 'react';
import { useApp } from '@/lib/context';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar as CalendarIcon, Clock, ChevronRight, MapPin, DollarSign } from 'lucide-react';
import { City, Budget, Energy, Category } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";

export function NewPlan() {
  const { startSession, user } = useApp();
  const [_, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  
  const [formData, setFormData] = useState({
    date: new Date(),
    timeStart: '19:00',
    timeEnd: '22:00',
    flexibility: 'strict', // strict, flexible
    locationScope: user?.city || 'NYC',
    budget: '$$' as Budget,
    energy: user?.energy || 'Social',
    categories: [] as Category[],
  });

  const handleCreate = () => {
    if (!user) return;
    
    // Format "Day-TimeBlock" approximation for the MVP data model compatibility
    // In a real app we'd switch to real timestamps, but for this mock we'll map roughly
    const hour = parseInt(formData.timeStart.split(':')[0]);
    let timeWindow = 'Fri-Night'; // Default fallback
    
    const dayName = format(formData.date, 'EEE'); // Mon, Tue...
    let timeBlock = 'Night';
    if (hour < 17) timeBlock = 'Day';
    else if (hour < 20) timeBlock = 'Evening';
    
    timeWindow = `${dayName}-${timeBlock}`;

    const id = startSession('g1', {
        timeWindow, // Using the computed window for compatibility
        locationScope: formData.locationScope,
        category: formData.categories.length > 0 ? formData.categories : ['Drinks'],
        energy: formData.energy,
        budget: formData.budget,
        // New fields for specific time would go here in a real backend
        specificDate: formData.date,
        specificTime: `${formData.timeStart}-${formData.timeEnd}`
    });
    setLocation(`/session/${id}`);
  };

  const toggleCategory = (c: Category) => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(c)
        ? prev.categories.filter(x => x !== c)
        : [...prev.categories, c]
    }));
  };

  return (
    <div className="min-h-screen bg-background flex flex-col px-6 py-6 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-purple-500/20 rounded-full blur-[100px]" />
      
      <div className="z-10 w-full max-w-md mx-auto flex-1 flex flex-col">
        <div className="mb-8">
            <Button variant="ghost" className="pl-0 hover:bg-transparent text-muted-foreground" onClick={() => setLocation('/')}>
                ← Cancel
            </Button>
            <h1 className="text-3xl font-display font-bold mt-2">New Plan</h1>
            <p className="text-muted-foreground">Set the time, then finding the vibe.</p>
        </div>

        <div className="space-y-8 flex-1">
            {/* Date & Time Selection */}
            <div className="space-y-4">
                <Label className="text-lg">When?</Label>
                
                <div className="flex gap-4">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={cn(
                                    "w-full justify-start text-left font-normal bg-white/5 border-white/10 h-12",
                                    !formData.date && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {formData.date ? format(formData.date, "PPP") : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-card border-white/10" align="start">
                            <Calendar
                                mode="single"
                                selected={formData.date}
                                onSelect={(d) => d && setFormData({...formData, date: d})}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Start</Label>
                        <Input 
                            type="time" 
                            className="bg-white/5 border-white/10" 
                            value={formData.timeStart}
                            onChange={e => setFormData({...formData, timeStart: e.target.value})}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">End</Label>
                        <Input 
                            type="time" 
                            className="bg-white/5 border-white/10"
                            value={formData.timeEnd}
                            onChange={e => setFormData({...formData, timeEnd: e.target.value})}
                        />
                    </div>
                </div>
            </div>

            {/* Vibe Constraints */}
            <div className="space-y-4 pt-4 border-t border-white/10">
                <Label className="text-lg">The Vibe?</Label>
                
                <div className="space-y-3">
                    <Label className="text-xs text-muted-foreground">Budget</Label>
                    <div className="flex gap-2">
                        {['$', '$$', '$$$', '$$$$'].map((b) => (
                        <button
                            key={b}
                            onClick={() => setFormData({...formData, budget: b as Budget})}
                            className={cn(
                            "flex-1 h-10 rounded-lg border border-white/10 font-bold transition-all text-sm",
                            formData.budget === b ? "bg-green-500/20 text-green-400 border-green-500/50" : "bg-white/5 text-muted-foreground"
                            )}
                        >
                            {b}
                        </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-3">
                    <Label className="text-xs text-muted-foreground">Energy</Label>
                    <div className="grid grid-cols-3 gap-2">
                        {['Chill', 'Social', 'Party'].map((e) => (
                        <button
                            key={e}
                            onClick={() => setFormData({...formData, energy: e as Energy})}
                            className={cn(
                            "h-10 rounded-lg border border-white/10 text-sm font-medium transition-all",
                            formData.energy === e ? "bg-primary text-white border-primary" : "bg-white/5 text-muted-foreground"
                            )}
                        >
                            {e}
                        </button>
                        ))}
                    </div>
                </div>
                
                 <div className="space-y-3">
                    <Label className="text-xs text-muted-foreground">Category (Optional)</Label>
                    <div className="flex flex-wrap gap-2">
                        {['Dinner', 'Drinks', 'Activity', 'Club'].map((c) => (
                        <button
                            key={c}
                            onClick={() => toggleCategory(c as Category)}
                            className={cn(
                            "px-3 py-2 rounded-lg border border-white/10 text-xs font-medium transition-all",
                            formData.categories.includes(c as Category) ? "bg-white/10 border-primary text-primary" : "bg-white/5 text-muted-foreground"
                            )}
                        >
                            {c}
                        </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>

        <Button 
          onClick={handleCreate} 
          className="w-full h-14 text-lg font-bold rounded-xl shadow-lg shadow-primary/20 mt-8"
        >
          Find Options <ChevronRight className="ml-2" />
        </Button>
      </div>
    </div>
  );
}
