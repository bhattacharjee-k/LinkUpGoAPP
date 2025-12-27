import React, { useState } from 'react';
import { useApp } from '@/lib/context';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronRight, MapPin, Ban } from 'lucide-react';
import { City, Budget, Energy, Category, HardNo } from '@/lib/store';
import { cn } from '@/lib/utils';

export function Onboarding() {
  const { setUser } = useApp();
  const [_, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  
  const [formData, setFormData] = useState({
    name: '',
    city: 'NYC' as City,
    budget: ['$$'] as Budget[],
    energy: 'Vibey' as Energy,
    categories: [] as Category[],
    hardNos: [] as string[],
  });

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      // Finish
      setUser({
        id: Math.random().toString(36),
        ...formData,
      });
      
      // Check for returnTo param
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get('returnTo');
      
      if (returnTo) {
          setLocation(decodeURIComponent(returnTo));
      } else {
          setLocation('/');
      }
    }
  };

  const toggleCategory = (c: Category) => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(c)
        ? prev.categories.filter(x => x !== c)
        : [...prev.categories, c]
    }));
  };

  const toggleHardNo = (h: string) => {
    setFormData(prev => ({
      ...prev,
      hardNos: prev.hardNos.includes(h)
        ? prev.hardNos.filter(x => x !== h)
        : [...prev.hardNos, h]
    }));
  };

  const INTEREST_GROUPS: { name: string; items: Category[] }[] = [
    { name: 'Food & Drink', items: ['Dinner', 'Brunch', 'Coffee', 'Cocktails', 'Wine Bar', 'Brewery', 'Dive Bar'] },
    { name: 'Going Out', items: ['Rooftop', 'Speakeasy', 'Club', 'Live Music', 'Dancing', 'Lounge'] },
    { name: 'Activities', items: ['Activity', 'Bowling', 'Karaoke', 'Comedy', 'Arcade', 'Museum', 'Walk'] },
    { name: 'Social Modes', items: ['Conversation', 'Meeting New People', 'Big Group', 'Date Night'] },
  ];

  const HARD_NOS = ['Clubs', 'Loud places', 'Ticketed events', 'Late nights', 'Expensive spots'];

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
          <div className="text-primary font-bold tracking-widest text-xs uppercase">Step {step} of 4</div>
          <h1 className="text-4xl font-display font-bold text-white leading-tight">
            {step === 1 && "Let's get your profile set up."}
            {step === 2 && "What are you into?"}
            {step === 3 && "What's your usual vibe?"}
            {step === 4 && "Any hard no's?"}
          </h1>
          <p className="text-muted-foreground text-lg">
             {step === 2 && "Pick anything you’re usually open to — we’ll learn your real preferences as you plan."}
             {step === 3 && "This sets your baseline, but you can change it for every plan."}
             {step === 4 && "We'll hide these types of places from your suggestions."}
          </p>
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
          <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
             {INTEREST_GROUPS.map((group) => (
                 <div key={group.name} className="space-y-3">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">{group.name}</Label>
                    <div className="flex flex-wrap gap-2">
                        {group.items.map((c) => (
                            <button
                            key={c}
                            onClick={() => toggleCategory(c)}
                            className={cn(
                                "px-4 py-2 rounded-full border border-white/10 font-medium transition-all text-sm",
                                formData.categories.includes(c) 
                                    ? "bg-primary/20 border-primary text-primary hover:bg-primary/30" 
                                    : "bg-white/5 hover:bg-white/10 text-muted-foreground"
                            )}
                            >
                            {c}
                            </button>
                        ))}
                    </div>
                 </div>
             ))}
          </div>
        )}

        {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3">
                {['Chill', 'Vibey', 'Going out', 'Full send'].map((e) => (
                  <button
                    key={e}
                    onClick={() => setFormData({...formData, energy: e as Energy})}
                    className={cn(
                      "h-16 rounded-xl border border-white/10 flex items-center px-6 transition-all",
                      formData.energy === e 
                        ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" 
                        : "bg-white/5 hover:bg-white/10 text-muted-foreground"
                    )}
                  >
                    <span className="text-lg font-bold">{e}</span>
                  </button>
                ))}
              </div>
            </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              {HARD_NOS.map((h) => (
                <button
                  key={h}
                  onClick={() => toggleHardNo(h)}
                  className={cn(
                    "h-14 rounded-xl border border-white/10 flex items-center justify-between px-6 transition-all",
                    formData.hardNos.includes(h)
                      ? "bg-red-500/20 text-red-400 border-red-500/50"
                      : "bg-white/5 hover:bg-white/10 text-muted-foreground"
                  )}
                >
                  <span className="font-medium">{h}</span>
                  {formData.hardNos.includes(h) && <Ban size={18} />}
                </button>
              ))}
            </div>
            <p className="text-xs text-center text-muted-foreground pt-4">
                Optional — you can skip this if you're open to everything.
            </p>
          </div>
        )}

        <Button 
          onClick={handleNext} 
          className="w-full h-14 text-lg font-bold rounded-xl shadow-lg shadow-primary/20"
          disabled={step === 1 && !formData.name}
        >
          {step === 4 ? "Complete Profile" : "Next"} <ChevronRight className="ml-2" />
        </Button>
      </motion.div>
    </div>
  );
}
