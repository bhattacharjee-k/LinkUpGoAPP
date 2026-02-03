import React, { useState, useEffect } from 'react';
import { useApp } from '@/lib/context';
import { api } from '@/lib/api';
import { useLocation, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar as CalendarIcon, ChevronRight, MapPin, UserPlus, Users, Link as LinkIcon, Check, Copy, Navigation, X, ChevronLeft } from 'lucide-react';
import { City, Budget, Energy, Category } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlacesAutocomplete } from '@/components/places-autocomplete';
import type { ReferenceVenue } from '@shared/schema';

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
  
  // Parse URL params
  const urlParams = new URLSearchParams(searchString);
  const preselectedGroupId = urlParams.get('groupId');
  
  // Step: 0 = Who's going?, 1 = Plan details
  const [step, setStep] = useState(preselectedGroupId ? 1 : 0);
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
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [locationPermission, setLocationPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [showLocationPrompt, setShowLocationPrompt] = useState(true);
  const [draftInviteCode] = useState(Math.random().toString(36).substr(2, 6).toUpperCase());

  // Get selected group
  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  // Generate auto-name for ad-hoc group
  const generateGroupName = (memberIds: string[]): string => {
    if (memberIds.length === 0) return 'New Group';
    if (memberIds.length === 1) return user?.name || 'My Group';
    
    // For now, use "You +N" format since we don't have all user names
    const othersCount = memberIds.filter(id => id !== user?.id).length;
    if (othersCount === 0) return user?.name?.split(' ')[0] || 'My Plans';
    if (othersCount === 1) return `${user?.name?.split(' ')[0] || 'You'} +1`;
    return `${user?.name?.split(' ')[0] || 'You'} +${othersCount}`;
  };

  // Check if ad-hoc selection matches an existing group
  const findMatchingGroup = (memberIds: string[]) => {
    const sortedMemberIds = [...memberIds].sort();
    return groups.find(g => {
      const sortedGroupMembers = [...g.members].sort();
      return sortedMemberIds.length === sortedGroupMembers.length &&
        sortedMemberIds.every((id, idx) => id === sortedGroupMembers[idx]);
    });
  };

  const handleSelectGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    setSelectionMode('group');
    setStep(1);
  };

  const handleAdHocContinue = async () => {
    // Check if selected people match an existing group to avoid duplicates
    const matchingGroup = findMatchingGroup(selectedFriendIds);
    if (matchingGroup) {
      setSelectedGroupId(matchingGroup.id);
      setSelectionMode('group');
    } else {
      setSelectedGroupId(null);
      setSelectionMode('adhoc');
    }
    setStep(1);
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

    // If ad-hoc mode and no matching group, create a new group silently and add members
    if (selectionMode === 'adhoc' && !groupId) {
      try {
        const autoName = generateGroupName(selectedFriendIds);
        const newGroup = await createGroup(autoName);
        groupId = newGroup.id;
        
        // Add selected friends to the new group (exclude current user who is already admin)
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
        inviteCode: draftInviteCode,
        referenceVenues: referenceVenues.length > 0 ? referenceVenues : undefined,
      }, formData.name || undefined);

      // For ad-hoc plans, add selected friends as session participants
      if (selectionMode === 'adhoc') {
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

  const handleCopyLink = () => {
    const link = `${window.location.origin}/join-plan/${draftInviteCode}`;
    const message = `Let's plan together — join my plan: ${link}`;
    
    if (navigator.share) {
      navigator.share({
        title: 'Join my plan',
        text: `Let's plan together — join my plan:`,
        url: link,
      }).catch(() => {
        navigator.clipboard.writeText(message);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast({ title: "Link & Message copied!", description: "Paste it to your friends." });
      });
    } else {
      navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Link & Message copied!", description: "Paste it to your friends." });
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
    if (friendId === user?.id) return; // Can't remove self
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

  // Build a map of user id to member details for name lookup
  const memberDetailsMap = new Map<string, { id: string; name: string; username: string }>();
  groups.forEach(g => {
    g.memberDetails?.forEach(m => memberDetailsMap.set(m.id, m));
  });

  // Helper to get display name for a user id
  const getDisplayName = (userId: string): string => {
    if (userId === user?.id) return 'You';
    const details = memberDetailsMap.get(userId);
    return details?.name || details?.username || userId.substring(0, 8);
  };

  // Helper to get initials for a user id
  const getInitials = (userId: string): string => {
    if (userId === user?.id) return user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const details = memberDetailsMap.get(userId);
    if (details?.name) {
      return details.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return details?.username?.substring(0, 2).toUpperCase() || 'U?';
  };

  // All unique friends from all groups (excluding current user)
  const allFriends = Array.from(new Set(groups.flatMap(g => g.members))).filter(id => id !== user?.id);

  return (
    <div className="min-h-screen bg-background flex flex-col px-6 py-6 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-primary/10 rounded-full blur-[100px]" />
      
      <div className="z-10 w-full max-w-md mx-auto flex-1 flex flex-col">
        <div className="mb-8">
          <Button 
            variant="ghost" 
            className="pl-0 hover:bg-transparent text-muted-foreground" 
            onClick={() => step === 0 ? setLocation('/') : setStep(0)}
            data-testid="button-back"
          >
            {step === 0 ? '← Cancel' : '← Back'}
          </Button>
          <h1 className="text-3xl font-display font-bold mt-2 text-white">
            {step === 0 ? "Who's in?" : 'Plan Details'}
          </h1>
          <p className="text-muted-foreground">
            {step === 0 ? 'Add people to your plan' : 'When and what\'s the vibe?'}
          </p>
        </div>

        {step === 0 ? (
          <div className="space-y-6 flex-1">
            {/* Add people - messaging app style */}
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {/* Current user always included */}
                <div className="h-10 px-4 rounded-full bg-primary/20 border border-primary flex items-center gap-2 text-sm font-medium">
                  <Check size={14} className="text-primary" /> You
                </div>
                
                {/* Selected friends */}
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
                
                {/* Add button */}
                <button
                  onClick={() => setInviteOpen(true)}
                  className="h-10 px-4 rounded-full bg-white/5 border border-dashed border-white/20 text-muted-foreground text-sm font-medium hover:border-primary hover:text-primary transition-all flex items-center gap-2"
                  data-testid="button-add-people"
                >
                  <UserPlus size={14} /> Add
                </button>
              </div>
              
              {/* Quick add from existing contacts */}
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

            {/* Share invite link */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <LinkIcon size={14} className="text-muted-foreground" />
                <span className="text-sm font-medium">Invite via link</span>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 bg-black/20 border border-white/10 rounded-md px-3 py-2 text-xs font-mono truncate text-muted-foreground">
                  {window.location.origin}/join-plan/{draftInviteCode}
                </div>
                <Button size="sm" variant="outline" onClick={handleCopyLink} className="border-white/10 h-9" data-testid="button-copy-invite">
                  {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Anyone with this link can join once the plan is created</p>
            </div>

            {/* Continue button */}
            <Button 
              onClick={handleAdHocContinue}
              className="w-full h-12 bg-primary text-black font-bold text-base"
              data-testid="button-continue"
            >
              Continue <ChevronRight size={18} className="ml-1" />
            </Button>
          </div>
        ) : (
          <div className="space-y-8 flex-1">
            {/* People going indicator */}
            <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg border border-white/10">
              <Users size={16} className="text-muted-foreground" />
              <span className="text-sm">{selectedFriendIds.length} {selectedFriendIds.length === 1 ? 'person' : 'people'}</span>
              <Button 
                size="sm" 
                variant="ghost" 
                className="ml-auto h-6 text-xs text-primary"
                onClick={() => setStep(0)}
              >
                Edit
              </Button>
            </div>

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

            {/* Invite Link */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <LinkIcon size={14} /> Share Plan Link
              </Label>
              <div className="flex gap-2">
                <div className="flex-1 bg-white/5 border border-white/10 rounded-md px-3 py-2 text-xs font-mono truncate text-muted-foreground">
                  {window.location.origin}/join-plan/{draftInviteCode}
                </div>
                <Button size="icon" variant="outline" onClick={handleCopyLink} className="border-white/10" data-testid="button-copy-link">
                  {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground italic">Link becomes active once you click "Find Options"</p>
            </div>

            {/* Location & Neighborhood Section */}
            <div className="space-y-4 pt-4 border-t border-white/10">
              <Label className="text-lg">Where?</Label>
              
              {showLocationPrompt && locationPermission !== 'granted' && (
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

            <Button 
              onClick={handleCreate} 
              disabled={isCreating}
              className="w-full h-14 text-lg font-bold rounded-xl shadow-lg shadow-primary/20 mt-8"
              data-testid="button-find-options"
            >
              {isCreating ? 'Creating...' : 'Find Options'} {!isCreating && <ChevronRight className="ml-2" />}
            </Button>
          </div>
        )}
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
              <p className="text-sm text-muted-foreground">No more contacts to add. Share the invite link below!</p>
            )}

            <div className="pt-2 border-t border-white/10">
              <Label className="text-xs text-muted-foreground mb-2 block">Or share invite link</Label>
              <div className="flex gap-2">
                <div className="flex-1 bg-black/20 border border-white/10 rounded-md px-3 py-2 text-xs font-mono truncate text-muted-foreground">
                  {window.location.origin}/join-plan/{draftInviteCode}
                </div>
                <Button size="sm" variant="outline" onClick={handleCopyLink} className="border-white/10" data-testid="dialog-copy-link">
                  {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </Button>
              </div>
            </div>

            <Button onClick={() => setInviteOpen(false)} className="w-full" data-testid="button-done-adding">
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
