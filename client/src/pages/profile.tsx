import React, { useState } from 'react';
import { useApp } from '@/lib/context';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { ArrowLeft, LogOut, Check, MapPin, DollarSign, Zap, X, Mail, Car, Footprints, Train } from 'lucide-react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { City, Budget, Energy, Category, DiscoveryStyle, CrowdPreference, NEIGHBORHOODS } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';

const CITIES: City[] = ['NYC', 'Chicago'];
const BUDGETS: Budget[] = ['$', '$$', '$$$', '$$$$'];
const ENERGIES: Energy[] = ['Chill', 'Vibey', 'Going out', 'Full send'];
const CATEGORIES: Category[] = ['Dinner', 'Brunch', 'Cocktails', 'Rooftop', 'Club', 'Live Music', 'Bowling', 'Comedy', 'Walk', 'Arcade', 'Big Group', 'Date Night'];
const HARD_NOS = ['Clubs', 'Loud places', 'Ticketed events', 'Late nights', 'Expensive spots'];
const TRANSPORTATION_OPTIONS: { value: string; label: string; icon: typeof Car }[] = [
  { value: 'car', label: 'Car', icon: Car },
  { value: 'walk', label: 'Walk', icon: Footprints },
  { value: 'transit', label: 'Public Transit', icon: Train },
];
const DISCOVERY_OPTIONS: { value: DiscoveryStyle; label: string; desc: string }[] = [
  { value: 'hidden_gems', label: 'Hidden Gems', desc: 'Unique spots most people haven\'t tried' },
  { value: 'popular', label: 'Popular Favorites', desc: 'Well-known spots with proven track records' },
  { value: 'mixed', label: 'Mix It Up', desc: 'A balance of both new and popular' },
];
const CROWD_OPTIONS: { value: CrowdPreference; label: string }[] = [
  { value: 'quiet', label: 'Quiet' },
  { value: 'buzzing', label: 'Buzzing' },
  { value: 'no_preference', label: 'Either' },
];

