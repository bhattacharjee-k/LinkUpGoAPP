import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '@/lib/context';
import { AdBanner } from '@/components/ad-banner';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronRight, ChevronLeft, MapPin, Ban, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { City, Budget, Energy, Category, HardNo, DiscoveryStyle, CrowdPreference, NEIGHBORHOODS } from '@/lib/store';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import logoImg from '@/assets/brand/linkupgo-logo.png';

const RETURNING_USER_KEY = 'linkupgo_has_account';

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

export function Onboarding() {
  const { register, login } = useApp();
  const [_, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [justLoggedOut, setJustLoggedOut] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Username validation state
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [usernameMessage, setUsernameMessage] = useState('');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const hasAccount = localStorage.getItem(RETURNING_USER_KEY);
    if (hasAccount === 'true') {
      setIsReturningUser(true);
      setIsLoginMode(true);
    }
    // A deliberate logout sets this marker; read + clear it once so we can
    // show a calm, neutral message rather than the warning-style banner.
    try {
      if (sessionStorage.getItem('linkupgo_just_logged_out') === 'true') {
        sessionStorage.removeItem('linkupgo_just_logged_out');
        setJustLoggedOut(true);
        setIsLoginMode(true);
      }
    } catch {
      // sessionStorage unavailable — ignore.
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
    discoveryStyle: 'mixed' as DiscoveryStyle,
    crowdPreference: 'no_preference' as CrowdPreference,
    favoriteNeighborhoods: [] as string[],
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

  const toggleNeighborhood = (n: string) => {
    setFormData(prev => ({
      ...prev,
      favoriteNeighborhoods: prev.favoriteNeighborhoods.includes(n)
        ? prev.favoriteNeighborhoods.filter(x => x !== n)
        : [...prev.favoriteNeighborhoods, n]
    }));
  };

  const handleNext = async () => {
    if (step < 6) {
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
          discoveryStyle: formData.discoveryStyle,
          crowdPreference: formData.crowdPreference,
          favoriteNeighborhoods: formData.favoriteNeighborhoods,
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

  // Username validation with debounce and abort control
  const checkUsernameAvailability = useCallback(async (username: string) => {
    if (!username || username.length === 0) {
      setUsernameStatus('idle');
      setUsernameMessage('');
      return;
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setUsernameStatus('checking');
    setUsernameMessage('');

    try {
      const response = await fetch(`/api/auth/username-available?username=${encodeURIComponent(username)}`, {
        signal: controller.signal,
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to check username');
      }
      
      const data = await response.json();
      
      // Check if this request was aborted
      if (controller.signal.aborted) {
        return;
      }
      
      if (data.available) {
        setUsernameStatus('available');
        setUsernameMessage('Username is available');
      } else {
        setUsernameStatus('taken');
        setUsernameMessage('That username is taken');
      }
    } catch (error: any) {
      // Ignore abort errors
      if (error.name === 'AbortError') {
        return;
      }
      setUsernameStatus('error');
      setUsernameMessage("Couldn't check right now — try again");
    }
  }, []);

  const handleUsernameChange = (username: string) => {
    setFormData({ ...formData, username });
    
    // Don't check in login mode
    if (isLoginMode) {
      setUsernameStatus('idle');
      return;
    }

    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the check (500ms)
    debounceTimerRef.current = setTimeout(() => {
      checkUsernameAvailability(username);
    }, 500);
  };

  const handleUsernameBlur = () => {
    // On blur, check immediately (cancel debounce)
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (!isLoginMode && formData.username.length > 0) {
      checkUsernameAvailability(formData.username);
    }
  };

  const handleBack = () => {
    if (step === 1) {
      setIsLoginMode(true);
      setError('');
    } else {
      setStep(step - 1);
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

  const isStep1Valid = isLoginMode 
    ? formData.username.length > 0 && formData.password.length >= 6
    : formData.username.length > 0 && formData.password.length >= 6 && usernameStatus !== 'checking' && usernameStatus !== 'taken';
  const isStep2Valid = formData.name.length > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center px-6 py-10 relative overflow-hidden">
      <div className="absolute top-[-20%] right-[-10%] w-96 h-96 bg-primary/10 rounded-full blur-[120px]" />
      
      {/* Back button - top left, always visible */}
      {(isLoginMode || step > 1) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="absolute top-4 left-4 z-30 text-white hover:bg-white/10"
          data-testid="button-back"
        >
          <ChevronLeft size={20} className="mr-1" />
          Back
        </Button>
      )}
      
      <motion.div 
        key={step}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="z-10 w-full max-w-md mx-auto space-y-8"
      >
        {/* Logo centered at top — pt-8 keeps it clear of the absolute Back button */}
        <div className="flex justify-center items-center mb-8 pt-8">
          <img 
            src={logoImg} 
            alt="LinkUpGo" 
            width={280}
            height={70}
            className="w-[240px] sm:w-[280px] h-auto object-contain"
            data-testid="img-logo-onboarding"
          />
        </div>

        <div className="space-y-2">
          {!isLoginMode && <div className="text-primary font-bold tracking-widest text-xs uppercase" data-testid="text-step-indicator">Step {step} of 6</div>}
          <h1 className="text-4xl font-display font-bold text-white leading-tight" data-testid="text-step-title">
            {step === 1 && (isLoginMode ? "Welcome back!" : "Welcome to LinkUpGo.")}
            {step === 2 && "Tell us about yourself"}
            {step === 3 && "What are you into?"}
            {step === 4 && "What's your usual vibe?"}
            {step === 5 && "Any hard no's?"}
            {step === 6 && "How adventurous are you?"}
          </h1>
          <p className="text-muted-foreground text-lg">
             {step === 1 && (isLoginMode ? "Sign in to continue planning with friends." : "Create your account to start planning with friends.")}
             {step === 3 && "Pick anything you're usually open to — we'll learn your real preferences as you plan."}
             {step === 4 && "This sets your baseline, but you can change it for every plan."}
             {step === 5 && "We'll hide these types of places from your suggestions."}
             {step === 6 && "This helps us find the perfect spots for you."}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl" data-testid="error-message">
            {error}
          </div>
        )}

        {step === 1 && justLoggedOut && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3" data-testid="logged-out-banner">
            <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-white font-medium">You've been signed out</p>
              <p className="text-muted-foreground text-sm">Sign back in to keep planning.</p>
            </div>
          </div>
        )}

        {step === 1 && isReturningUser && !justLoggedOut && (
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
              <Label htmlFor="onboarding-username">Username</Label>
              <div className="relative">
                <Input
                  id="onboarding-username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  data-testid="input-username"
                  value={formData.username}
                  onChange={e => handleUsernameChange(e.target.value)}
                  onBlur={handleUsernameBlur}
                  placeholder="alexsmith"
                  className={cn(
                    "bg-white/5 border-white/10 h-12 text-lg pr-10",
                    !isLoginMode && usernameStatus === 'taken' && "border-red-500/50",
                    !isLoginMode && usernameStatus === 'available' && "border-green-500/50"
                  )}
                />
                {!isLoginMode && usernameStatus === 'checking' && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground animate-spin" />
                )}
                {!isLoginMode && usernameStatus === 'available' && (
                  <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
                )}
              </div>
              {!isLoginMode && usernameMessage && (
                <p className={cn(
                  "text-xs flex items-center gap-1",
                  usernameStatus === 'taken' && "text-red-400",
                  usernameStatus === 'available' && "text-green-400",
                  usernameStatus === 'error' && "text-yellow-400"
                )} data-testid="username-validation-message">
                  {usernameMessage}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="onboarding-password">Password</Label>
              <Input
                id="onboarding-password"
                name="password"
                data-testid="input-password"
                type="password"
                autoComplete={isLoginMode ? 'current-password' : 'new-password'}
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
              <Label htmlFor="onboarding-name">Name</Label>
              <Input
                id="onboarding-name"
                name="name"
                type="text"
                autoComplete="name"
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
                {[
                  { value: 'Chill', desc: 'Low-key hangs — coffee, a quiet bar, easy conversation' },
                  { value: 'Vibey', desc: 'Good energy and atmosphere without going overboard' },
                  { value: 'Going out', desc: 'A proper night out — drinks, music, somewhere lively' },
                  { value: 'Full send', desc: 'Big night, no brakes — dancing til late' },
                ].map((e) => (
                  <button
                    key={e.value}
                    data-testid={`button-energy-${e.value.replace(/\s+/g, '-')}`}
                    onClick={() => setFormData({...formData, energy: e.value as Energy})}
                    className={cn(
                      "h-auto py-3 px-6 rounded-xl border border-white/10 flex flex-col items-start text-left transition-all",
                      formData.energy === e.value
                        ? "bg-primary text-black border-primary shadow-lg shadow-primary/20"
                        : "bg-white/5 hover:bg-white/10"
                    )}
                  >
                    <span className="text-lg font-bold">{e.value}</span>
                    <span className={cn("text-xs", formData.energy === e.value ? "text-black/70" : "text-muted-foreground")}>{e.desc}</span>
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

        {step === 6 && (
          <div className="space-y-6 max-h-[55vh] overflow-y-auto pr-2">
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Discovery Style</Label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { value: 'hidden_gems', label: 'Hidden Gems', desc: 'Unique spots most people haven\'t tried' },
                  { value: 'popular', label: 'Popular Favorites', desc: 'Well-known spots with proven track records' },
                  { value: 'mixed', label: 'Mix It Up', desc: 'A balance of both new and popular' },
                ].map((option) => (
                  <button
                    key={option.value}
                    data-testid={`button-discovery-${option.value}`}
                    onClick={() => setFormData({...formData, discoveryStyle: option.value as DiscoveryStyle})}
                    className={cn(
                      "h-auto py-3 px-4 rounded-xl border border-white/10 flex flex-col items-start text-left transition-all",
                      formData.discoveryStyle === option.value 
                        ? "bg-primary text-black border-primary" 
                        : "bg-white/5 hover:bg-white/10"
                    )}
                  >
                    <span className="font-bold">{option.label}</span>
                    <span className={cn("text-xs", formData.discoveryStyle === option.value ? "text-black/70" : "text-muted-foreground")}>{option.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Crowd Preference</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'quiet', label: 'Quiet' },
                  { value: 'buzzing', label: 'Buzzing' },
                  { value: 'no_preference', label: 'Either' },
                ].map((option) => (
                  <button
                    key={option.value}
                    data-testid={`button-crowd-${option.value}`}
                    onClick={() => setFormData({...formData, crowdPreference: option.value as CrowdPreference})}
                    className={cn(
                      "h-12 rounded-xl border border-white/10 font-medium transition-all text-sm",
                      formData.crowdPreference === option.value 
                        ? "bg-primary text-black border-primary font-bold" 
                        : "bg-white/5 hover:bg-white/10 text-muted-foreground"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Favorite Neighborhoods in {formData.city}</Label>
              <div className="flex flex-wrap gap-2">
                {NEIGHBORHOODS[formData.city].map((n) => (
                  <button
                    key={n}
                    data-testid={`button-neighborhood-${n.replace(/\s+/g, '-')}`}
                    onClick={() => toggleNeighborhood(n)}
                    className={cn(
                      "px-3 py-1.5 rounded-full border border-white/10 transition-all text-xs",
                      formData.favoriteNeighborhoods.includes(n) 
                        ? "bg-primary text-black border-primary font-bold" 
                        : "bg-white/5 hover:bg-white/10 text-muted-foreground"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Optional — select your go-to areas or skip to explore everywhere.</p>
            </div>
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
           step === 6 ? "Complete Profile" : "Next"}
          {!isLoading && <ChevronRight className="ml-2" />}
        </Button>

        {step === 1 && !isStep1Valid && !isLoading && (
          <p className="text-xs text-muted-foreground text-center mt-2" data-testid="text-step1-hint">
            Enter a username and a password of at least 6 characters.
          </p>
        )}

        {/* Spacer for fixed banner ad */}
        <div className="h-16" />
      </motion.div>

      {/* Banner ad at bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pb-safe">
        <div className="max-w-md w-full">
          <AdBanner />
        </div>
      </div>
    </div>
  );
}
