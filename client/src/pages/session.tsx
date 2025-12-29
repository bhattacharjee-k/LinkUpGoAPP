import React, { useEffect, useRef, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useApp } from '@/lib/context';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Send, ThumbsUp, ThumbsDown, Flame, MapPin, DollarSign, Users, Bot, Star, UserPlus, Link as LinkIcon, Check, Copy, X, Shield, Lock, Ban, ArrowLeft, Pencil, RefreshCw, Calendar, Clock, Zap, MoreVertical, LogOut, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from '@/hooks/use-toast';
import { PlanningSession, Budget, Energy, Category } from '@/lib/store';
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";

export function Session() {
  const [match, params] = useRoute('/session/:id');
  const { getSession, addMessage, sendPlannerMessage, voteForSuggestion, confirmPlan, addParticipantToSession, updateSessionFilters, regenerateSuggestions, user, groups, isAdmin, deleteSession, leaveSession } = useApp();
  const [input, setInput] = useState('');
  const [_, setLocation] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  const session = getSession(params?.id || '');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newParticipantName, setNewParticipantName] = useState('');
  const [tieBreakerOpen, setTieBreakerOpen] = useState(false);
  const [tieOptions, setTieOptions] = useState<string[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showRegenerateCta, setShowRegenerateCta] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [streamingResponse, setStreamingResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [editForm, setEditForm] = useState({
    date: new Date(),
    timeStart: '19:00',
    timeEnd: '22:00',
    flexibility: 'strict',
    budget: '$$' as Budget,
    energy: 'Vibey' as Energy,
    categories: [] as Category[],
    distance: '1 mi',
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session?.messages]);

  if (!session) return (
      <div className="h-screen flex flex-col items-center justify-center p-6 text-center space-y-4">
          <h2 className="text-xl font-bold">Session Not Found</h2>
          <Button onClick={() => setLocation('/')}>Go Home</Button>
      </div>
  );

  const group = groups.find(g => g.id === session.groupId);
  const allParticipants = session.participants || [];
  // Filter out users who have left
  const participants = allParticipants.filter(pid => {
    const status = session.participantStatusByUserId?.[pid];
    return status !== 'left';
  });
  const isUserAdmin = group ? isAdmin(group.id) : false;
  const isLocked = session.status === 'locked';

  const handleSend = async () => {
    if (!input.trim()) return;
    const messageText = input;
    setInput('');
    
    // Check if this is a planner message (case-insensitive, handles @planner, @Planner, planner, etc.)
    const isPlannerMessage = messageText.toLowerCase().includes('@planner') || messageText.toLowerCase().startsWith('planner ');
    
    if (isPlannerMessage) {
      // Start streaming response
      setIsStreaming(true);
      setStreamingResponse('');
      
      try {
        const response = await sendPlannerMessage(session.id, messageText, (chunk) => {
          setStreamingResponse(prev => prev + chunk);
        });
        
        // If the response indicates an error, show it
        if (response.includes("trouble connecting") || response.includes("Try again")) {
          toast({ title: "Planner unavailable", description: response, variant: "destructive" });
        }
      } catch (error) {
        console.error('Planner error:', error);
        toast({ title: "Error", description: "Failed to get planner response", variant: "destructive" });
      } finally {
        setIsStreaming(false);
        setStreamingResponse('');
      }
    } else {
      // Regular message
      addMessage(session.id, messageText);
    }
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/join-plan/${session.inviteCode}`;
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
             navigator.clipboard.writeText(message);
             setCopied(true);
             setTimeout(() => setCopied(false), 2000);
             toast({ title: "Link copied!" });
        });
    } else {
        navigator.clipboard.writeText(message);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast({ title: "Link copied!" });
    }
  };

  const handleAddParticipant = () => {
    if (!newParticipantName.trim()) return;
    const mockId = `user-${Math.random().toString(36).substr(2, 5)}`;
    addParticipantToSession(session.id, mockId);
    setNewParticipantName('');
    toast({ title: "Added to plan", description: "User added to this session." });
    setInviteOpen(false);
  };

  const handleAddGroupMember = (memberId: string) => {
      addParticipantToSession(session.id, memberId);
      toast({ title: "Added", description: "Group member added to plan." });
  };

  // Initialize edit form from session filters
  useEffect(() => {
    if (session?.filters) {
      const f = session.filters;
      setEditForm(prev => ({
        ...prev,
        budget: f.budget || '$$',
        energy: f.energy || 'Vibey',
        categories: f.category || [],
        date: f.specificDate ? new Date(f.specificDate) : new Date(),
        timeStart: f.specificTime?.split('-')[0] || '19:00',
        timeEnd: f.specificTime?.split('-')[1] || '22:00',
        flexibility: f.flexibility || 'strict',
        distance: f.distance || '1 mi',
      }));
    }
  }, [session?.filters]);

  const toggleCategory = (c: Category) => {
    setEditForm(prev => ({
      ...prev,
      categories: prev.categories.includes(c)
        ? prev.categories.filter(x => x !== c)
        : [...prev.categories, c]
    }));
  };

  const handleSaveEdit = async () => {
    const updatedFilters = {
      ...session.filters,
      budget: editForm.budget,
      energy: editForm.energy,
      category: editForm.categories.length > 0 ? editForm.categories : session.filters.category,
      specificDate: editForm.date.toISOString(),
      specificTime: `${editForm.timeStart}-${editForm.timeEnd}`,
      flexibility: editForm.flexibility,
      distance: editForm.distance,
    };
    
    await updateSessionFilters(session.id, updatedFilters);
    setEditOpen(false);
    setShowRegenerateCta(true);
    toast({ title: "Plan updated!", description: "Your preferences have been saved." });
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await regenerateSuggestions(session.id);
      setShowRegenerateCta(false);
      toast({ title: "Options regenerated!", description: "New suggestions based on your updated preferences." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to regenerate options.", variant: "destructive" });
    } finally {
      setIsRegenerating(false);
    }
  };

  const calculateScore = (suggestion: any) => {
      let score = 0;
      // Only count votes from active participants (exclude 'cant_make_it' and 'left')
      Object.entries(suggestion.votes).forEach(([uid, vote]) => {
          const status = session.participantStatusByUserId?.[uid];
          // Skip if user has left or can't make it
          if (status === 'cant_make_it' || status === 'left') {
              return;
          }

          if (vote === 'yes') score += 1;
          if (vote === 'fire') score += 2;
          if (vote === 'no') score -= 1;
      });
      return score;
  };

  const handleLockIn = (suggestionId: string) => {
      // If manually clicking "Lock It In", just do it
      confirmPlan(session.id, suggestionId);
      toast({ title: "Plan Locked!", description: "The group is going!" });
  };
  
  const handleAdminLock = () => {
      // Find winner based on scores
      const scoredSuggestions = session.suggestions.map(s => ({ ...s, score: calculateScore(s) }));
      const maxScore = Math.max(...scoredSuggestions.map(s => s.score));
      const winners = scoredSuggestions.filter(s => s.score === maxScore);

      if (winners.length > 1) {
          setTieOptions(winners.map(w => w.id));
          setTieBreakerOpen(true);
      } else if (winners.length === 1) {
          handleLockIn(winners[0].id);
      } else {
          // No votes? Just pick the first one or show error
          handleLockIn(session.suggestions[0].id);
      }
  };

  const handleLeavePlan = async () => {
    try {
      await leaveSession(session.id);
      setLeaveDialogOpen(false);
      toast({ title: "Left plan", description: "You've been removed from this plan." });
      setLocation('/');
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to leave plan", variant: "destructive" });
    }
  };

  const handleDeletePlan = async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast({ title: "Confirmation required", description: "Type DELETE to confirm.", variant: "destructive" });
      return;
    }
    try {
      await deleteSession(session.id);
      setDeleteDialogOpen(false);
      toast({ title: "Plan deleted", description: "This plan has been permanently deleted." });
      setLocation('/');
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete plan", variant: "destructive" });
    }
  };

  const sortedSuggestions = [...session.suggestions].sort((a, b) => {
      // If locked, pin winner to top
      if (session.winningOptionId) {
          if (a.id === session.winningOptionId) return -1;
          if (b.id === session.winningOptionId) return 1;
      }
      return calculateScore(b) - calculateScore(a);
  });

  // --- EMPTY STATES ---
  if (participants.length === 0) {
      return (
          <Layout hideNav>
              <div className="h-screen flex flex-col items-center justify-center p-6 text-center space-y-6">
                   <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center">
                       <Users size={40} className="text-muted-foreground" />
                   </div>
                   <div className="space-y-2">
                       <h2 className="text-2xl font-bold">No one here yet</h2>
                       <p className="text-muted-foreground">Add some friends to start planning.</p>
                   </div>
                   <Button onClick={() => setInviteOpen(true)} className="bg-primary text-black font-bold">
                       Add People / Send Link
                   </Button>
                   
                   {/* Hidden Dialog for Logic reuse */}
                   <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                        <DialogTrigger asChild><span/></DialogTrigger>
                        <DialogContent className="bg-card border-white/10 w-[95%] max-w-sm rounded-2xl">
                           <DialogHeader><DialogTitle>Add to Plan</DialogTitle></DialogHeader>
                           <div className="space-y-4 pt-4">
                               <Button onClick={handleCopyLink} className="w-full"><Copy className="mr-2"/> Copy Invite Link</Button>
                           </div>
                        </DialogContent>
                   </Dialog>
              </div>
          </Layout>
      )
  }

  if (session.suggestions.length === 0) {
      return (
          <Layout hideNav>
             <div className="h-screen flex flex-col items-center justify-center p-6 text-center space-y-6">
                   <Button 
                     variant="ghost" 
                     size="icon" 
                     className="absolute top-4 left-4"
                     onClick={() => window.history.back()}
                   >
                     <ArrowLeft size={20} />
                   </Button>
                   <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center">
                       <MapPin size={40} className="text-muted-foreground" />
                   </div>
                   <div className="space-y-2">
                       <h2 className="text-2xl font-bold">No options found</h2>
                       <p className="text-muted-foreground">Try relaxing your filters to see more results.</p>
                   </div>
                   <div className="flex flex-col gap-2 w-full max-w-xs">
                       <Button variant="outline" onClick={() => toast({title: "Filters Updated", description: "Search radius increased."})}>Increase Distance</Button>
                       <Button variant="outline" onClick={() => toast({title: "Filters Updated", description: "Budget filter removed."})}>Increase Budget</Button>
                   </div>
                   <Button 
                     variant="ghost" 
                     className="text-muted-foreground"
                     onClick={() => window.history.back()}
                   >
                     Go Back
                   </Button>
              </div>
          </Layout>
      )
  }

  return (
    <Layout hideNav>
      <div className="flex flex-col h-screen max-h-screen">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 bg-background/80 backdrop-blur-md z-20 space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="font-bold text-lg leading-tight">{session.name || 'LinkUpGo Session'}</h2>
              <p className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                <span className={cn("w-2 h-2 rounded-full animate-pulse", !isLocked ? "bg-primary" : "bg-green-500")}/> 
                <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold uppercase", !isLocked ? "bg-primary/20 text-primary" : "bg-green-500/20 text-green-400")}>
                    {!isLocked ? 'Voting Open' : 'Locked'}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!isLocked && (
                <Sheet open={editOpen} onOpenChange={setEditOpen}>
                  <SheetTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8 text-xs border-white/10 bg-white/5" data-testid="button-edit-plan">
                      <Pencil size={12} className="mr-1" /> Edit Plan
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="bg-card border-white/10 rounded-t-3xl max-h-[85vh] overflow-y-auto">
                    <SheetHeader className="pb-4">
                      <SheetTitle>Edit Plan</SheetTitle>
                    </SheetHeader>
                    <div className="space-y-6 pb-8">
                      {/* Date & Time */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">When?</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal bg-white/5 border-white/10 h-10">
                              <Calendar className="mr-2 h-4 w-4" />
                              {editForm.date ? format(editForm.date, "PPP") : "Pick a date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-card border-white/10" align="start">
                            <CalendarPicker
                              mode="single"
                              selected={editForm.date}
                              onSelect={(d) => d && setEditForm({...editForm, date: d})}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Start</Label>
                            <Input 
                              type="time" 
                              className="bg-white/5 border-white/10 h-9" 
                              value={editForm.timeStart}
                              onChange={e => setEditForm({...editForm, timeStart: e.target.value})}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">End</Label>
                            <Input 
                              type="time" 
                              className="bg-white/5 border-white/10 h-9"
                              value={editForm.timeEnd}
                              onChange={e => setEditForm({...editForm, timeEnd: e.target.value})}
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {['strict', 'flexible'].map(f => (
                            <button
                              key={f}
                              onClick={() => setEditForm({...editForm, flexibility: f})}
                              className={cn(
                                "flex-1 h-9 rounded-lg border text-xs font-medium transition-all capitalize",
                                editForm.flexibility === f ? "bg-primary text-black border-primary font-bold" : "bg-white/5 border-white/10 text-muted-foreground"
                              )}
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Budget */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Budget</Label>
                        <div className="flex gap-2">
                          {['$', '$$', '$$$', '$$$$'].map((b) => (
                            <button
                              key={b}
                              onClick={() => setEditForm({...editForm, budget: b as Budget})}
                              className={cn(
                                "flex-1 h-9 rounded-lg border font-bold transition-all text-sm",
                                editForm.budget === b ? "bg-green-500/20 text-green-400 border-green-500/50" : "bg-white/5 border-white/10 text-muted-foreground"
                              )}
                            >
                              {b}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Energy */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Energy / Vibe</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {['Chill', 'Vibey', 'Going out', 'Full send'].map((e) => (
                            <button
                              key={e}
                              onClick={() => setEditForm({...editForm, energy: e as Energy})}
                              className={cn(
                                "h-9 rounded-lg border text-xs font-medium transition-all",
                                editForm.energy === e ? "bg-primary text-black border-primary font-bold" : "bg-white/5 border-white/10 text-muted-foreground"
                              )}
                            >
                              {e}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Category */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Category</Label>
                        <div className="flex flex-wrap gap-2">
                          {['Dinner', 'Drinks', 'Brunch', 'Club', 'Activity'].map((c) => (
                            <button
                              key={c}
                              onClick={() => toggleCategory(c as Category)}
                              className={cn(
                                "px-3 py-2 rounded-lg border text-xs font-medium transition-all",
                                editForm.categories.includes(c as Category) ? "bg-primary text-black border-primary font-bold" : "bg-white/5 border-white/10 text-muted-foreground"
                              )}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Distance */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Distance</Label>
                        <div className="flex gap-2">
                          {['0.5 mi', '1 mi', '2 mi', '5 mi'].map((d) => (
                            <button
                              key={d}
                              onClick={() => setEditForm({...editForm, distance: d})}
                              className={cn(
                                "flex-1 h-9 rounded-lg border text-xs font-medium transition-all",
                                editForm.distance === d ? "bg-primary text-black border-primary font-bold" : "bg-white/5 border-white/10 text-muted-foreground"
                              )}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Participants section */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <Label className="text-sm font-medium">Participants</Label>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-primary" onClick={() => { setEditOpen(false); setInviteOpen(true); }}>
                            <UserPlus size={12} className="mr-1" /> Invite
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {participants.map((pid, i) => {
                            const status = session.participantStatusByUserId?.[pid] || 'active';
                            const isCant = status === 'cant_make_it';
                            return (
                              <div key={pid} className={cn("flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5 border border-white/10 text-xs", isCant && "opacity-50")}>
                                <span>{pid === user?.id ? 'You' : `User ${i+1}`}</span>
                                {isCant && <Ban size={10} className="text-red-500" />}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex gap-2 items-center">
                          <div className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-md px-3 py-2 text-xs font-mono truncate text-muted-foreground">
                            {window.location.origin}/join-plan/{session.inviteCode}
                          </div>
                          <Button size="sm" variant="secondary" onClick={handleCopyLink} className="bg-white/10 h-8">
                            <Copy size={12} />
                          </Button>
                        </div>
                      </div>

                      <Button onClick={handleSaveEdit} className="w-full h-11 font-bold" data-testid="button-save-edit">
                        Save Changes
                      </Button>
                    </div>
                  </SheetContent>
                </Sheet>
              )}
              {isLocked && (
                <Badge className="bg-green-500 text-black font-bold border-none gap-1">
                    <Lock size={10} /> LOCKED
                </Badge>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" data-testid="button-plan-menu">
                    <MoreVertical size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-card border-white/10 w-48">
                  <DropdownMenuItem 
                    onClick={() => setLeaveDialogOpen(true)}
                    className="text-sm cursor-pointer focus:bg-white/10"
                    data-testid="menu-item-leave-plan"
                  >
                    <LogOut size={14} className="mr-2" />
                    Leave plan
                  </DropdownMenuItem>
                  {isUserAdmin && (
                    <>
                      <DropdownMenuSeparator className="bg-white/10" />
                      <DropdownMenuItem 
                        onClick={() => setDeleteDialogOpen(true)}
                        className="text-sm cursor-pointer text-red-500 focus:bg-red-500/10 focus:text-red-400"
                        data-testid="menu-item-delete-plan"
                      >
                        <Trash2 size={14} className="mr-2" />
                        Delete plan
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Plan Summary Chips */}
          <div className="flex flex-wrap gap-1.5">
            {session.filters?.specificDate && (
              <Badge variant="secondary" className="bg-white/5 border-white/10 text-[10px] gap-1">
                <Calendar size={10} /> {format(new Date(session.filters.specificDate), 'MMM d')}
              </Badge>
            )}
            {session.filters?.specificTime && (
              <Badge variant="secondary" className="bg-white/5 border-white/10 text-[10px] gap-1">
                <Clock size={10} /> {session.filters.specificTime}
              </Badge>
            )}
            {session.filters?.budget && (
              <Badge variant="secondary" className="bg-white/5 border-white/10 text-[10px] gap-1">
                <DollarSign size={10} /> {session.filters.budget}
              </Badge>
            )}
            {session.filters?.energy && (
              <Badge variant="secondary" className="bg-white/5 border-white/10 text-[10px] gap-1">
                <Zap size={10} /> {session.filters.energy}
              </Badge>
            )}
            {session.filters?.category?.map((cat: string) => (
              <Badge key={cat} variant="secondary" className="bg-white/5 border-white/10 text-[10px]">
                {cat}
              </Badge>
            ))}
          </div>

          {/* Locked Banner */}
          {isLocked && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 flex items-center justify-center text-xs text-green-400 font-medium">
                  <Lock size={12} className="mr-2" /> Plan locked — editing disabled.
              </div>
          )}

          {/* Regenerate Options CTA */}
          {!isLocked && showRegenerateCta && session.suggestions.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }}
              className="bg-primary/10 border border-primary/30 rounded-lg p-3 flex items-center justify-between"
            >
              <span className="text-xs text-primary font-medium">Filters updated! Get new options?</span>
              <Button 
                size="sm" 
                className="h-7 text-xs bg-primary text-black font-bold"
                onClick={handleRegenerate}
                disabled={isRegenerating}
                data-testid="button-regenerate"
              >
                {isRegenerating ? <RefreshCw size={12} className="animate-spin mr-1" /> : <RefreshCw size={12} className="mr-1" />}
                {isRegenerating ? 'Regenerating...' : 'Regenerate Options'}
              </Button>
            </motion.div>
          )}

          {/* Participants Bar */}
          <div className="flex flex-col gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
            <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Who's Going</span>
                <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] text-primary hover:text-primary hover:bg-primary/10 -mr-2" disabled={isLocked}>
                            Invite / Manage
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-white/10 w-[95%] max-w-sm rounded-2xl">
                        <DialogHeader>
                            <DialogTitle>Add to Plan</DialogTitle>
                        </DialogHeader>
                         <div className="space-y-6 pt-4 overflow-y-auto max-h-[60vh] pr-1">
                            {/* Share Link */}
                            <div className="space-y-2 pb-4 border-b border-white/10">
                                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Share Plan Link</h4>
                                <div className="flex flex-col gap-2 w-full">
                                    <div className="flex gap-2 w-full">
                                        <div className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-md px-3 py-2 text-xs font-mono truncate text-muted-foreground">
                                            {window.location.origin}/join-plan/{session.inviteCode}
                                        </div>
                                    </div>
                                    <Button size="sm" variant="secondary" onClick={handleCopyLink} className="w-full bg-white/10 hover:bg-white/20 border-0 h-9">
                                        {copied ? <Check size={14} className="mr-2 text-green-500" /> : <LinkIcon size={14} className="mr-2" />}
                                        {copied ? "Link Copied" : "Copy Invite Link"}
                                    </Button>
                                </div>
                            </div>

                            {/* Add from Group */}
                            {group && (
                                <div className="space-y-2">
                                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">From {group.name}</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {group.members.filter(m => !participants.includes(m)).map(m => (
                                            <Button key={m} variant="outline" size="sm" onClick={() => handleAddGroupMember(m)} className="text-xs h-7 border-white/10">
                                                + {m.substr(0,4)}
                                            </Button>
                                        ))}
                                        {group.members.every(m => participants.includes(m)) && (
                                            <p className="text-xs text-muted-foreground italic">All group members added</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Direct Add */}
                            <div className="space-y-2">
                                 <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Invite by Name/Email</h4>
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
            </div>
            
            <div className="flex items-center justify-between">
                <div className="flex items-center -space-x-2 overflow-hidden">
                    {participants.map((pid, i) => {
                        const status = session.participantStatusByUserId?.[pid] || 'active';
                        const isCant = status === 'cant_make_it';
                        return (
                        <div key={pid} className={cn("relative", isCant && "opacity-50 grayscale")}>
                            <Avatar className="w-8 h-8 border-2 border-background">
                                <AvatarFallback className="text-[10px] bg-white/10 relative">
                                    {pid === user?.id ? 'ME' : `U${i}`}
                                    {group?.adminId === pid && (
                                        <div className="absolute -bottom-1 -right-1 bg-primary text-black rounded-full p-[2px] border border-black z-10">
                                            <Shield size={6} />
                                        </div>
                                    )}
                                </AvatarFallback>
                            </Avatar>
                            {isCant && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full z-20">
                                    <Ban size={12} className="text-red-500" />
                                </div>
                            )}
                        </div>
                    )})}
                    <button 
                        onClick={() => setInviteOpen(true)}
                        className="w-8 h-8 rounded-full bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors ml-2 disabled:opacity-50"
                        disabled={isLocked}
                    >
                        <UserPlus size={12} />
                    </button>
                </div>
                
                <Button size="sm" variant="secondary" className="h-8 text-xs bg-white/10 hover:bg-white/20 border-0" onClick={handleCopyLink}>
                    <LinkIcon size={12} className="mr-2" /> Send Link
                </Button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="suggestions" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-2">
             <TabsList className="w-full grid grid-cols-2 bg-white/5">
              <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
              <TabsTrigger value="chat">Chat</TabsTrigger>
            </TabsList>
          </div>

          {/* Suggestions Tab */}
          <TabsContent value="suggestions" className="flex-1 overflow-y-auto p-6 space-y-6 data-[state=inactive]:hidden">
             {sortedSuggestions.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-6">
                 <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
                   <MapPin size={40} className="text-muted-foreground" />
                 </div>
                 <div className="space-y-2">
                   <h2 className="text-xl font-bold">No options found in {session.filters.locationScope || 'this area'}</h2>
                   <p className="text-muted-foreground max-w-md text-sm">
                     Try adjusting your filters to expand the search. You can change distance, budget, or categories to find more options.
                   </p>
                 </div>
                 {!isLocked && (
                   <Button 
                     onClick={() => setEditOpen(true)} 
                     className="bg-primary text-black font-bold"
                     data-testid="button-adjust-filters"
                   >
                     Adjust Filters
                   </Button>
                 )}
               </div>
             ) : (
               sortedSuggestions.map((suggestion, idx) => {
               const myVote = suggestion.votes[user?.id || 'me'];
               const score = calculateScore(suggestion);
               
               return (
               <motion.div 
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: idx * 0.1 }}
                 key={suggestion.id} 
                 className={cn(
                   "group relative rounded-2xl overflow-hidden border transition-all duration-300",
                   session.winningOptionId === suggestion.id ? "border-green-500 ring-2 ring-green-500/50" : "border-white/10 bg-white/5 hover:bg-white/10"
                 )}
               >
                 {session.winningOptionId === suggestion.id && (
                     <div className="absolute top-2 right-2 z-10 bg-green-500 text-black text-xs font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1">
                         <Check size={10} /> WINNER
                     </div>
                 )}

                 {/* Pseudo-Image Header */}
                 <div className="h-24 bg-gradient-to-r from-gray-900 to-gray-800 relative p-4 flex flex-col justify-between">
                    <div className="flex justify-end items-start">
                       <div className="flex items-center gap-1 text-xs font-bold text-black bg-primary px-2 py-1 rounded-full backdrop-blur-md shadow-lg shadow-primary/20">
                         <Star size={10} className="text-black fill-black" /> {suggestion.rating}
                       </div>
                    </div>
                    <h3 className="text-xl font-bold text-white shadow-black/50 drop-shadow-md truncate">{suggestion.name}</h3>
                 </div>

                 <div className="p-4 space-y-4">
                   <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                     {suggestion.description}
                   </p>
                   
                   <div className="flex flex-wrap gap-2 text-xs">
                     <span className="px-2 py-1 rounded-md bg-white/5 border border-white/5 flex items-center gap-1">
                       <Users size={12} /> {suggestion.turnout}
                     </span>
                     <span className="px-2 py-1 rounded-md bg-white/5 border border-white/5 flex items-center gap-1">
                       <MapPin size={12} /> {suggestion.distance}
                     </span>
                     <span className="px-2 py-1 rounded-md bg-white/5 border border-white/5 flex items-center gap-1">
                       <DollarSign size={12} /> {suggestion.budget}
                     </span>
                   </div>

                   {/* Voting Actions */}
                   <div className="pt-2 border-t border-white/5">
                     <div className="flex justify-between items-center mb-2">
                         <span className="text-xs font-bold uppercase text-muted-foreground">Score: {score}</span>
                         {myVote && !isLocked && (
                             <span className="text-[10px] text-primary">You voted {myVote}</span>
                         )}
                     </div>

                     <div className="grid grid-cols-4 gap-2">
                       <Button 
                         variant="ghost" 
                         size="sm"
                         className={cn("h-10 rounded-lg border border-white/5", myVote === 'yes' ? "bg-primary text-black border-primary font-bold" : "bg-white/5 hover:bg-white/10")}
                         onClick={() => voteForSuggestion(session.id, suggestion.id, 'yes')}
                         disabled={isLocked}
                       >
                         <ThumbsUp size={16} className={cn("mr-1", myVote === 'yes' ? "fill-black" : "")} />
                         <span className="text-xs">{Object.values(suggestion.votes).filter(v => v === 'yes').length}</span>
                       </Button>
                       
                       <Button 
                         variant="ghost" 
                         size="sm"
                         className={cn("h-10 rounded-lg border border-white/5", myVote === 'fire' ? "bg-orange-500 text-white border-orange-500 font-bold" : "bg-white/5 hover:bg-white/10")}
                         onClick={() => voteForSuggestion(session.id, suggestion.id, 'fire')}
                         disabled={isLocked}
                       >
                         <Flame size={16} className={cn("mr-1", myVote === 'fire' ? "fill-white" : "")} />
                         <span className="text-xs">{Object.values(suggestion.votes).filter(v => v === 'fire').length}</span>
                       </Button>

                       <Button 
                         variant="ghost" 
                         size="sm"
                         className={cn("h-10 rounded-lg border border-white/5", myVote === 'no' ? "bg-red-500 text-white border-red-500 font-bold" : "bg-white/5 hover:bg-white/10")}
                         onClick={() => voteForSuggestion(session.id, suggestion.id, 'no')}
                         disabled={isLocked}
                       >
                         <ThumbsDown size={16} className="mr-1" />
                         <span className="text-xs">{Object.values(suggestion.votes).filter(v => v === 'no').length}</span>
                       </Button>

                       <Button 
                         variant="ghost" 
                         size="sm"
                         className={cn("h-10 rounded-lg border border-white/5", myVote === 'cant' ? "bg-gray-600 text-white border-gray-600 font-bold" : "bg-white/5 hover:bg-white/10")}
                         onClick={() => voteForSuggestion(session.id, suggestion.id, 'cant')}
                         disabled={isLocked}
                         title="Can't make this option"
                       >
                         <Ban size={16} className="mr-1" />
                         <span className="text-[10px]">Can't</span>
                       </Button>
                     </div>
                   </div>

                   {isUserAdmin && !isLocked && (
                        <Button 
                            variant="secondary" 
                            className="w-full bg-white/5 hover:bg-primary hover:text-black transition-all text-xs h-8 font-bold mt-2 border border-white/5"
                            onClick={() => confirmPlan(session.id, suggestion.id)}
                        >
                            <Shield size={12} className="mr-2" /> Lock In
                        </Button>
                   )}
                 </div>
               </motion.div>
             );
             })
             )}
             
             {/* Admin Confirm All / Tie Breaker Button */}
             {isUserAdmin && !isLocked && session.suggestions.length > 0 && (
                 <div className="sticky bottom-0 pt-4 pb-2 bg-gradient-to-t from-background via-background to-transparent z-10">
                    <Button onClick={handleAdminLock} className="w-full bg-primary text-black font-bold h-12 shadow-lg shadow-primary/20">
                        Confirm Winning Plan
                    </Button>
                 </div>
             )}
          </TabsContent>

          {/* Chat Tab */}
          <TabsContent value="chat" className="flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden">
            <ScrollArea className="flex-1 px-4 py-4" ref={scrollRef}>
              <div className="space-y-4 min-h-full flex flex-col justify-end pb-4">
                {session.messages.map(msg => {
                  const isCurrentUser = msg.sender === user?.id;
                  const isPlannerAi = msg.sender === 'planner-ai';
                  const isSystem = msg.sender === 'system';
                  
                  return (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    key={msg.id} 
                    className={cn(
                      "max-w-[80%] p-3 text-sm rounded-2xl",
                      isCurrentUser ? "ml-auto bg-primary text-black font-medium rounded-br-none" : 
                      isPlannerAi ? "bg-white/10 text-white border border-white/10 rounded-bl-none" :
                      isSystem ? "bg-white/10 text-muted-foreground text-xs text-center mx-auto" :
                      "bg-white/5 text-white rounded-bl-none"
                    )}
                  >
                    {isPlannerAi && <div className="text-[10px] text-primary font-bold mb-1 flex items-center gap-1"><Bot size={10} /> Planner</div>}
                    {msg.text}
                  </motion.div>
                  );
                })}
                
                {/* Streaming response */}
                {isStreaming && streamingResponse && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-[80%] p-3 text-sm rounded-2xl bg-white/10 text-white border border-white/10 rounded-bl-none"
                  >
                    <div className="text-[10px] text-primary font-bold mb-1 flex items-center gap-1"><Bot size={10} /> Planner</div>
                    {streamingResponse}
                    <span className="inline-block w-1 h-4 bg-primary ml-1 animate-pulse" />
                  </motion.div>
                )}
                
                {/* Typing indicator when waiting for response */}
                {isStreaming && !streamingResponse && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-[80%] p-3 text-sm rounded-2xl bg-white/10 text-white border border-white/10 rounded-bl-none"
                  >
                    <div className="text-[10px] text-primary font-bold mb-1 flex items-center gap-1"><Bot size={10} /> Planner</div>
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </motion.div>
                )}
              </div>
            </ScrollArea>
            <div className="p-4 bg-background border-t border-white/10 flex gap-2">
              <div className="relative flex-1">
                <Input 
                  placeholder="Discuss or ask @Planner..." 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  className="pr-10 bg-white/5 border-white/10 focus-visible:ring-primary text-white placeholder:text-muted-foreground"
                />
              </div>
              <Button size="icon" onClick={handleSend} className="bg-primary hover:bg-primary/90 text-black">
                <Send size={16} />
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* Tie Breaker Dialog */}
        <Dialog open={tieBreakerOpen} onOpenChange={setTieBreakerOpen}>
            <DialogContent className="bg-card border-white/10 w-[95%] max-w-sm rounded-2xl">
                <DialogHeader>
                    <DialogTitle>Tie Breaker needed!</DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-3">
                    <p className="text-sm text-muted-foreground">Multiple options have the highest score. As admin, please pick the winner:</p>
                    {tieOptions.map(optId => {
                        const opt = session.suggestions.find(s => s.id === optId);
                        if (!opt) return null;
                        return (
                            <Button key={optId} onClick={() => { handleLockIn(optId); setTieBreakerOpen(false); }} className="w-full justify-between" variant="outline">
                                <span>{opt.name}</span>
                                <Badge>{calculateScore(opt)} pts</Badge>
                            </Button>
                        )
                    })}
                </div>
            </DialogContent>
        </Dialog>

        {/* Leave Plan Dialog */}
        <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
          <DialogContent className="bg-card border-white/10 w-[95%] max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle>Leave this plan?</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                You'll be removed from this plan and won't be able to vote or see updates.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-row gap-2 sm:gap-2">
              <Button 
                variant="outline" 
                onClick={() => setLeaveDialogOpen(false)}
                className="flex-1 border-white/10 bg-white/5"
                data-testid="button-cancel-leave"
              >
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={handleLeavePlan}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                data-testid="button-confirm-leave"
              >
                Leave Plan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Plan Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="bg-card border-white/10 w-[95%] max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle>Delete this plan?</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                This action cannot be undone. All votes and messages will be permanently deleted.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm">Type <span className="font-mono font-bold text-primary">DELETE</span> to confirm:</p>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE"
                className="bg-white/5 border-white/10"
                data-testid="input-delete-confirm"
              />
            </div>
            <DialogFooter className="flex-row gap-2 sm:gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setDeleteConfirmText('');
                }}
                className="flex-1 border-white/10 bg-white/5"
                data-testid="button-cancel-delete"
              >
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={handleDeletePlan}
                disabled={deleteConfirmText !== 'DELETE'}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white disabled:opacity-50"
                data-testid="button-confirm-delete"
              >
                Delete Forever
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
