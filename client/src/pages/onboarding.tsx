import React, { useState, useEffect } from 'react';
import { useApp } from '@/lib/context';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronRight, MapPin, Ban, AlertCircle } from 'lucide-react';
import { City, Budget, Energy, Category, HardNo } from '@/lib/store';
import { cn } from '@/lib/utils';

const RETURNING_USER_KEY = 'vibecheck_has_account';

export function Onboarding() {
  const { register, login } = useApp();
  const [_, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const hasAccount = localStorage.getItem(RETURNING_USER_KEY);
    if (hasAccount === 'true') {
      setIsReturningUser(true);
      setIsLoginMode(true);
    }
  }, []);
  
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    city: 'NYC' as City,
    budget: ['$$'] as Budget[],
    energy: 'Vibey' as Energy,
    categories: [] as Category[],
    hardNos: [] as string[],
  });

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      setError('');
      await login(formData.username, formData.password);
      
      localStorage.setItem(RETURNING_USER_KEY, 'true');
      
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get('returnTo');
      
      if (returnTo) {
        setLocation(decodeURIComponent(returnTo));
      } else {
        setLocation('/');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
      setIsLoading(false);
    }
  };

  const handleNext = async () => {
    if (step < 5) {
      setStep(step + 1);
    } else {
      // Finish - Register user
      try {
        setIsLoading(true);
        setError('');
        await register({
          username: formData.username,
          password: formData.password,
          name: formData.name,
          city: formData.city,
          budget: formData.budget,
          energy: formData.energy,
          categories: formData.categories,
          hardNos: formData.hardNos,
        });
        
        // Check for returnTo param
        const params = new URLSearchParams(window.location.search);
        const returnTo = params.get('returnTo');
        
        localStorage.setItem(RETURNING_USER_KEY, 'true');
        
        if (returnTo) {
            setLocation(decodeURIComponent(returnTo));
        } else {
            setLocation('/');
        }
      } catch (err: any) {
        // Show user-friendly error messages
        let errorMsg = err.message || 'Registration failed';
        if (errorMsg.includes('unique constraint') || errorMsg.includes('duplicate key')) {
          errorMsg = 'This username is already taken. Try a different one or sign in below.';
          setIsReturningUser(true);
          setIsLoginMode(true);
        }
        setError(errorMsg);
        setIsLoading(false);
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

  const isStep1Valid = formData.username.length > 0 && formData.password.length >= 6;
  const isStep2Valid = formData.name.length > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center px-6 py-10 relative overflow-hidden">
      <div className="absolute top-[-20%] right-[-10%] w-96 h-96 bg-primary/10 rounded-full blur-[120px]" />
      
      <motion.div 
        key={step}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="z-10 w-full max-w-md mx-auto space-y-8"
      >
        <div className="space-y-2">
          {!isLoginMode && <div className="text-primary font-bold tracking-widest text-xs uppercase" data-testid="text-step-indicator">Step {step} of 5</div>}
          <h1 className="text-4xl font-display font-bold text-white leading-tight" data-testid="text-step-title">
            {step === 1 && (isLoginMode ? "Welcome back!" : "Welcome to LinkUpGo.")}
            {step === 2 && "Tell us about yourself"}
            {step === 3 && "What are you into?"}
            {step === 4 && "What's your usual vibe?"}
            {step === 5 && "Any hard no's?"}
          </h1>
          <p className="text-muted-foreground text-lg">
             {step === 1 && (isLoginMode ? "Sign in to continue planning with friends." : "Create your account to start planning with friends.")}
             {step === 3 && "Pick anything you're usually open to — we'll learn your real preferences as you plan."}
             {step === 4 && "This sets your baseline, but you can change it for every plan."}
             {step === 5 && "We'll hide these types of places from your suggestions."}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl" data-testid="error-message">
            {error}
          </div>
        )}

        {step === 1 && isReturningUser && (
          <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 flex items-start gap-3" data-testid="returning-user-banner">
            <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-white font-medium">You already have an account</p>
              <p className="text-muted-foreground text-sm">Please sign in with your existing credentials below.</p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input 
                data-testid="input-username"
                value={formData.username}
                onChange={e => setFormData({...formData, username: e.target.value})}
                placeholder="alexsmith"
                className="bg-white/5 border-white/10 h-12 text-lg"
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input 
                data-testid="input-password"
                type="password"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
                placeholder="••••••••"
                className="bg-white/5 border-white/10 h-12 text-lg"
              />
              {!isLoginMode && <p className="text-xs text-muted-foreground">Minimum 6 characters</p>}
            </div>
            
            <button
              type="button"
              onClick={() => { setIsLoginMode(!isLoginMode); setError(''); }}
              className="text-sm text-primary hover:underline w-full text-center"
              data-testid="button-toggle-auth-mode"
            >
              {isLoginMode ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input 
                data-testid="input-name"
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
                    data-testid={`button-city-${city}`}
                    onClick={() => setFormData({...formData, city: city as City})}
                    className={cn(
                      "h-14 rounded-xl border border-white/10 flex items-center justify-center gap-2 font-medium transition-all",
                      formData.city === city ? "bg-primary text-black border-primary font-bold" : "bg-white/5 hover:bg-white/10"
                    )}
                  >
                    <MapPin size={18} /> {city}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
             {INTEREST_GROUPS.map((group) => (
                 <div key={group.name} className="space-y-3">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">{group.name}</Label>
                    <div className="flex flex-wrap gap-2">
                        {group.items.map((c) => (
                            <button
                            key={c}
                            data-testid={`button-category-${c.replace(/\s+/g, '-')}`}
                            onClick={() => toggleCategory(c)}
                            className={cn(
                                "px-4 py-2 rounded-full border border-white/10 font-medium transition-all text-sm",
                                formData.categories.includes(c) 
                                    ? "bg-primary text-black border-primary font-bold hover:bg-primary/90" 
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

        {step === 4 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3">
                {['Chill', 'Vibey', 'Going out', 'Full send'].map((e) => (
                  <button
                    key={e}
                    data-testid={`button-energy-${e.replace(/\s+/g, '-')}`}
                    onClick={() => setFormData({...formData, energy: e as Energy})}
                    className={cn(
                      "h-16 rounded-xl border border-white/10 flex items-center px-6 transition-all",
                      formData.energy === e 
                        ? "bg-primary text-black border-primary shadow-lg shadow-primary/20 font-bold" 
                        : "bg-white/5 hover:bg-white/10 text-muted-foreground"
                    )}
                  >
                    <span className="text-lg font-bold">{e}</span>
                  </button>
                ))}
              </div>
            </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              {HARD_NOS.map((h) => (
                <button
                  key={h}
                  data-testid={`button-hardno-${h.replace(/\s+/g, '-')}`}
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
          onClick={isLoginMode ? handleLogin : handleNext} 
          data-testid="button-next"
          className="w-full h-14 text-lg font-bold rounded-xl shadow-lg shadow-primary/20"
          disabled={(step === 1 && !isStep1Valid) || (step === 2 && !isStep2Valid) || isLoading}
        >
          {isLoading ? (isLoginMode ? 'Signing in...' : 'Creating account...') : 
           isLoginMode ? "Sign In" :
           step === 5 ? "Complete Profile" : "Next"} 
          {!isLoading && <ChevronRight className="ml-2" />}
        </Button>
      </motion.div>
    </div>
  );
}
