import React, { useEffect, useRef, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useApp, subscribeToSessionMessages } from '@/lib/context';
import { api } from '@/lib/api';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Send, ThumbsUp, ThumbsDown, MapPin, DollarSign, Users, Bot, Star, UserPlus, Link as LinkIcon, Check, Copy, X, Shield, Lock, Ban, ArrowLeft, Pencil, RefreshCw, Calendar, Clock, Zap, MoreVertical, LogOut, Trash2, Info, ChevronRight } from 'lucide-react';
import { DownvoteModal } from '@/components/downvote-modal';
import { calculateScore, getVoteSummary, REASON_PENALTIES } from '@shared/ranking';
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
  const { getSession, addMessage, sendPlannerMessage, upvoteForSuggestion, downvoteForSuggestion, confirmPlan, addParticipantToSession, updateSessionFilters, regenerateSuggestions, user, groups, isAdmin, deleteSession, leaveSession, refreshSession } = useApp();
  const [input, setInput] = useState('');
  const [_, setLocation] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [realtimeMessages, setRealtimeMessages] = useState<any[]>([]);
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
  const [downvoteModalOpen, setDownvoteModalOpen] = useState(false);
  const [downvoteSuggestion, setDownvoteSuggestion] = useState<{id: string; name: string} | null>(null);
  const [rankingInfoOpen, setRankingInfoOpen] = useState(false);
  const [infoSuggestion, setInfoSuggestion] = useState<any>(null);
  const [infoVoteData, setInfoVoteData] = useState<any[]>([]);
  const [membersOpen, setMembersOpen] = useState(false);
  const [proposeTimeOpen, setProposeTimeOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({
    rating: 0,
    review: '',
    tags: [] as string[],
    wouldRecommend: null as boolean | null,
  });
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [proposedTimes, setProposedTimes] = useState<Array<{
    id: string;
    sessionId: string;
    userId: string;
    proposedDate: string;
    timeStart: string;
    timeEnd: string;
    note?: string | null;
    votes: string[];
    proposerName: string;
    createdAt: string;
  }>>([]);
  const [proposeTimeForm, setProposeTimeForm] = useState({
    date: new Date(),
    timeStart: '19:00',
    timeEnd: '22:00',
    note: ''
  });
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
  
  const session = getSession(params?.id || '');

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session?.messages, realtimeMessages]);

  // Subscribe to real-time messages via WebSocket
  useEffect(() => {
    if (!session?.id) return;
    
    const unsubscribe = subscribeToSessionMessages(session.id, (newMessage) => {
      // Check if message already exists in session.messages
      const exists = session.messages.some(m => m.id === newMessage.id);
      if (!exists) {
        setRealtimeMessages(prev => {
          // Avoid duplicates in realtime messages too
          if (prev.some(m => m.id === newMessage.id)) return prev;
          return [...prev, newMessage];
        });
      }
    });
    
    return () => {
      unsubscribe();
      setRealtimeMessages([]);
    };
  }, [session?.id]);

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

  // Load proposed times
  useEffect(() => {
    if (session?.id) {
      api.proposedTimes.list(session.id).then(setProposedTimes).catch(console.error);
    }
  }, [session?.id]);

  // Check if feedback already submitted for locked sessions
  useEffect(() => {
    if (session?.id && session.status === 'locked') {
      api.feedback.get(session.id).then(data => {
        setFeedbackSubmitted(data.hasSubmitted);
      }).catch(console.error);
    }
  }, [session?.id, session?.status]);

  const handleSubmitFeedback = async () => {
    if (!session?.id || feedbackForm.rating === 0) return;
    
    setIsSubmittingFeedback(true);
    try {
      const winningSuggestion = session.winningOptionId 
        ? session.suggestions?.find(s => s.id === session.winningOptionId)
        : session.suggestions?.[0];
      await api.feedback.submit(session.id, {
        rating: feedbackForm.rating,
        review: feedbackForm.review || undefined,
        tags: feedbackForm.tags.length > 0 ? feedbackForm.tags : undefined,
        wouldRecommend: feedbackForm.wouldRecommend,
        suggestionId: winningSuggestion?.id,
      });
      setFeedbackSubmitted(true);
      setFeedbackOpen(false);
      toast({ title: "Thanks for your feedback!", description: "Your rating helps us improve recommendations." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const feedbackTags = [
    { value: 'great_vibes', label: 'Great vibes' },
    { value: 'good_food', label: 'Good food' },
    { value: 'affordable', label: 'Affordable' },
    { value: 'crowded', label: 'Too crowded' },
    { value: 'expensive', label: 'Expensive' },
    { value: 'hard_to_find', label: 'Hard to find' },
    { value: 'fun_activities', label: 'Fun activities' },
    { value: 'great_service', label: 'Great service' },
  ];

  const handleProposeTime = async () => {
    if (!session?.id) return;
    try {
      await api.proposedTimes.create(session.id, {
        proposedDate: proposeTimeForm.date.toISOString(),
        timeStart: proposeTimeForm.timeStart,
        timeEnd: proposeTimeForm.timeEnd,
        note: proposeTimeForm.note || undefined
      });
      const updated = await api.proposedTimes.list(session.id);
      setProposedTimes(updated);
      setProposeTimeOpen(false);
      setProposeTimeForm({ date: new Date(), timeStart: '19:00', timeEnd: '22:00', note: '' });
      toast({ title: "Time proposed", description: "Your alternative time has been added." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleVoteForTime = async (timeId: string) => {
    if (!session?.id) return;
    try {
      await api.proposedTimes.vote(timeId);
      const updated = await api.proposedTimes.list(session.id);
      setProposedTimes(updated);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteProposedTime = async (timeId: string) => {
    if (!session?.id) return;
    try {
      await api.proposedTimes.delete(timeId);
      const updated = await api.proposedTimes.list(session.id);
      setProposedTimes(updated);
      toast({ title: "Deleted", description: "Proposed time removed." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

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

  // Build a map of user id to member details for name lookup
  const memberDetailsMap = new Map<string, { id: string; name: string; username: string }>();
  groups.forEach(g => {
    g.memberDetails?.forEach(m => memberDetailsMap.set(m.id, m));
  });

  // Helper to get display name for a user id
  const getDisplayName = (userId: string): string => {
    if (userId === user?.id) return 'You';
    const details = memberDetailsMap.get(userId);
    return details?.name || details?.username || `User`;
  };

  // Helper to get initials for a user id
  const getInitials = (userId: string): string => {
    if (userId === user?.id) return 'ME';
    const details = memberDetailsMap.get(userId);
    if (details?.name) {
      return details.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return details?.username?.substring(0, 2).toUpperCase() || '??';
  };
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

  const sessionInviteCode = (session.filters as any)?.inviteCode || '';
  
  const handleCopyLink = () => {
    const link = `${window.location.origin}/join-plan/${sessionInviteCode}`;
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

  const getSuggestionVoteData = (suggestion: any) => {
    const votesList = Object.entries(suggestion.votes || {})
      .filter(([uid]) => {
        const status = session.participantStatusByUserId?.[uid];
        return status !== 'cant_make_it' && status !== 'left';
      })
      .map(([userId, v]) => {
        if (typeof v === 'object' && v !== null) {
          return { userId, voteType: (v as any).voteType || 'up', reasons: (v as any).reasons, note: (v as any).note };
        }
        const voteType = (v === 'yes' || v === 'fire') ? 'up' : 'down';
        return { userId, voteType, reasons: null, note: null };
      });
    return votesList;
  };
  
  const getScore = (suggestion: any) => {
    const votes = getSuggestionVoteData(suggestion);
    return calculateScore(votes);
  };
  
  const getMyVote = (suggestion: any) => {
    const vote = suggestion.votes?.[user?.id || ''];
    if (!vote) return null;
    if (typeof vote === 'object') return vote.voteType;
    return (vote === 'yes' || vote === 'fire') ? 'up' : 'down';
  };

  const handleUpvote = async (suggestionId: string) => {
    await upvoteForSuggestion(session.id, suggestionId);
  };

  const handleDownvote = (suggestionId: string, name: string) => {
    setDownvoteSuggestion({ id: suggestionId, name });
    setDownvoteModalOpen(true);
  };

  const submitDownvote = async (reasons: string[], note?: string) => {
    if (downvoteSuggestion) {
      await downvoteForSuggestion(session.id, downvoteSuggestion.id, reasons, note);
    }
  };

  const handleLockIn = async (suggestionId: string) => {
      await confirmPlan(session.id, suggestionId);
      toast({ title: "Plan Locked!", description: "The group is going!" });
      // Navigate to the complete page
      setLocation(`/session/${session.id}/complete`);
  };
  
  const handleAdminLock = () => {
      const scoredSuggestions = session.suggestions.map(s => ({ ...s, score: getScore(s) }));
      const maxScore = Math.max(...scoredSuggestions.map(s => s.score));
      const winners = scoredSuggestions.filter(s => s.score === maxScore);

      if (winners.length > 1) {
          setTieOptions(winners.map(w => w.id));
          setTieBreakerOpen(true);
      } else if (winners.length === 1) {
          handleLockIn(winners[0].id);
      } else {
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
      if (session.winningOptionId) {
          if (a.id === session.winningOptionId) return -1;
          if (b.id === session.winningOptionId) return 1;
      }
      return getScore(b) - getScore(a);
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
                  <SheetContent side="bottom" className="bg-card border-white/10 rounded-t-3xl max-h-[65vh] overflow-y-auto">
                    <SheetHeader className="pb-2 sticky top-0 bg-card z-10">
                      <SheetTitle>Edit Plan</SheetTitle>
                    </SheetHeader>
                    <div className="space-y-4 pb-6">
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
                                <span>{getDisplayName(pid)}</span>
                                {isCant && <Ban size={10} className="text-red-500" />}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex gap-2 items-center">
                          <div className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-md px-3 py-2 text-xs font-mono truncate text-muted-foreground">
                            {window.location.origin}/join-plan/{sessionInviteCode}
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

          {/* Proposed Times Section */}
          {!isLocked && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Alternative Times</span>
                <Dialog open={proposeTimeOpen} onOpenChange={setProposeTimeOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] text-primary hover:text-primary hover:bg-primary/10 -mr-2" data-testid="button-propose-time">
                      <Clock size={10} className="mr-1" /> Propose New Time
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-card border-white/10 w-[95%] max-w-sm rounded-2xl">
                    <DialogHeader>
                      <DialogTitle>Propose a New Time</DialogTitle>
                      <DialogDescription>Suggest an alternative date and time for this plan.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label className="text-xs">Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal bg-white/5 border-white/10">
                              <Calendar size={14} className="mr-2" />
                              {format(proposeTimeForm.date, 'PPP')}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-card border-white/10" align="start">
                            <CalendarPicker
                              mode="single"
                              selected={proposeTimeForm.date}
                              onSelect={(d) => d && setProposeTimeForm(prev => ({ ...prev, date: d }))}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="text-xs">Start Time</Label>
                          <Input 
                            type="time" 
                            value={proposeTimeForm.timeStart} 
                            onChange={(e) => setProposeTimeForm(prev => ({ ...prev, timeStart: e.target.value }))}
                            className="bg-white/5 border-white/10"
                            data-testid="input-propose-time-start"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">End Time</Label>
                          <Input 
                            type="time" 
                            value={proposeTimeForm.timeEnd} 
                            onChange={(e) => setProposeTimeForm(prev => ({ ...prev, timeEnd: e.target.value }))}
                            className="bg-white/5 border-white/10"
                            data-testid="input-propose-time-end"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Note (optional)</Label>
                        <Input 
                          placeholder="e.g., Works better for me because..."
                          value={proposeTimeForm.note}
                          onChange={(e) => setProposeTimeForm(prev => ({ ...prev, note: e.target.value }))}
                          className="bg-white/5 border-white/10"
                          data-testid="input-propose-time-note"
                        />
                      </div>
                    </div>
                    <DialogFooter className="mt-4">
                      <Button onClick={handleProposeTime} className="w-full bg-primary text-black font-bold" data-testid="button-submit-propose-time">
                        Propose This Time
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {proposedTimes.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No alternative times proposed yet.</p>
              ) : (
                <div className="space-y-2">
                  {proposedTimes.map((pt) => (
                    <div key={pt.id} className="bg-white/5 rounded-lg p-2 space-y-1" data-testid={`proposed-time-${pt.id}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="bg-primary/20 text-primary text-[10px]">
                            <Calendar size={10} className="mr-1" /> {format(new Date(pt.proposedDate), 'MMM d')}
                          </Badge>
                          <Badge variant="secondary" className="bg-white/10 text-[10px]">
                            <Clock size={10} className="mr-1" /> {pt.timeStart}-{pt.timeEnd}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button 
                            size="sm" 
                            variant={pt.votes.includes(user?.id || '') ? "default" : "ghost"}
                            className={cn("h-6 text-[10px] px-2", pt.votes.includes(user?.id || '') && "bg-primary text-black")}
                            onClick={() => handleVoteForTime(pt.id)}
                            data-testid={`button-vote-time-${pt.id}`}
                          >
                            <ThumbsUp size={10} className="mr-1" /> {pt.votes.length}
                          </Button>
                          {pt.userId === user?.id && (
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              onClick={() => handleDeleteProposedTime(pt.id)}
                              data-testid={`button-delete-time-${pt.id}`}
                            >
                              <X size={12} />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>by {pt.proposerName}</span>
                        {pt.note && <span>• {pt.note}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Locked Banner */}
          {isLocked && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 flex items-center justify-center text-xs text-green-400 font-medium">
                  <Lock size={12} className="mr-2" /> Plan locked — editing disabled.
              </div>
          )}

          {/* Feedback CTA for locked plans */}
          {isLocked && !feedbackSubmitted && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-primary/10 border border-primary/30 rounded-lg p-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star size={16} className="text-primary" />
                  <span className="text-sm font-medium">How was the event?</span>
                </div>
                <Button 
                  size="sm" 
                  className="h-7 text-xs bg-primary text-black font-bold"
                  onClick={() => setFeedbackOpen(true)}
                  data-testid="button-leave-feedback"
                >
                  Leave Feedback
                </Button>
              </div>
            </motion.div>
          )}

          {/* Feedback submitted confirmation */}
          {isLocked && feedbackSubmitted && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 flex items-center justify-center text-xs text-green-400 font-medium">
              <Check size={12} className="mr-2" /> Thanks for your feedback!
            </div>
          )}

          {/* Feedback Dialog */}
          <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
            <DialogContent className="bg-card border-white/10 w-[95%] max-w-sm rounded-2xl">
              <DialogHeader>
                <DialogTitle>Rate this event</DialogTitle>
                <DialogDescription>Your feedback helps improve recommendations.</DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                {/* Star Rating */}
                <div className="flex flex-col items-center gap-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setFeedbackForm(prev => ({ ...prev, rating: star }))}
                        className="p-1 transition-transform hover:scale-110"
                        data-testid={`button-star-${star}`}
                      >
                        <Star
                          size={32}
                          className={cn(
                            "transition-colors",
                            star <= feedbackForm.rating
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-white/20"
                          )}
                        />
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {feedbackForm.rating === 0 ? 'Tap to rate' :
                     feedbackForm.rating === 1 ? 'Poor' :
                     feedbackForm.rating === 2 ? 'Fair' :
                     feedbackForm.rating === 3 ? 'Good' :
                     feedbackForm.rating === 4 ? 'Great' : 'Amazing!'}
                  </span>
                </div>

                {/* Tags */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">What stood out? (optional)</Label>
                  <div className="flex flex-wrap gap-2">
                    {feedbackTags.map(tag => (
                      <button
                        key={tag.value}
                        onClick={() => setFeedbackForm(prev => ({
                          ...prev,
                          tags: prev.tags.includes(tag.value)
                            ? prev.tags.filter(t => t !== tag.value)
                            : [...prev.tags, tag.value]
                        }))}
                        className={cn(
                          "px-2.5 py-1 text-xs rounded-full border transition-colors",
                          feedbackForm.tags.includes(tag.value)
                            ? "bg-primary text-black border-primary"
                            : "bg-white/5 border-white/10 hover:border-white/20"
                        )}
                        data-testid={`button-tag-${tag.value}`}
                      >
                        {tag.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Would Recommend */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Would you recommend this place?</Label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={feedbackForm.wouldRecommend === true ? "default" : "outline"}
                      className={cn(
                        "flex-1",
                        feedbackForm.wouldRecommend === true && "bg-green-500 hover:bg-green-600"
                      )}
                      onClick={() => setFeedbackForm(prev => ({ ...prev, wouldRecommend: true }))}
                      data-testid="button-recommend-yes"
                    >
                      <ThumbsUp size={14} className="mr-1" /> Yes
                    </Button>
                    <Button
                      size="sm"
                      variant={feedbackForm.wouldRecommend === false ? "default" : "outline"}
                      className={cn(
                        "flex-1",
                        feedbackForm.wouldRecommend === false && "bg-red-500 hover:bg-red-600"
                      )}
                      onClick={() => setFeedbackForm(prev => ({ ...prev, wouldRecommend: false }))}
                      data-testid="button-recommend-no"
                    >
                      <ThumbsDown size={14} className="mr-1" /> No
                    </Button>
                  </div>
                </div>

                {/* Review Text */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Additional notes (optional)</Label>
                  <Input
                    placeholder="Share your experience..."
                    value={feedbackForm.review}
                    onChange={e => setFeedbackForm(prev => ({ ...prev, review: e.target.value }))}
                    className="bg-white/5 border-white/10"
                    data-testid="input-review"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleSubmitFeedback}
                  disabled={feedbackForm.rating === 0 || isSubmittingFeedback}
                  className="w-full bg-primary text-black font-bold"
                  data-testid="button-submit-feedback"
                >
                  {isSubmittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
                                            {window.location.origin}/join-plan/{sessionInviteCode}
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
                                                + {getDisplayName(m)}
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
                <button 
                    onClick={() => setMembersOpen(true)}
                    className="flex items-center -space-x-2 overflow-hidden hover:opacity-80 transition-opacity"
                    data-testid="button-view-members"
                >
                    {participants.slice(0, 4).map((pid, i) => {
                        const status = session.participantStatusByUserId?.[pid] || 'active';
                        const isCant = status === 'cant_make_it';
                        return (
                        <div key={pid} className={cn("relative", isCant && "opacity-50 grayscale")}>
                            <Avatar className="w-8 h-8 border-2 border-background">
                                <AvatarFallback className="text-[10px] bg-white/10 relative">
                                    {getInitials(pid)}
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
                    {participants.length > 4 && (
                        <div className="w-8 h-8 rounded-full bg-white/10 border-2 border-background flex items-center justify-center text-[10px] font-medium">
                            +{participants.length - 4}
                        </div>
                    )}
                    <div className="w-8 h-8 rounded-full bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center text-muted-foreground ml-2">
                        <ChevronRight size={12} />
                    </div>
                </button>
                
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
               (() => {
                 // Calculate max score for highlighting leader
                 const allScores = sortedSuggestions.map(s => {
                   const vd = getSuggestionVoteData(s);
                   return getVoteSummary(vd).score;
                 });
                 const maxScore = Math.max(...allScores);
                 const hasVotes = maxScore > 0;
                 
                 return sortedSuggestions.map((suggestion, idx) => {
               const myVote = getMyVote(suggestion);
               const voteData = getSuggestionVoteData(suggestion);
               const voteSummary = getVoteSummary(voteData);
               const score = voteSummary.score;
               const effectiveCount = session.participantDetails?.filter((p: any) => p.status === 'active').length || 1;
               const isMajorityDownvoted = voteSummary.downvotes >= Math.ceil(effectiveCount / 2);
               const isLeading = hasVotes && score === maxScore && !isLocked && !isMajorityDownvoted;
               
               return (
               <motion.div 
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: idx * 0.1 }}
                 key={suggestion.id} 
                 className={cn(
                   "group relative rounded-2xl overflow-hidden border transition-all duration-300",
                   session.winningOptionId === suggestion.id ? "border-green-500 ring-2 ring-green-500/50" : 
                   isLeading ? "border-primary ring-1 ring-primary/30 bg-primary/5" : "border-white/10 bg-white/5 hover:bg-white/10"
                 )}
               >
                 {session.winningOptionId === suggestion.id && (
                     <div className="absolute top-2 right-2 z-10 bg-green-500 text-black text-xs font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1">
                         <Check size={10} /> WINNER
                     </div>
                 )}
                 {isLeading && !session.winningOptionId && (
                     <div className="absolute top-2 left-2 z-10 bg-primary text-black text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg flex items-center gap-1">
                         <Star size={10} className="fill-black" /> LEADING
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
                   
                   {/* Why we picked this */}
                   {suggestion.whyExplanation && (
                     <div className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
                       <p className="text-xs text-primary font-medium">
                         {suggestion.whyExplanation}
                       </p>
                     </div>
                   )}
                   
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
                     <div className="flex justify-between items-center mb-3">
                         <div className="flex items-center gap-2">
                           <span className="text-xs font-bold uppercase text-muted-foreground">Score: {score}</span>
                           <button 
                             onClick={() => { setInfoSuggestion(suggestion); setInfoVoteData(voteData); setRankingInfoOpen(true); }}
                             className="p-1 rounded-full bg-white/10 text-muted-foreground hover:text-foreground hover:bg-white/20 transition-colors"
                             data-testid={`button-info-ranking-${suggestion.id}`}
                           >
                             <Info size={14} />
                           </button>
                         </div>
                         {myVote && !isLocked && (
                             <span className="text-[10px] text-primary">You voted {myVote === 'up' ? '👍' : '👎'}</span>
                         )}
                     </div>

                     <div className="grid grid-cols-2 gap-2">
                       <Button 
                         variant="ghost" 
                         size="sm"
                         className={cn("h-12 rounded-lg border border-white/5 flex-col gap-0.5", myVote === 'up' ? "bg-primary text-black border-primary font-bold" : "bg-white/5 hover:bg-white/10")}
                         onClick={() => handleUpvote(suggestion.id)}
                         disabled={isLocked}
                         data-testid={`button-upvote-${suggestion.id}`}
                       >
                         <ThumbsUp size={18} className={cn(myVote === 'up' ? "fill-black" : "")} />
                         <span className="text-xs">{voteSummary.upvotes}</span>
                       </Button>
                       
                       <Button 
                         variant="ghost" 
                         size="sm"
                         className={cn("h-12 rounded-lg border border-white/5 flex-col gap-0.5", myVote === 'down' ? "bg-red-500 text-white border-red-500 font-bold" : "bg-white/5 hover:bg-white/10")}
                         onClick={() => handleDownvote(suggestion.id, suggestion.name)}
                         disabled={isLocked}
                         data-testid={`button-downvote-${suggestion.id}`}
                       >
                         <ThumbsDown size={18} />
                         <span className="text-xs">{voteSummary.downvotes}</span>
                       </Button>
                     </div>
                   </div>

                   {/* Link Buttons */}
                   {(() => {
                     const links: Array<{url: string; label: string}> = [];
                     
                     if (suggestion.reservationUrl) {
                       links.push({url: suggestion.reservationUrl, label: 'Reserve'});
                     }
                     if (suggestion.ticketUrl) {
                       links.push({url: suggestion.ticketUrl, label: 'Tickets'});
                     }
                     if (suggestion.eventUrl && links.length < 2) {
                       links.push({url: suggestion.eventUrl, label: 'Events'});
                     }
                     if (suggestion.detailUrl && links.length < 2) {
                       links.push({url: suggestion.detailUrl, label: 'Details'});
                     }
                     
                     const displayLinks = links.slice(0, 2);
                     
                     if (displayLinks.length === 0) return null;
                     
                     return (
                       <div className="pt-3 border-t border-white/5">
                         <div className={cn("grid gap-2", displayLinks.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                           {displayLinks.map((link, i) => (
                             <a
                               key={i}
                               href={link.url}
                               target="_blank"
                               rel="noopener noreferrer"
                               onClick={() => console.log('[Link Click]', {suggestion: suggestion.name, link: link.label, url: link.url})}
                               className="flex items-center justify-center gap-2 h-9 rounded-lg bg-primary text-black font-bold text-xs hover:bg-primary/90 transition-colors"
                               data-testid={`link-${link.label.toLowerCase()}-${suggestion.id}`}
                             >
                               {link.label}
                               <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
                             </a>
                           ))}
                         </div>
                       </div>
                     );
                   })()}

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
             });
             })()
             )}
             
             {/* All Votes In Button - active when at least 1 vote exists */}
             {!isLocked && session.suggestions.length > 0 && (() => {
               const totalVotes = session.suggestions.reduce((acc, s) => {
                 const voteData = getSuggestionVoteData(s);
                 const summary = getVoteSummary(voteData);
                 return acc + summary.upvotes + summary.downvotes;
               }, 0);
               const hasAnyVotes = totalVotes >= 1;
               
               return (
                 <div className="sticky bottom-0 pt-4 pb-2 bg-gradient-to-t from-background via-background to-transparent z-10">
                    <Button 
                      onClick={handleAdminLock} 
                      disabled={!hasAnyVotes}
                      className={cn(
                        "w-full font-bold h-12 shadow-lg",
                        hasAnyVotes 
                          ? "bg-primary text-black shadow-primary/20" 
                          : "bg-muted text-muted-foreground cursor-not-allowed"
                      )}
                      data-testid="button-all-votes-in"
                    >
                        <Check size={18} className="mr-2" />
                        All Votes In
                    </Button>
                    {!hasAnyVotes && (
                      <p className="text-center text-muted-foreground text-xs mt-2">
                        Vote on at least one option to continue
                      </p>
                    )}
                 </div>
               );
             })()}
          </TabsContent>

          {/* Chat Tab */}
          <TabsContent value="chat" className="flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden">
            <ScrollArea className="flex-1 px-4 py-4" ref={scrollRef}>
              <div className="space-y-4 min-h-full flex flex-col justify-end pb-4">
                {[...session.messages, ...realtimeMessages.filter(rm => !session.messages.some(m => m.id === rm.id))].map(msg => {
                  const isCurrentUser = msg.sender === user?.id;
                  const isPlannerAi = msg.sender === 'planner-ai';
                  const isSystem = msg.sender === 'system';
                  const isOtherUser = !isCurrentUser && !isPlannerAi && !isSystem;
                  // Look up sender name from participantDetails if senderName not in message
                  const participantName = session.participantDetails?.find(p => p.id === msg.sender)?.name;
                  const displayName = msg.senderName || participantName || (isCurrentUser ? 'You' : isPlannerAi ? 'Planner' : isSystem ? '' : 'User');
                  
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
                    {isOtherUser && <div className="text-[10px] text-blue-400 font-bold mb-1">{displayName}</div>}
                    {isCurrentUser && <div className="text-[10px] text-black/70 font-bold mb-1">You</div>}
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
                                <Badge>{getScore(opt)} pts</Badge>
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

        {/* Downvote Modal */}
        <DownvoteModal
          open={downvoteModalOpen}
          onClose={() => {
            setDownvoteModalOpen(false);
            setDownvoteSuggestion(null);
          }}
          onSubmit={submitDownvote}
          suggestionName={downvoteSuggestion?.name || ''}
        />

        {/* Why Ranked This Way Dialog */}
        <Dialog open={rankingInfoOpen} onOpenChange={(open) => { setRankingInfoOpen(open); if (!open) { setInfoSuggestion(null); setInfoVoteData([]); } }}>
          <DialogContent className="bg-card border-white/10 w-[95%] max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle className="truncate">{infoSuggestion?.name || 'Ranking Details'}</DialogTitle>
            </DialogHeader>
            {infoSuggestion && (() => {
              const summary = getVoteSummary(infoVoteData);
              const downvotes = infoVoteData.filter((v: any) => v.voteType === 'down');
              const allReasons = downvotes.flatMap((v: any) => v.reasons || []);
              const uniqueReasons = [...new Set(allReasons)];
              const otherNotes = downvotes.filter((v: any) => v.note).map((v: any) => v.note);
              const effectiveCount = session.participantDetails?.filter((p: any) => p.status === 'active').length || 1;
              const isMajorityDownvoted = summary.downvotes >= Math.ceil(effectiveCount / 2);
              
              const reasonLabels: Record<string, string> = {
                'TOO_FAR': 'Too far',
                'TOO_EXPENSIVE': 'Too expensive',
                'BAD_TIMING': 'Bad timing',
                'NOT_MY_VIBE': 'Not my vibe',
                'NOT_MY_TASTE': 'Not my taste',
                'DOESNT_FIT_GROUP': "Doesn't fit group",
                'WRONG_NEIGHBORHOOD': 'Wrong neighborhood',
                'OTHER': 'Other'
              };
              
              return (
              <div className="space-y-4 py-2 text-sm">
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase text-muted-foreground">Votes</p>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5 flex-1">
                      <ThumbsUp size={16} className="text-green-400" />
                      <span className="font-bold text-green-400">{summary.upvotes}</span>
                      <span className="text-muted-foreground text-xs">upvotes</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5 flex-1">
                      <ThumbsDown size={16} className="text-red-400" />
                      <span className="font-bold text-red-400">{summary.downvotes}</span>
                      <span className="text-muted-foreground text-xs">downvotes</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-primary/10 border border-primary/20">
                    <span className="text-xs font-medium">Total Score</span>
                    <span className={cn("font-bold", summary.score >= 0 ? "text-primary" : "text-red-400")}>{summary.score > 0 ? '+' : ''}{summary.score}</span>
                  </div>
                </div>
                
                {isMajorityDownvoted && (
                  <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                    <Ban size={12} className="inline mr-1" /> Majority of group downvoted this option
                  </div>
                )}
                
                {uniqueReasons.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Downvote Reasons</p>
                    <div className="flex flex-wrap gap-1.5">
                      {uniqueReasons.map((reason: string, i: number) => (
                        <span key={i} className="px-2 py-1 text-xs rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                          {reasonLabels[reason] || reason}
                        </span>
                      ))}
                    </div>
                    {uniqueReasons.length > 0 && (
                      <p className="text-xs text-muted-foreground italic">
                        Ranking adjusted based on: {uniqueReasons.map(r => reasonLabels[r]?.toLowerCase() || r).join(', ')}
                      </p>
                    )}
                  </div>
                )}
                
                {otherNotes.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Additional Feedback</p>
                    {otherNotes.slice(0, 3).map((note: string, i: number) => (
                      <p key={i} className="text-xs text-muted-foreground p-2 rounded bg-white/5 italic">"{note.slice(0, 100)}{note.length > 100 ? '...' : ''}"</p>
                    ))}
                  </div>
                )}
                
                {summary.upvotes === 0 && summary.downvotes === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">No votes yet. Be the first to vote!</p>
                )}
                
                <div className="pt-2 border-t border-white/5">
                  <p className="text-xs text-muted-foreground">
                    <Star size={10} className="inline mr-1" /> {infoSuggestion.rating} stars
                    <span className="mx-2">•</span>
                    <MapPin size={10} className="inline mr-1" /> {infoSuggestion.distance}
                    <span className="mx-2">•</span>
                    <DollarSign size={10} className="inline mr-1" /> {infoSuggestion.budget}
                  </p>
                </div>
              </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Members Sheet */}
        <Sheet open={membersOpen} onOpenChange={setMembersOpen}>
          <SheetContent side="bottom" className="bg-card border-white/10 rounded-t-3xl max-h-[70vh] overflow-y-auto">
            <SheetHeader className="pb-4 border-b border-white/10 pr-8">
              <SheetTitle className="flex items-center gap-2">
                <Users size={18} /> Who's Going ({participants.length})
              </SheetTitle>
            </SheetHeader>
            <div className="space-y-3 py-4">
              {participants.map((pid) => {
                const status = session.participantStatusByUserId?.[pid] || 'active';
                const isCant = status === 'cant_make_it';
                const isAdmin = group?.adminId === pid;
                const details = memberDetailsMap.get(pid);
                
                return (
                  <div 
                    key={pid} 
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10",
                      isCant && "opacity-60"
                    )}
                    data-testid={`member-${pid}`}
                  >
                    <Avatar className="w-12 h-12 border-2 border-background">
                      <AvatarFallback className="text-sm bg-white/10">
                        {getInitials(pid)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{getDisplayName(pid)}</span>
                        {isAdmin && (
                          <Badge variant="outline" className="text-[10px] border-primary/50 text-primary">
                            <Shield size={8} className="mr-1" /> Admin
                          </Badge>
                        )}
                        {pid === user?.id && (
                          <Badge variant="outline" className="text-[10px] border-white/30">You</Badge>
                        )}
                      </div>
                      {details?.username && (
                        <span className="text-xs text-muted-foreground">@{details.username}</span>
                      )}
                    </div>
                    {isCant ? (
                      <Badge variant="outline" className="border-red-500/50 text-red-400 text-xs">
                        <Ban size={10} className="mr-1" /> Can't make it
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-green-500/50 text-green-400 text-xs">
                        <Check size={10} className="mr-1" /> Going
                      </Badge>
                    )}
                  </div>
                );
              })}
              
              {!isLocked && (
                <Button 
                  onClick={() => { setMembersOpen(false); setInviteOpen(true); }}
                  className="w-full mt-4"
                  variant="outline"
                >
                  <UserPlus size={16} className="mr-2" /> Invite More People
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </Layout>
  );
}
