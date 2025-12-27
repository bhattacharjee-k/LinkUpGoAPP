import React, { useState } from 'react';
import { useApp } from '@/lib/context';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar as CalendarIcon, Clock, ChevronRight, MapPin, DollarSign, UserPlus, Users, Link as LinkIcon, Check, Copy } from 'lucide-react';
import { City, Budget, Energy, Category } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';

export function NewPlan() {
  const { startSession, user, groups, addParticipantToSession } = useApp();
  const [_, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    date: new Date(),
    timeStart: '19:00',
    timeEnd: '22:00',
    flexibility: 'strict', // strict, flexible
    locationScope: user?.city || 'NYC',
    budget: '$$' as Budget,
    energy: user?.energy || 'Vibey',
    categories: [] as Category[],
    participants: [user?.id || 'me'], // Current user is always a participant
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newParticipantName, setNewParticipantName] = useState('');
  // Pre-generate invite code for display
  const [draftInviteCode] = useState(Math.random().toString(36).substr(2, 6).toUpperCase());

  // Find user's primary group or first available group
  const userGroup = groups.find(g => g.members.includes(user?.id || 'me')) || groups[0];

  const handleCreate = () => {
    if (!user) return;
    
    // Format "Day-TimeBlock" approximation for the MVP data model compatibility
    const hour = parseInt(formData.timeStart.split(':')[0]);
    let timeWindow = 'Fri-Night'; // Default fallback
    
    const dayName = format(formData.date, 'EEE'); // Mon, Tue...
    let timeBlock = 'Night';
    if (hour < 17) timeBlock = 'Day';
    else if (hour < 20) timeBlock = 'Evening';
    
    timeWindow = `${dayName}-${timeBlock}`;

    const id = startSession('g1', { // Using g1 as placeholder, real app would let you pick group context
        timeWindow, 
        locationScope: formData.locationScope,
        category: formData.categories.length > 0 ? formData.categories : ['Drinks'],
        energy: formData.energy,
        budget: formData.budget,
        specificDate: formData.date,
        specificTime: `${formData.timeStart}-${formData.timeEnd}`,
        inviteCode: draftInviteCode // Pass the pre-generated code
    });

    // Add selected participants to the new session
    formData.participants.forEach(pid => {
        if (pid !== user.id) {
            addParticipantToSession(id, pid);
        }
    });

    setLocation(`/session/${id}`);
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/join-plan/${draftInviteCode}`;
    const message = `Let's plan together — join my plan: ${link}`;
    
    // Try to use Web Share API if available (works on mobile)
    if (navigator.share) {
        navigator.share({
            title: 'Join my plan',
            text: `Let's plan together — join my plan:`,
            url: link,
        }).then(() => {
             toast({ title: "Shared successfully!" });
        }).catch(() => {
             // Fallback to clipboard if share cancelled or failed
             navigator.clipboard.writeText(message);
             setCopied(true);
             setTimeout(() => setCopied(false), 2000);
             toast({
                title: "Link & Message copied!",
                description: "Paste it to your friends.",
            });
        });
    } else {
        // Fallback for desktop
        navigator.clipboard.writeText(message);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast({
            title: "Link & Message copied!",
            description: "Paste it to your friends.",
        });
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

  const handleAddParticipant = () => {
    if (!newParticipantName.trim()) return;
    const mockId = `user-${Math.random().toString(36).substr(2, 5)}`;
    // In a real app, this would validate the user exists first
    setFormData(prev => ({
        ...prev,
        participants: [...prev.participants, mockId]
    }));
    setNewParticipantName('');
    toast({ title: "Added", description: "User added to plan list." });
  };

  const toggleParticipant = (pid: string) => {
      setFormData(prev => {
          const isSelected = prev.participants.includes(pid);
          return {
              ...prev,
              participants: isSelected 
                ? prev.participants.filter(p => p !== pid)
                : [...prev.participants, pid]
          };
      });
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
            <p className="text-muted-foreground">Who, when, and what's the vibe?</p>
        </div>

        <div className="space-y-8 flex-1">
            
            {/* Participants Section */}
            <div className="space-y-4">
                <Label className="text-lg flex justify-between items-center">
                    Who's going?
                    <span className="text-xs text-muted-foreground font-normal">{formData.participants.length} selected</span>
                </Label>
                
                <div className="flex flex-wrap gap-2">
                    {/* Add Button */}
                    <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" className="rounded-full h-10 w-10 p-0 border-dashed border-white/30 bg-white/5">
                                <UserPlus size={16} />
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-card border-white/10 w-[95%] max-w-sm rounded-2xl">
                            <DialogHeader>
                                <DialogTitle>Add to Plan</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 pt-4 overflow-y-auto max-h-[60vh] pr-1">
                                {/* Share Link - Added as requested */}
                                <div className="space-y-2 pb-4 border-b border-white/10">
                                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Share Plan Link</h4>
                                    <div className="flex flex-col gap-2 w-full">
                                        <div className="flex gap-2 w-full">
                                            <div className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-md px-3 py-2 text-xs font-mono truncate text-muted-foreground">
                                                {window.location.origin}/join-plan/{draftInviteCode}
                                            </div>
                                        </div>
                                        <Button size="sm" variant="secondary" onClick={handleCopyLink} className="w-full bg-white/10 hover:bg-white/20 border-0 h-9">
                                            {copied ? <Check size={14} className="mr-2 text-green-500" /> : <LinkIcon size={14} className="mr-2" />}
                                            {copied ? "Link Copied" : "Copy Invite Link"}
                                        </Button>
                                        <p className="text-[10px] text-muted-foreground text-center italic">Link becomes active once you click "Find Options"</p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">From {userGroup.name}</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {userGroup.members.map(m => (
                                            <Button 
                                                key={m} 
                                                variant={formData.participants.includes(m) ? "default" : "outline"} 
                                                size="sm" 
                                                onClick={() => toggleParticipant(m)} 
                                                className="text-xs h-8"
                                            >
                                                {m === user?.id ? 'You' : m.substr(0,4)}
                                                {formData.participants.includes(m) && <Check size={12} className="ml-1" />}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                     <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Add by Name</h4>
                                     <div className="flex gap-2">
                                        <Input 
                                            placeholder="@username" 
                                            className="bg-white/5 border-white/10" 
                                            value={newParticipantName}
                                            onChange={e => setNewParticipantName(e.target.value)}
                                        />
                                        <Button onClick={handleAddParticipant} disabled={!newParticipantName}>Add</Button>
                                     </div>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>

                    {/* Selected Avatars */}
                    {formData.participants.map((pid, i) => (
                        <div key={pid} className="relative group">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-blue-500/20 border border-white/10 flex items-center justify-center text-xs font-bold">
                                {pid === user?.id ? 'ME' : `U${i}`}
                            </div>
                            {pid !== user?.id && (
                                <button 
                                    onClick={() => toggleParticipant(pid)}
                                    className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Users size={8} className="text-white" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Date & Time Selection */}
            <div className="space-y-4 pt-4 border-t border-white/10">
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
                    <div className="grid grid-cols-2 gap-2">
                        {['Chill', 'Vibey', 'Going out', 'Full send'].map((e) => (
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
                        {['Dinner', 'Drinks', 'Brunch', 'Club', 'Activity'].map((c) => (
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
