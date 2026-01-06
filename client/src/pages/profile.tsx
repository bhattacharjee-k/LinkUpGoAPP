import React, { useState } from 'react';
import { useApp } from '@/lib/context';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { ArrowLeft, LogOut, Check, MapPin, DollarSign, Zap, X, Mail } from 'lucide-react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { City, Budget, Energy, Category } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';

const CITIES: City[] = ['NYC', 'Chicago'];
const BUDGETS: Budget[] = ['$', '$$', '$$$', '$$$$'];
const ENERGIES: Energy[] = ['Chill', 'Vibey', 'Going out', 'Full send'];
const CATEGORIES: Category[] = ['Dinner', 'Brunch', 'Cocktails', 'Rooftop', 'Club', 'Live Music', 'Bowling', 'Comedy', 'Walk', 'Arcade', 'Big Group', 'Date Night'];
const HARD_NOS = ['Loud Music', 'Crowded Places', 'Dive Bar', 'Long Wait', 'Far Distance', 'Expensive'];

export function Profile() {
  const { user, updateUserProfile, logout } = useApp();
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    city: user?.city || 'NYC',
    budget: user?.budget || ['$$'],
    energy: user?.energy || 'Vibey',
    categories: user?.categories || [],
    hardNos: user?.hardNos || [],
  });

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
                  onClick={() => setFormData(prev => ({ ...prev, city }))}
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
