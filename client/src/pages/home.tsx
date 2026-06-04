import React, { useState } from 'react';
import { useApp } from '@/lib/context';
import { Layout } from '@/components/layout';
import { AdBanner } from '@/components/ad-banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, MapPin, ArrowRight, Lock, Shield, Copy, Check, Unlock, Clock, User } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useToast } from '@/hooks/use-toast';
import { NotificationBell } from '@/components/notification-bell';

export function Home() {
  const { user, sessions, groups, createGroup, updateGroup, isAdmin, isGroupLocked } = useApp();
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedSquadId, setSelectedSquadId] = useState<string | null>(null);
  const [isSquadDrawerOpen, setIsSquadDrawerOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  if (!user) return null;

  const selectedSquad = groups.find(g => g.id === selectedSquadId);

  const activeSessions = sessions.filter(s => s.status !== 'locked');
  const pastSessions = sessions.filter(s => s.status === 'locked');

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || isCreatingGroup) return;
    setIsCreatingGroup(true);
    try {
      await createGroup(newGroupName.trim());
      toast({ title: "Group created!", description: `${newGroupName.trim()} is ready to go.` });
      setNewGroupName('');
      setIsCreateGroupOpen(false);
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Failed to create group", variant: "destructive" });
    }
    setIsCreatingGroup(false);
  };

  const openSquadDrawer = (groupId: string) => {
    setSelectedSquadId(groupId);
    setIsSquadDrawerOpen(true);
  };

  const handleCopyLink = (inviteCode: string) => {
    const link = `${window.location.origin}/join/${inviteCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Link copied!", description: "Send this to friends to join instantly." });
  };

  const toggleLock = (groupId: string, checked: boolean) => {
    updateGroup(groupId, { locked: checked });
    toast({ 
      title: checked ? "Group Locked" : "Group Unlocked", 
      description: checked ? "New members cannot join via invite link." : "Invite links are now active." 
    });
  };

  const getWinningSuggestion = (session: typeof sessions[0]) => {
    if (!session.winningOptionId || !session.suggestions) return null;
    return session.suggestions.find(s => s.id === session.winningOptionId) || null;
  };

  const formatLockedDate = (lockedAt?: string | number | Date | null) => {
    if (!lockedAt) return '';
    const d = new Date(lockedAt);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Layout>
      <div className="px-6 py-8 space-y-8">
        
        {/* Header */}
        <div className="flex justify-end items-center">
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button
              type="button"
              onClick={() => setLocation('/profile')}
              aria-label="Profile"
              className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-blue-500 border-2 border-white/20 cursor-pointer flex items-center justify-center text-white/90 hover:border-white/40 transition-colors"
              data-testid="button-profile"
            >
              <User size={18} />
            </button>
          </div>
        </div>
        
        {/* User greeting */}
        <div>
          <h1 className="text-3xl font-display font-bold">Hey, {user.name}</h1>
          <p className="text-muted-foreground flex items-center gap-1 mt-1">
            <MapPin size={14} /> {user.city}
          </p>
        </div>

        {/* Action Card */}
        <div className="p-1 rounded-2xl bg-gradient-to-r from-primary to-green-600 shadow-lg shadow-primary/20">
          <div className="bg-background/90 backdrop-blur-md rounded-xl p-6 space-y-4">
            <h2 className="text-xl font-bold">Ready to LinkUpGo?</h2>
            <p className="text-sm text-muted-foreground">Start a new planning session with your groups.</p>
            <Button onClick={() => setLocation('/new-session')} className="w-full bg-primary text-black hover:bg-primary/90 font-bold" data-testid="button-new-plan-hero">
              <Plus size={16} className="mr-2" /> New Plan
            </Button>
          </div>
        </div>

        {/* Active Plans */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold">Active Plans</h3>
            {pastSessions.length > 0 && (
              <Link href="/history" className="text-xs text-primary font-medium flex items-center gap-1" data-testid="link-history">
                <Clock size={12} /> History ({pastSessions.length})
              </Link>
            )}
          </div>
          
          {activeSessions.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-white/10 rounded-xl">
              <p className="text-muted-foreground text-sm">No active plans yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeSessions.map(session => (
                <Link key={session.id} href={`/session/${session.id}`}>
                  <Card className="p-4 bg-white/5 border-white/10 hover:bg-white/10 transition-all cursor-pointer group" data-testid={`card-active-plan-${session.id}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/20 text-primary">
                            {session.status === 'voting' ? 'Voting' : 'Planning'}
                          </span>
                        </div>
                        <h4 className="font-bold text-lg group-hover:text-primary transition-colors">
                          {session.name || 'Untitled Plan'}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {groups.find(g => g.id === session.groupId)?.name || 'Unknown Group'}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                          {session.filters.category.join(', ')} • {session.filters.energy}
                        </p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
                        <ArrowRight size={14} />
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Your Groups */}
        <div className="space-y-4">
           <div className="flex justify-between items-center">
             <h3 className="text-lg font-bold">Your Groups</h3>
             <Dialog open={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
               <DialogTrigger asChild>
                 <Button size="sm" variant="outline" className="border-white/10 bg-white/5" data-testid="button-create-group">
                   <Plus size={14} className="mr-1" /> New
                 </Button>
               </DialogTrigger>
               <DialogContent className="bg-card border-white/10">
                 <DialogHeader>
                   <DialogTitle>Create a Group</DialogTitle>
                 </DialogHeader>
                 <div className="space-y-4 pt-4">
                   <div className="space-y-2">
                     <Label htmlFor="new-group-name">Group Name</Label>
                     <Input
                       id="new-group-name"
                       placeholder="e.g. Friday Night Crew"
                       value={newGroupName}
                       onChange={(e) => setNewGroupName(e.target.value)}
                       onKeyDown={(e) => { if (e.key === 'Enter') handleCreateGroup(); }}
                       className="bg-white/5 border-white/10"
                       data-testid="input-group-name"
                     />
                   </div>
                 </div>
                 <DialogFooter>
                   <Button
                     onClick={handleCreateGroup}
                     disabled={!newGroupName.trim() || isCreatingGroup}
                     className="w-full bg-primary text-black hover:bg-primary/90 font-bold"
                     data-testid="button-submit-create-group"
                   >
                     {isCreatingGroup ? 'Creating...' : 'Create Group'}
                   </Button>
                 </DialogFooter>
               </DialogContent>
             </Dialog>
           </div>
           {groups.length === 0 ? (
             <div className="text-center py-10 border border-dashed border-white/10 rounded-xl" data-testid="empty-groups">
               <p className="text-muted-foreground text-sm">No groups yet — create one or join with an invite link.</p>
             </div>
           ) : (
           <div className="space-y-3">
             {groups.map(group => {
               const isUserAdmin = isAdmin(group.id);
               const locked = isGroupLocked(group.id);
               
               return (
                 <Card key={group.id} className="p-4 bg-white/5 border-white/10 hover:border-white/20 transition-all">
                   <div className="flex items-start justify-between mb-3" onClick={() => openSquadDrawer(group.id)} data-testid={`card-group-${group.id}`}>
                     <div className="flex-1 cursor-pointer">
                       <div className="flex items-center gap-2 mb-1">
                         <h4 className="font-bold text-base">{group.name}</h4>
                         {isUserAdmin && (
                           <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-primary/20 text-primary hover:bg-primary/20">
                             <Shield size={10} className="mr-0.5" /> Admin
                           </Badge>
                         )}
                         {locked && (
                           <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/20">
                             <Lock size={10} /> Locked
                           </Badge>
                         )}
                       </div>
                       <p className="text-xs text-muted-foreground">{group.members.length} member{group.members.length !== 1 ? 's' : ''}</p>
                     </div>
                   </div>
                   <div className="flex gap-2">
                     <Button 
                       size="sm" 
                       className="flex-1 bg-primary hover:bg-primary/90 text-[#0a0a0a] font-bold"
                       onClick={() => setLocation(`/new-session?groupId=${group.id}`)}
                       data-testid={`button-new-plan-${group.id}`}
                     >
                       <Plus size={14} className="mr-1" /> New Plan
                     </Button>
                     <Button 
                       size="sm" 
                       variant="outline" 
                       className="flex-1 border-white/10 bg-white/5"
                       onClick={() => openSquadDrawer(group.id)}
                       data-testid={`button-open-${group.id}`}
                     >
                       Open
                     </Button>
                   </div>
                 </Card>
               );
             })}
           </div>
           )}
        </div>

      </div>

      {/* Group Details Drawer */}
      <Sheet open={isSquadDrawerOpen} onOpenChange={setIsSquadDrawerOpen}>
        <SheetContent side="bottom" className="bg-background border-t border-white/10 h-[85vh] rounded-t-2xl">
          {selectedSquad && (() => {
            const groupActiveSessions = sessions.filter(s => s.groupId === selectedSquad.id && s.status !== 'locked');
            const groupPastSessions = sessions.filter(s => s.groupId === selectedSquad.id && s.status === 'locked');
            
            return (
              <div className="space-y-6">
                <SheetHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <SheetTitle className="text-2xl">{selectedSquad.name}</SheetTitle>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="border-white/20 text-muted-foreground bg-white/5">
                          {selectedSquad.members.length} member{selectedSquad.members.length !== 1 ? 's' : ''}
                        </Badge>
                        {isGroupLocked(selectedSquad.id) && (
                          <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-500">
                            <Lock size={10} className="mr-1" /> Locked
                          </Badge>
                        )}
                        {isAdmin(selectedSquad.id) && (
                          <Badge variant="secondary" className="bg-primary/20 text-primary">
                            <Shield size={10} className="mr-1" /> Admin
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </SheetHeader>

                {/* Primary New Plan CTA */}
                <Button 
                  className="w-full bg-primary hover:bg-primary/90 text-[#0a0a0a] font-bold h-12"
                  onClick={() => {
                    setIsSquadDrawerOpen(false);
                    setLocation(`/new-session?groupId=${selectedSquad.id}`);
                  }}
                  data-testid="button-new-plan-drawer"
                >
                  <Plus size={18} className="mr-2" /> New Plan
                </Button>

                <div className="space-y-6 overflow-y-auto max-h-[calc(85vh-12rem)] pb-4">
                  {/* Active Plans */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium text-muted-foreground">Active Plans</Label>
                    {groupActiveSessions.length > 0 ? (
                      <div className="space-y-2">
                        {groupActiveSessions.map(session => (
                          <Link key={session.id} href={`/session/${session.id}`}>
                            <Card className="p-3 bg-white/5 border-white/10 hover:bg-white/10 transition-all cursor-pointer group" data-testid={`plan-active-${session.id}`}>
                              <div className="flex justify-between items-center">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-primary/20 text-primary">
                                      {session.status === 'voting' ? 'Voting' : 'Planning'}
                                    </span>
                                    {session.name && <span className="text-sm font-medium">{session.name}</span>}
                                  </div>
                                  <p className="text-xs text-muted-foreground line-clamp-1">
                                    {session.filters.category.join(', ')} • {session.filters.energy}
                                  </p>
                                </div>
                                <ArrowRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
                              </div>
                            </Card>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 border border-dashed border-white/10 rounded-xl">
                        <p className="text-muted-foreground text-sm">No active plans</p>
                      </div>
                    )}
                  </div>

                  {/* Past Plans */}
                  {groupPastSessions.length > 0 && (
                    <div className="space-y-3">
                      <Label className="text-sm font-medium text-muted-foreground">Past Plans</Label>
                      <div className="space-y-2">
                        {groupPastSessions.map(session => {
                          const winner = getWinningSuggestion(session);
                          return (
                            <Link key={session.id} href={`/session/${session.id}`}>
                              <Card className="p-3 bg-white/5 border-white/10 hover:bg-white/10 transition-all cursor-pointer group" data-testid={`plan-past-${session.id}`}>
                                <div className="flex justify-between items-center">
                                  <div>
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-green-500/20 text-green-400">
                                        Confirmed
                                      </span>
                                      {session.lockedAt && (
                                        <span className="text-xs text-muted-foreground">{formatLockedDate(session.lockedAt)}</span>
                                      )}
                                    </div>
                                    <p className="text-sm font-medium">
                                      {winner?.name || session.name || 'Confirmed Plan'}
                                    </p>
                                    <p className="text-xs text-muted-foreground line-clamp-1">
                                      {session.filters.category.join(', ')}
                                    </p>
                                  </div>
                                  <ArrowRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                              </Card>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Invite Link */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">Invite Link</Label>
                    <div className="flex gap-2">
                      <div className="flex-1 bg-white/5 border border-white/10 rounded-md px-3 py-2 text-xs font-mono truncate text-muted-foreground">
                        {window.location.origin}/join/{selectedSquad.inviteCode}
                      </div>
                      <Button size="icon" variant="outline" onClick={() => handleCopyLink(selectedSquad.inviteCode)} className="border-white/10" data-testid="button-copy-link">
                        {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                      </Button>
                    </div>
                  </div>

                  {/* Admin Lock Toggle */}
                  {isAdmin(selectedSquad.id) && (
                    <Card className="p-4 bg-white/5 border-white/10">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <Label className="text-sm font-medium flex items-center gap-2">
                            {isGroupLocked(selectedSquad.id) ? <Lock size={14} /> : <Unlock size={14} />} 
                            Lock Group
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Prevent new members from joining
                          </p>
                        </div>
                        <Switch 
                          checked={isGroupLocked(selectedSquad.id)} 
                          onCheckedChange={(checked) => toggleLock(selectedSquad.id, checked)}
                          data-testid="switch-lock-group"
                        />
                      </div>
                    </Card>
                  )}

                  {/* Members List */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium text-muted-foreground">Members</Label>
                    <div className="space-y-2">
                      {selectedSquad.members.map((memberId, i) => (
                        <div key={memberId} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5" data-testid={`member-${memberId}`}>
                          <Avatar className="h-9 w-9 border border-white/10">
                            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-blue-500/20 text-xs font-bold">
                              {memberId === user?.id ? 'ME' : `U${i}`}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="font-medium text-sm flex items-center gap-2">
                              {memberId === user?.id ? 'You' : `User ${memberId.substr(0,4)}`}
                              {memberId === selectedSquad.adminId && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-primary/20 text-primary">Admin</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Banner ad at bottom */}
      <div className="fixed bottom-16 left-0 right-0 z-40 flex justify-center">
        <div className="max-w-md w-full">
          <AdBanner />
        </div>
      </div>
    </Layout>
  );
}
