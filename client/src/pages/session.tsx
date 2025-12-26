import React, { useEffect, useRef, useState } from 'react';
import { useRoute } from 'wouter';
import { useApp } from '@/lib/context';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Send, ThumbsUp, ThumbsDown, Flame, MapPin, DollarSign, Users, Bot, Star, UserPlus, Link as LinkIcon, Check, Copy, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from '@/hooks/use-toast';

export function Session() {
  const [match, params] = useRoute('/session/:id');
  const { getSession, addMessage, voteForSuggestion, confirmPlan, addParticipantToSession, user, groups } = useApp();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  const session = getSession(params?.id || '');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newParticipantName, setNewParticipantName] = useState('');

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session?.messages]);

  if (!session) return <div>Session not found</div>;

  const handleSend = () => {
    if (!input.trim()) return;
    addMessage(session.id, input);
    setInput('');
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/join-plan/${session.inviteCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
        title: "Plan link copied!",
        description: "Send this to friends to join this specific plan.",
    });
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

  const group = groups.find(g => g.id === session.groupId);
  const participants = session.participants || [];

  return (
    <Layout hideNav>
      <div className="flex flex-col h-screen max-h-screen">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 bg-background/80 backdrop-blur-md z-20 space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="font-bold text-lg leading-tight">Planning Session</h2>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full animate-pulse", session.status === 'planning' ? "bg-green-500" : "bg-blue-500")}/> 
                {session.status === 'planning' ? 'Live Voting' : 'Plan Confirmed'}
              </p>
            </div>
            {session.finalChoiceId && (
              <Badge className="bg-primary text-white border-none">CONFIRMED</Badge>
            )}
          </div>

          {/* Participants Bar */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center -space-x-2 overflow-hidden py-1">
                {participants.map((pid, i) => (
                    <Avatar key={pid} className="w-8 h-8 border-2 border-background">
                        <AvatarFallback className="text-[10px] bg-white/10">
                            {pid === user?.id ? 'ME' : `U${i}`}
                        </AvatarFallback>
                    </Avatar>
                ))}
            </div>
            
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1 border-white/10 bg-white/5">
                        <UserPlus size={12} /> Add Friends
                    </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-white/10">
                    <DialogHeader>
                        <DialogTitle>Add to Plan</DialogTitle>
                    </DialogHeader>
                     <div className="space-y-6 pt-4">
                        {/* Share Link */}
                        <div className="space-y-2">
                            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Share Plan Link</h4>
                            <div className="flex gap-2">
                                <div className="flex-1 bg-white/5 border border-white/10 rounded-md px-3 py-2 text-xs font-mono truncate text-muted-foreground">
                                    {window.location.origin}/join-plan/{session.inviteCode}
                                </div>
                                <Button size="icon" variant="outline" onClick={handleCopyLink} className="border-white/10">
                                    {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
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
             {session.suggestions.map((suggestion, idx) => (
               <motion.div 
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: idx * 0.1 }}
                 key={suggestion.id} 
                 className={cn(
                   "group relative rounded-2xl overflow-hidden border transition-all duration-300",
                   session.finalChoiceId === suggestion.id ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-white/10 bg-white/5 hover:bg-white/10"
                 )}
               >
                 {/* Pseudo-Image Header */}
                 <div className="h-24 bg-gradient-to-r from-gray-800 to-gray-700 relative p-4 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                       <Badge variant="secondary" className="bg-black/40 backdrop-blur-md text-white border-0 text-[10px] uppercase tracking-wider">
                         {suggestion.source}
                       </Badge>
                       <div className="flex items-center gap-1 text-xs font-bold text-white bg-black/40 px-2 py-1 rounded-full backdrop-blur-md">
                         <Star size={10} className="text-yellow-400 fill-yellow-400" /> {suggestion.rating}
                       </div>
                    </div>
                    <h3 className="text-xl font-bold text-white shadow-black/50 drop-shadow-md">{suggestion.name}</h3>
                 </div>

                 <div className="p-4 space-y-4">
                   <p className="text-sm text-muted-foreground leading-relaxed">
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
                   <div className="flex items-center justify-between pt-2 border-t border-white/5">
                     <div className="flex gap-1">
                       {Object.values(suggestion.votes).filter(v => v === 'yes').length > 0 && (
                         <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full">
                           {Object.values(suggestion.votes).filter(v => v === 'yes').length} Yes
                         </span>
                       )}
                       {Object.values(suggestion.votes).filter(v => v === 'fire').length > 0 && (
                         <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded-full">
                           {Object.values(suggestion.votes).filter(v => v === 'fire').length} 🔥
                         </span>
                       )}
                     </div>

                     <div className="flex gap-2">
                       <Button 
                         size="icon" 
                         variant="ghost" 
                         className={cn("h-8 w-8 rounded-full", suggestion.votes[user?.id || 'me'] === 'no' && "bg-red-500/20 text-red-500")}
                         onClick={() => voteForSuggestion(session.id, suggestion.id, 'no')}
                       >
                         <ThumbsDown size={14} />
                       </Button>
                       <Button 
                         size="icon" 
                         variant="ghost" 
                         className={cn("h-8 w-8 rounded-full", suggestion.votes[user?.id || 'me'] === 'yes' && "bg-green-500/20 text-green-500")}
                         onClick={() => voteForSuggestion(session.id, suggestion.id, 'yes')}
                       >
                         <ThumbsUp size={14} />
                       </Button>
                       <Button 
                         size="icon" 
                         variant="ghost" 
                         className={cn("h-8 w-8 rounded-full", suggestion.votes[user?.id || 'me'] === 'fire' && "bg-orange-500/20 text-orange-500")}
                         onClick={() => voteForSuggestion(session.id, suggestion.id, 'fire')}
                       >
                         <Flame size={14} />
                       </Button>
                     </div>
                   </div>

                   <Button 
                     variant="secondary" 
                     className="w-full bg-white/5 hover:bg-primary hover:text-white transition-all text-xs h-8"
                     onClick={() => confirmPlan(session.id, suggestion.id)}
                   >
                     Lock it in
                   </Button>
                 </div>
               </motion.div>
             ))}
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
                      msg.sender === 'user' ? "ml-auto bg-primary text-white rounded-br-none" : 
                      msg.sender === 'planner-ai' ? "bg-purple-900/40 text-purple-100 border border-purple-500/30 rounded-bl-none" :
                      "bg-white/10 text-muted-foreground text-xs text-center mx-auto"
                    )}
                  >
                    {msg.sender === 'planner-ai' && <div className="text-[10px] text-purple-300 font-bold mb-1 flex items-center gap-1"><Bot size={10} /> Planner AI</div>}
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
                  className="pr-10 bg-white/5 border-white/10 focus-visible:ring-primary"
                />
              </div>
              <Button size="icon" onClick={handleSend} className="bg-primary hover:bg-primary/90 text-white">
                <Send size={16} />
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
