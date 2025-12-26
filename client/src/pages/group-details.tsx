import React, { useState } from 'react';
import { useApp } from '@/lib/context';
import { useRoute, useLocation } from 'wouter';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserPlus, Link as LinkIcon, Copy, Check, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function GroupDetails() {
  const [match, params] = useRoute('/group/:id');
  const { groups, addMemberToGroup, user } = useApp();
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  
  const group = groups.find(g => g.id === params?.id);
  
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');

  if (!group) return <div>Group not found</div>;

  const handleCopyLink = () => {
    const link = `${window.location.origin}/join/${group.inviteCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
        title: "Link copied!",
        description: "Send this link to friends to let them join instantly.",
    });
  };

  const handleAddMember = () => {
    if (!newMemberName.trim()) return;
    // Mock adding a user by ID (simulating a backend lookup)
    const mockId = `user-${Math.random().toString(36).substr(2, 5)}`;
    addMemberToGroup(group.id, mockId);
    setNewMemberName('');
    toast({
        title: "Member added",
        description: `${newMemberName} has been added to the group.`,
    });
    setInviteOpen(false);
  };

  return (
    <Layout>
      <div className="px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setLocation('/')}>← Back</Button>
        </div>

        <div className="space-y-2">
            <h1 className="text-3xl font-display font-bold">{group.name}</h1>
            <p className="text-muted-foreground">{group.members.length} members</p>
        </div>

        {/* Member Actions */}
        <div className="flex gap-2">
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogTrigger asChild>
                    <Button className="flex-1 gap-2 bg-primary text-white hover:bg-primary/90">
                        <UserPlus size={16} /> Add People
                    </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-white/10">
                    <DialogHeader>
                        <DialogTitle>Invite to {group.name}</DialogTitle>
                    </DialogHeader>
                    
                    <div className="space-y-6 pt-4">
                        {/* Share Link Section */}
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Share Link</h4>
                            <div className="flex gap-2">
                                <div className="flex-1 bg-white/5 border border-white/10 rounded-md px-3 py-2 text-xs font-mono truncate text-muted-foreground">
                                    {window.location.origin}/join/{group.inviteCode}
                                </div>
                                <Button size="icon" variant="outline" onClick={handleCopyLink} className="border-white/10">
                                    {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                                </Button>
                            </div>
                        </div>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-white/10" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-card px-2 text-muted-foreground">Or add directly</span>
                            </div>
                        </div>

                        {/* Direct Add Section */}
                        <div className="space-y-2">
                             <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Username or Email</h4>
                             <div className="flex gap-2">
                                <Input 
                                    placeholder="@username" 
                                    className="bg-white/5 border-white/10" 
                                    value={newMemberName}
                                    onChange={e => setNewMemberName(e.target.value)}
                                />
                                <Button onClick={handleAddMember} disabled={!newMemberName}>Add</Button>
                             </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            
            <Button variant="outline" className="border-white/10 bg-white/5" onClick={handleCopyLink}>
                <LinkIcon size={16} />
            </Button>
        </div>

        {/* Member List */}
        <div className="space-y-4">
            <h3 className="text-lg font-bold">Members</h3>
            <div className="space-y-2">
                {group.members.map((memberId, i) => (
                    <div key={memberId} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                        <Avatar className="h-10 w-10 border border-white/10">
                            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-blue-500/20 text-xs font-bold">
                                {memberId === user?.id ? 'ME' : `U${i}`}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                            <div className="font-medium text-sm">
                                {memberId === user?.id ? 'You' : `User ${memberId.substr(0,4)}`}
                            </div>
                            <div className="text-xs text-muted-foreground">Member</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </div>
    </Layout>
  );
}