export function Profile() {
  const { user, updateUserProfile, logout } = useApp();
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    city: (user?.city || 'NYC') as City,
    budget: user?.budget || ['$$'],
    energy: user?.energy || 'Vibey',
    categories: user?.categories || [],
    hardNos: user?.hardNos || [],
    discoveryStyle: (user?.discoveryStyle || 'mixed') as DiscoveryStyle,
    crowdPreference: (user?.crowdPreference || 'no_preference') as CrowdPreference,
    favoriteNeighborhoods: user?.favoriteNeighborhoods || [],
    transportationMode: (user as any)?.transportationMode || 'car',
  });

  const toggleNeighborhood = (n: string) => {
    setFormData(prev => ({
      ...prev,
      favoriteNeighborhoods: prev.favoriteNeighborhoods.includes(n)
        ? prev.favoriteNeighborhoods.filter((x: string) => x !== n)
        : [...prev.favoriteNeighborhoods, n]
    }));
  };

  if (!user) {
    setLocation('/');
    return null;
  }

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

  const toggleHardNo = (h: string) => {
    setFormData(prev => ({
      ...prev,
      hardNos: prev.hardNos.includes(h)
        ? prev.hardNos.filter(x => x !== h)
        : [...prev.hardNos, h]
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateUserProfile(formData);
      toast({ title: "Saved!", description: "Your preferences have been updated." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save", variant: "destructive" });
    }
    setIsSaving(false);
  };

  const handleLogout = async () => {
    await logout();
    setLocation('/');
  };

  return (
    <Layout>
      <div className="px-6 py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/')}>
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-2xl font-bold">Profile</h1>
        </div>

        <Card className="p-6 bg-white/5 border-white/10 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-primary to-blue-500 flex items-center justify-center text-2xl font-bold text-black">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold">{user.name}</h2>
              <p className="text-sm text-muted-foreground">@{user.username}</p>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Name</Label>
            <Input 
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="bg-white/5 border-white/10"
              data-testid="input-name"
            />
          </div>

          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Mail size={14} /> Email for notifications
            </Label>
            <Input 
              type="email"
              placeholder="your@email.com"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className="bg-white/5 border-white/10"
              data-testid="input-email"
            />
            <p className="text-xs text-muted-foreground">Optional - used for important plan updates</p>
          </div>

          <div className="space-y-3">
            <Label>City</Label>
            <div className="flex gap-2">
              {CITIES.map(city => (
                <button
                  key={city}
                  onClick={() => setFormData(prev => ({ 
                    ...prev, 
                    city,
                    favoriteNeighborhoods: prev.city !== city ? [] : prev.favoriteNeighborhoods
                  }))}
                  className={cn(
                    "flex-1 py-3 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-2",
                    formData.city === city 
                      ? "bg-primary text-black border-primary" 
                      : "bg-white/5 border-white/10 text-muted-foreground"
                  )}
                >
                  <MapPin size={14} /> {city}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Budget Preference</Label>
            <div className="flex gap-2">
              {BUDGETS.map(b => (
                <button
                  key={b}
                  onClick={() => toggleBudget(b)}
                  className={cn(
                    "flex-1 py-3 rounded-xl border text-sm font-medium transition-all",
                    formData.budget.includes(b)
                      ? "bg-primary text-black border-primary"
                      : "bg-white/5 border-white/10 text-muted-foreground"
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Energy Level</Label>
            <div className="flex flex-wrap gap-2">
              {ENERGIES.map(e => (
                <button
                  key={e}
                  onClick={() => setFormData(prev => ({ ...prev, energy: e }))}
                  className={cn(
                    "px-4 py-2 rounded-xl border text-sm font-medium transition-all flex items-center gap-2",
                    formData.energy === e
                      ? "bg-primary text-black border-primary"
                      : "bg-white/5 border-white/10 text-muted-foreground"
                  )}
                >
                  <Zap size={14} /> {e}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>How do you get around?</Label>
            <div className="flex gap-2">
              {TRANSPORTATION_OPTIONS.map(opt => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setFormData(prev => ({ ...prev, transportationMode: opt.value }))}
                    className={cn(
                      "flex-1 py-3 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-2",
                      formData.transportationMode === opt.value
                        ? "bg-primary text-black border-primary"
                        : "bg-white/5 border-white/10 text-muted-foreground"
                    )}
                    data-testid={`button-transport-${opt.value}`}
                  >
                    <Icon size={14} /> {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Affects how far away suggestions can be</p>
          </div>

          <div className="space-y-3">
            <Label>Favorite Categories</Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  onClick={() => toggleCategory(c)}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-xs font-medium transition-all",
                    formData.categories.includes(c)
                      ? "bg-primary text-black border-primary"
                      : "bg-white/5 border-white/10 text-muted-foreground"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Hard No's</Label>
            <p className="text-xs text-muted-foreground">Things you want to avoid</p>
            <div className="flex flex-wrap gap-2">
              {HARD_NOS.map(h => (
                <button
                  key={h}
                  onClick={() => toggleHardNo(h)}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-xs font-medium transition-all flex items-center gap-1",
                    formData.hardNos.includes(h)
                      ? "bg-red-500/20 text-red-400 border-red-500/50"
                      : "bg-white/5 border-white/10 text-muted-foreground"
                  )}
                >
                  {formData.hardNos.includes(h) && <X size={12} />}
                  {h}
                </button>
              ))}
            </div>
          </div>

          <Button 
            onClick={handleSave} 
            disabled={isSaving}
            className="w-full bg-primary text-black font-bold"
            data-testid="button-save-prefs"
          >
            {isSaving ? 'Saving...' : 'Save All Preferences'}
          </Button>
        </Card>

        <Card className="p-6 bg-white/5 border-white/10 space-y-6">
          <h3 className="text-lg font-bold">Discovery Preferences</h3>
          <p className="text-sm text-muted-foreground -mt-4">How adventurous are you when finding new spots?</p>

          <div className="space-y-3">
            <Label>Discovery Style</Label>
            <div className="grid grid-cols-1 gap-2">
              {DISCOVERY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  data-testid={`button-discovery-${option.value}`}
                  onClick={() => setFormData(prev => ({ ...prev, discoveryStyle: option.value }))}
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
            <Label>Crowd Preference</Label>
            <div className="grid grid-cols-3 gap-2">
              {CROWD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  data-testid={`button-crowd-${option.value}`}
                  onClick={() => setFormData(prev => ({ ...prev, crowdPreference: option.value }))}
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
            <Label>Favorite Neighborhoods in {formData.city}</Label>
            <p className="text-xs text-muted-foreground">We'll prioritize spots in your go-to areas</p>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
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
          </div>

          <Button 
            onClick={handleSave} 
            disabled={isSaving}
            className="w-full bg-primary text-black font-bold"
            data-testid="button-save-discovery"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </Card>

        <Button 
          variant="outline" 
          onClick={handleLogout}
          className="w-full border-red-500/50 text-red-400 hover:bg-red-500/10"
        >
          <LogOut size={16} className="mr-2" /> Log Out
        </Button>
      </div>
    </Layout>
  );
}
