import React, { useEffect, useRef, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useApp } from '@/lib/context';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Send, ThumbsUp, ThumbsDown, Flame, MapPin, DollarSign, Users, Bot, Star, UserPlus, Link as LinkIcon, Check, Copy, X, Shield, Lock, Ban, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from '@/hooks/use-toast';
import { PlanningSession } from '@/lib/store';

export function Session() {
  const [match, params] = useRoute('/session/:id');
  const { getSession, addMessage, voteForSuggestion, confirmPlan, addParticipantToSession, user, groups, isAdmin } = useApp();
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
  const participants = session.participants || [];
  const isUserAdmin = group ? isAdmin(group.id) : false;
  const isLocked = session.status === 'locked';

  const handleSend = () => {
    if (!input.trim()) return;
    addMessage(session.id, input);
    setInput('');
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

  const calculateScore = (suggestion: any) => {
      let score = 0;
      // Only count votes from active participants
      Object.entries(suggestion.votes).forEach(([uid, vote]) => {
          // Check if this user is active
          if (session.participantStatusByUserId && session.participantStatusByUserId[uid] === 'cant_make_it') {
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
            {isLocked && (
              <Badge className="bg-green-500 text-black font-bold border-none gap-1">
                  <Lock size={10} /> LOCKED
              </Badge>
            )}
          </div>

          {/* Locked Banner */}
          {isLocked && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 flex items-center justify-center text-xs text-green-400 font-medium">
                  Plan locked by Admin. Enjoy!
              </div>
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
              <TabsTrigger value="chat">Chat & AI</TabsTrigger>
            </TabsList>
          </div>

          {/* Suggestions Tab */}
          <TabsContent value="suggestions" className="flex-1 overflow-y-auto p-6 space-y-6 data-[state=inactive]:hidden">
             {sortedSuggestions.map((suggestion, idx) => {
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
                    <div className="flex justify-between items-start">
                       <Badge variant="secondary" className="bg-black/60 backdrop-blur-md text-white border-0 text-[10px] uppercase tracking-wider">
                         {suggestion.source}
                       </Badge>
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
             )})}
             
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
                {session.messages.map(msg => (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    key={msg.id} 
                    className={cn(
                      "max-w-[80%] p-3 text-sm rounded-2xl",
                      msg.sender === 'user' ? "ml-auto bg-primary text-black font-medium rounded-br-none" : 
                      msg.sender === 'planner-ai' ? "bg-white/10 text-white border border-white/10 rounded-bl-none" :
                      "bg-white/10 text-muted-foreground text-xs text-center mx-auto"
                    )}
                  >
                    {msg.sender === 'planner-ai' && <div className="text-[10px] text-primary font-bold mb-1 flex items-center gap-1"><Bot size={10} /> Planner AI</div>}
                    {msg.text}
                  </motion.div>
                ))}
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
            <DialogContent>
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
      </div>
    </Layout>
  );
}
