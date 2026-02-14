import React, { useState, useEffect } from 'react';
import { useApp } from '@/lib/context';
import { api } from '@/lib/api';
import { useLocation, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar as CalendarIcon, ChevronRight, MapPin, UserPlus, Users, Check, Navigation, X, Sparkles, Search, Star, Compass, LocateFixed, GitMerge } from 'lucide-react';
import { City, Budget, Energy, Category } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { PlacesAutocomplete } from '@/components/places-autocomplete';
import { motion, AnimatePresence } from 'framer-motion';
import type { ReferenceVenue } from '@shared/schema';

const LOADING_MESSAGES = [
  { icon: Search, text: "Searching the best spots nearby..." },
  { icon: Star, text: "Finding top-rated venues..." },
  { icon: MapPin, text: "Checking what's open and available..." },
  { icon: Sparkles, text: "Curating personalized picks for your group..." },
];

interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export function NewPlan() {
  const { startSession, user, groups, createGroup, updateUserLocation, addMemberToGroup } = useApp();
  const [_, setLocation] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  
  const urlParams = new URLSearchParams(searchString);
  const preselectedGroupId = urlParams.get('groupId');
  
  const [selectionMode, setSelectionMode] = useState<'group' | 'adhoc' | null>(preselectedGroupId ? 'group' : null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(preselectedGroupId);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([user?.id || '']);
  
  const [formData, setFormData] = useState({
    name: '',
    date: new Date(),
    timeStart: '19:00',
    timeEnd: '22:00',
    locationScope: user?.city || 'NYC',
    neighborhood: '',
    budget: '$$' as Budget,
    energy: user?.energy || 'Vibey',
    categories: [] as Category[],
    referenceVenues: [] as PlaceResult[],
    vibeDescription: '',
    locationMode: 'near_me' as 'near_me' | 'explore_anywhere' | 'meet_in_the_middle',
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [locationPermission, setLocationPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [showLocationPrompt, setShowLocationPrompt] = useState(true);

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  const generateGroupName = (memberIds: string[]): string => {
    if (memberIds.length === 0) return 'New Group';
    if (memberIds.length === 1) return user?.name || 'My Group';
    const othersCount = memberIds.filter(id => id !== user?.id).length;
    if (othersCount === 0) return user?.name?.split(' ')[0] || 'My Plans';
    if (othersCount === 1) return `${user?.name?.split(' ')[0] || 'You'} +1`;
    return `${user?.name?.split(' ')[0] || 'You'} +${othersCount}`;
  };

  useEffect(() => {
    if (!isCreating) {
      setLoadingStep(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingStep(prev => (prev + 1) % LOADING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isCreating]);

  const findMatchingGroup = (memberIds: string[]) => {
    const sortedMemberIds = [...memberIds].sort();
    return groups.find(g => {
      const sortedGroupMembers = [...g.members].sort();
      return sortedMemberIds.length === sortedGroupMembers.length &&
        sortedMemberIds.every((id, idx) => id === sortedGroupMembers[idx]);
    });
  };

  const handleCreate = async () => {
    if (!user || isCreating) return;
    setIsCreating(true);
    
    const hour = parseInt(formData.timeStart.split(':')[0]);
    const dayName = format(formData.date, 'EEE');
    let timeBlock = 'Night';
    if (hour < 17) timeBlock = 'Day';
    else if (hour < 20) timeBlock = 'Evening';
    const timeWindow = `${dayName}-${timeBlock}`;

    let groupId = selectedGroupId;

    const matchingGroup = findMatchingGroup(selectedFriendIds);
    if (matchingGroup) {
      groupId = matchingGroup.id;
      setSelectionMode('group');
    } else if (!groupId) {
      setSelectionMode('adhoc');
    }

    if (selectionMode !== 'group' && !groupId && !matchingGroup) {
      try {
        const autoName = generateGroupName(selectedFriendIds);
        const newGroup = await createGroup(autoName);
        groupId = newGroup.id;
        
        const friendsToAdd = selectedFriendIds.filter(id => id !== user.id);
        for (const friendId of friendsToAdd) {
          try {
            await addMemberToGroup(newGroup.id, friendId);
          } catch (e) {
            console.error('Failed to add member:', friendId, e);
          }
        }
      } catch (error: any) {
        toast({ title: "Error", description: "Failed to create group.", variant: "destructive" });
        setIsCreating(false);
        return;
      }
    }

    if (!groupId) {
      toast({ title: "Error", description: "Please select a group first.", variant: "destructive" });
      setIsCreating(false);
      return;
    }

    try {
      const referenceVenues: ReferenceVenue[] = formData.referenceVenues.map(p => ({
        placeId: p.placeId,
        name: p.name,
        lat: p.lat,
        lng: p.lng,
      }));

      const id = await startSession(groupId, {
        timeWindow, 
        locationScope: formData.locationScope,
        neighborhood: formData.neighborhood || undefined,
        category: formData.categories.length > 0 ? formData.categories : ['Drinks'],
        energy: formData.energy,
        budget: formData.budget,
        specificDate: formData.date,
        specificTime: `${formData.timeStart}-${formData.timeEnd}`,
        referenceVenues: referenceVenues.length > 0 ? referenceVenues : undefined,
        vibeDescription: formData.vibeDescription.trim() || undefined,
        locationMode: formData.locationMode,
      }, formData.name || undefined);

      if (!matchingGroup && selectionMode !== 'group') {
        const friendsToAdd = selectedFriendIds.filter(friendId => friendId !== user.id);
        for (const friendId of friendsToAdd) {
          try {
            await api.sessions.addParticipant(id, 'active', friendId);
          } catch (e) {
            console.error('Failed to add session participant:', friendId, e);
          }
        }
      }

      setLocation(`/session/${id}`);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to create session", variant: "destructive" });
      setIsCreating(false);
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

  const toggleFriend = (friendId: string) => {
    if (friendId === user?.id) return;
    setSelectedFriendIds(prev => 
      prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    );
  };

  const handleRequestLocation = async () => {
    if (!navigator.geolocation) {
      toast({ title: "Not supported", description: "Location is not supported by your browser.", variant: "destructive" });
      setLocationPermission('denied');
      return;
    }

    setIsGettingLocation(true);
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          await updateUserLocation(latitude.toString(), longitude.toString(), 'granted');
          setLocationPermission('granted');
          toast({ title: "Location saved", description: "Your location has been saved for better suggestions." });
          setShowLocationPrompt(false);
        } catch (error: any) {
          toast({ title: "Error", description: error.message || "Failed to save location", variant: "destructive" });
        } finally {
          setIsGettingLocation(false);
        }
      },
      (error) => {
        setLocationPermission('denied');
        setIsGettingLocation(false);
        toast({ title: "Location denied", description: "You can still manually enter your neighborhood.", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const memberDetailsMap = new Map<string, { id: string; name: string; username: string }>();
  groups.forEach(g => {
    g.memberDetails?.forEach(m => memberDetailsMap.set(m.id, m));
  });

  const getDisplayName = (userId: string): string => {
    if (userId === user?.id) return 'You';
    const details = memberDetailsMap.get(userId);
    return details?.name || details?.username || userId.substring(0, 8);
  };

  const allFriends = Array.from(new Set(groups.flatMap(g => g.members))).filter(id => id !== user?.id);

  return (
    <div className="min-h-screen bg-background flex flex-col px-6 py-6 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-primary/10 rounded-full blur-[100px]" />
      
      <AnimatePresence>
        {isCreating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center px-8"
          >
            <div className="absolute top-[20%] left-[-10%] w-72 h-72 bg-primary/15 rounded-full blur-[120px]" />
            <div className="absolute bottom-[20%] right-[-10%] w-64 h-64 bg-purple-500/10 rounded-full blur-[100px]" />

            <motion.div
              className="relative z-10 flex flex-col items-center text-center space-y-8"
            >
              <div className="relative">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="w-20 h-20 rounded-full border-2 border-primary/30 border-t-primary"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div
                    key={loadingStep}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ duration: 0.3 }}
                  >
                    {React.createElement(LOADING_MESSAGES[loadingStep].icon, {
                      size: 28,
                      className: "text-primary"
                    })}
                  </motion.div>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-xl font-bold text-white">Finding your perfect plan</h2>
                <motion.p
                  key={loadingStep}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4 }}
                  className="text-muted-foreground text-sm"
                >
                  {LOADING_MESSAGES[loadingStep].text}
                </motion.p>
              </div>

              <div className="flex gap-2 mt-4">
                {LOADING_MESSAGES.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all duration-300",
                      i === loadingStep ? "bg-primary w-6" : "bg-white/20"
                    )}
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="z-10 w-full max-w-md mx-auto flex-1 flex flex-col pb-8">
        <div className="mb-8">
          <Button 
            variant="ghost" 
            className="pl-0 hover:bg-transparent text-muted-foreground" 
            onClick={() => setLocation('/')}
            data-testid="button-back"
          >
            ← Cancel
          </Button>
          <h1 className="text-3xl font-display font-bold mt-2 text-white">
            New Plan
          </h1>
          <p className="text-muted-foreground">
            Fill in the details and add your people
          </p>
        </div>

        <div className="space-y-8 flex-1">
          {/* Plan Name Section */}
          <div className="space-y-4">
            <Label className="text-lg">What are we calling this?</Label>
            <Input 
              placeholder="e.g. Friday Drinks, Birthday Bash" 
              className="bg-white/5 border-white/10 h-12 text-lg" 
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              data-testid="input-plan-name"
            />
          </div>

          {/* Location & Neighborhood Section */}
          <div className="space-y-4 pt-4 border-t border-white/10">
            <Label className="text-lg">Where?</Label>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">How should we pick the area?</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'near_me', label: 'Near Me', icon: LocateFixed, desc: 'Close to your area' },
                  { value: 'explore_anywhere', label: 'Anywhere', icon: Compass, desc: 'Best spots city-wide' },
                  { value: 'meet_in_the_middle', label: 'Meet Up', icon: GitMerge, desc: 'Central for everyone' },
                ] as const).map((mode) => (
                  <button
                    key={mode.value}
                    onClick={() => setFormData({...formData, locationMode: mode.value})}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center",
                      formData.locationMode === mode.value
                        ? "bg-primary/20 border-primary/50 text-white"
                        : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20"
                    )}
                    data-testid={`location-mode-${mode.value}`}
                  >
                    <mode.icon size={20} className={formData.locationMode === mode.value ? "text-primary" : ""} />
                    <span className="text-xs font-medium">{mode.label}</span>
                    <span className="text-[10px] opacity-70 leading-tight">{mode.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {formData.locationMode === 'near_me' && showLocationPrompt && locationPermission !== 'granted' && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/20 rounded-lg">
                    <Navigation size={18} className="text-primary" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">Better suggestions with your location</h4>
                    <p className="text-xs text-muted-foreground mt-1">Share your location for more accurate recommendations.</p>
                  </div>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowLocationPrompt(false)} data-testid="button-close-location">
                    <X size={14} />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleRequestLocation} disabled={isGettingLocation} className="flex-1 bg-primary text-black h-9 text-sm font-medium" data-testid="button-request-location">
                    {isGettingLocation ? "Getting location..." : "Share Location"}
                  </Button>
                  <Button variant="outline" onClick={() => setShowLocationPrompt(false)} className="flex-1 border-white/10 bg-white/5 h-9 text-sm" data-testid="button-skip-location">
                    Skip
                  </Button>
                </div>
              </div>
            )}

            {formData.locationMode === 'meet_in_the_middle' && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                <p className="text-xs text-muted-foreground">
                  Each person will pick their starting neighborhood after joining. We'll find spots central to everyone.
                </p>
              </div>
            )}

            {formData.locationMode !== 'meet_in_the_middle' && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin size={12} /> Neighborhood (optional)
                </Label>
                <Input 
                  placeholder={formData.locationScope === 'Chicago' ? "e.g. River North, West Loop" : "e.g. Williamsburg, East Village"}
                  className="bg-white/5 border-white/10 h-10" 
                  value={formData.neighborhood}
                  onChange={e => setFormData({...formData, neighborhood: e.target.value})}
                  data-testid="input-neighborhood"
                />
              </div>
            )}
          </div>

          {/* Date & Time Selection */}
          <div className="space-y-4 pt-4 border-t border-white/10">
            <Label className="text-lg">When?</Label>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal bg-white/5 border-white/10 h-12", !formData.date && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.date ? format(formData.date, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-card border-white/10" align="start">
                <Calendar mode="single" selected={formData.date} onSelect={(d) => d && setFormData({...formData, date: d})} initialFocus />
              </PopoverContent>
            </Popover>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Start</Label>
                <Input type="time" className="bg-white/5 border-white/10" value={formData.timeStart} onChange={e => setFormData({...formData, timeStart: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">End</Label>
                <Input type="time" className="bg-white/5 border-white/10" value={formData.timeEnd} onChange={e => setFormData({...formData, timeEnd: e.target.value})} />
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
              <div className="grid grid-cols-2 gap-2">
                {['Chill', 'Vibey', 'Going out', 'Full send'].map((e) => (
                  <button
                    key={e}
                    onClick={() => setFormData({...formData, energy: e as Energy})}
                    className={cn(
                      "h-10 rounded-lg border border-white/10 text-sm font-medium transition-all",
                      formData.energy === e ? "bg-primary text-black border-primary font-bold" : "bg-white/5 text-muted-foreground"
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
                {['Dinner', 'Drinks', 'Brunch', 'Club', 'Activity'].map((c) => (
                  <button
                    key={c}
                    onClick={() => toggleCategory(c as Category)}
                    className={cn(
                      "px-3 py-2 rounded-lg border border-white/10 text-xs font-medium transition-all",
                      formData.categories.includes(c as Category) ? "bg-primary text-black border-primary font-bold" : "bg-white/5 text-muted-foreground"
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">Anything specific in mind? (Optional)</Label>
              <textarea
                placeholder="e.g. Rooftop with good cocktails, no loud music... or Somewhere with a dance floor and good DJs"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
                rows={2}
                maxLength={500}
                value={formData.vibeDescription}
                onChange={e => setFormData({...formData, vibeDescription: e.target.value})}
                data-testid="input-vibe-description"
              />
              {formData.vibeDescription && (
                <p className="text-[10px] text-muted-foreground text-right">{formData.vibeDescription.length}/500</p>
              )}
            </div>
          </div>

          {/* Reference Venues (Optional) */}
          <div className="space-y-4 pt-4 border-t border-white/10">
            <div>
              <Label className="text-lg">Any places you love?</Label>
              <p className="text-xs text-muted-foreground mt-1">Optional — helps us match your vibe</p>
            </div>
            
            <PlacesAutocomplete
              selectedPlaces={formData.referenceVenues}
              onPlacesChange={(places) => setFormData({...formData, referenceVenues: places})}
              maxPlaces={3}
              city={formData.locationScope}
              placeholder="Search for a favorite spot..."
            />
          </div>

          {/* Who's In Section */}
          <div className="space-y-4 pt-4 border-t border-white/10">
            <Label className="text-lg">Who's in?</Label>
            <p className="text-xs text-muted-foreground -mt-2">You can also invite people after creating the plan</p>
            
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <div className="h-10 px-4 rounded-full bg-primary/20 border border-primary flex items-center gap-2 text-sm font-medium">
                  <Check size={14} className="text-primary" /> You
                </div>
                
                {selectedFriendIds.filter(id => id !== user?.id).map(friendId => (
                  <button
                    key={friendId}
                    onClick={() => toggleFriend(friendId)}
                    className="h-10 px-4 rounded-full bg-primary/20 border border-primary text-white text-sm font-medium transition-all flex items-center gap-1"
                    data-testid={`selected-friend-${friendId}`}
                  >
                    {getDisplayName(friendId)}
                    <X size={12} className="ml-1 opacity-60" />
                  </button>
                ))}
                
                <button
                  onClick={() => setInviteOpen(true)}
                  className="h-10 px-4 rounded-full bg-white/5 border border-dashed border-white/20 text-muted-foreground text-sm font-medium hover:border-primary hover:text-primary transition-all flex items-center gap-2"
                  data-testid="button-add-people"
                >
                  <UserPlus size={14} /> Add
                </button>
              </div>
              
              {allFriends.filter(id => !selectedFriendIds.includes(id)).length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Quick add</Label>
                  <div className="flex flex-wrap gap-2">
                    {allFriends.filter(id => !selectedFriendIds.includes(id)).map(friendId => (
                      <button
                        key={friendId}
                        onClick={() => toggleFriend(friendId)}
                        className="h-8 px-3 rounded-full bg-white/5 border border-white/10 text-muted-foreground text-xs font-medium hover:border-white/20 transition-all"
                        data-testid={`quick-add-${friendId}`}
                      >
                        + {getDisplayName(friendId)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <Button 
            onClick={handleCreate} 
            disabled={isCreating}
            className="w-full h-14 text-lg font-bold rounded-xl shadow-lg shadow-primary/20 mt-8"
            data-testid="button-find-options"
          >
            {isCreating ? 'Creating...' : 'Find Options'} {!isCreating && <ChevronRight className="ml-2" />}
          </Button>
        </div>
      </div>

      {/* Add People Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="bg-card border-white/10 w-[95%] max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add People</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2 max-h-[60vh] overflow-y-auto">
            {allFriends.filter(id => !selectedFriendIds.includes(id)).length > 0 ? (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">From your contacts</Label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {allFriends.filter(id => !selectedFriendIds.includes(id)).map(friendId => (
                    <Button
                      key={friendId}
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs border-white/10"
                      onClick={() => {
                        toggleFriend(friendId);
                      }}
                      data-testid={`dialog-add-${friendId}`}
                    >
                      + {getDisplayName(friendId)}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No more contacts to add. You can share an invite link after creating the plan!</p>
            )}

            <Button onClick={() => setInviteOpen(false)} className="w-full" data-testid="button-done-adding">
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
