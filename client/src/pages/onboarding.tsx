import React, { useState } from 'react';
import { useApp } from '@/lib/context';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, ChevronRight, MapPin, DollarSign, Zap } from 'lucide-react';
import { City, Budget, Energy, Category } from '@/lib/store';
import { cn } from '@/lib/utils';

export function Onboarding() {
  const { setUser } = useApp();
  const [_, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  
  const [formData, setFormData] = useState({
    name: '',
    city: 'NYC' as City,
    budget: ['$$'] as Budget[],
    energy: 'Social' as Energy,
    categories: [] as Category[],
  });

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      // Finish
      setUser({
        id: Math.random().toString(36),
        ...formData,
        hardNos: [], // Default for now
      });
      setLocation('/');
    }
  };

  const toggleBudget = (b: Budget) => {
    setFormData(prev => ({
      ...prev,
      budget: prev.budget.includes(b) 
        ? prev.budget.filter(x => x !== b)
        : [...prev.budget, b]
    }));
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
    <div className="min-h-screen bg-background flex flex-col justify-center px-6 py-10 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-primary/20 rounded-full blur-[100px]" />
      
      <motion.div 
        key={step}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="z-10 w-full max-w-md mx-auto space-y-8"
      >
        <div className="space-y-2">
          <div className="text-primary font-bold tracking-widest text-xs uppercase">Step {step} of 3</div>
          <h1 className="text-4xl font-display font-bold text-white leading-tight">
            {step === 1 && "Let's get your profile set up."}
            {step === 2 && "What's your vibe?"}
            {step === 3 && "What do you like to do?"}
          </h1>
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="Alex Smith"
                className="bg-white/5 border-white/10 h-12 text-lg"
              />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <div className="grid grid-cols-2 gap-4">
                {['NYC', 'Chicago'].map((city) => (
                  <button
                    key={city}
                    onClick={() => setFormData({...formData, city: city as City})}
                    className={cn(
                      "h-14 rounded-xl border border-white/10 flex items-center justify-center gap-2 font-medium transition-all",
                      formData.city === city ? "bg-primary text-white border-primary" : "bg-white/5 hover:bg-white/10"
                    )}
                  >
                    <MapPin size={18} /> {city}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-8">
             <div className="space-y-3">
              <Label>Budget Comfort Zone</Label>
              <div className="flex gap-3">
                {['$', '$$', '$$$', '$$$$'].map((b) => (
                  <button
                    key={b}
                    onClick={() => toggleBudget(b as Budget)}
                    className={cn(
                      "flex-1 h-12 rounded-lg border border-white/10 font-bold transition-all",
                      formData.budget.includes(b as Budget) ? "bg-green-500/20 text-green-400 border-green-500/50" : "bg-white/5 text-muted-foreground"
                    )}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Default Energy</Label>
              <div className="grid grid-cols-3 gap-3">
                {['Chill', 'Social', 'Party'].map((e) => (
                  <button
                    key={e}
                    onClick={() => setFormData({...formData, energy: e as Energy})}
                    className={cn(
                      "h-12 rounded-lg border border-white/10 text-sm font-medium transition-all",
                      formData.energy === e ? "bg-primary text-white border-primary" : "bg-white/5 text-muted-foreground"
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
             <div className="grid grid-cols-2 gap-3">
              {['Dinner', 'Drinks', 'Activity', 'Club', 'Brunch', 'Cafe'].map((c) => (
                <button
                  key={c}
                  onClick={() => toggleCategory(c as Category)}
                  className={cn(
                    "h-14 rounded-xl border border-white/10 font-medium transition-all text-left px-4 hover:bg-white/10",
                    formData.categories.includes(c as Category) ? "bg-white/10 border-primary text-primary" : "bg-white/5"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        <Button 
          onClick={handleNext} 
          className="w-full h-14 text-lg font-bold rounded-xl shadow-lg shadow-primary/20"
          disabled={step === 1 && !formData.name}
        >
          {step === 3 ? "Complete Profile" : "Next"} <ChevronRight className="ml-2" />
        </Button>
      </motion.div>
    </div>
  );
}
