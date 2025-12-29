import React, { useState } from 'react';
import { useApp } from '@/lib/context';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Users, ArrowRight, Lock, Unlock, UserPlus } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';

export function Groups() {
  const { user, groups, createGroup, joinGroupByCode } = useApp();
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  if (!user) return null;

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || isCreating) return;
    setIsCreating(true);
    try {
      await createGroup(newGroupName);
      setNewGroupName('');
      setIsCreateOpen(false);
      toast({ title: "Group Created!", description: `${newGroupName} is ready to go.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to create group", variant: "destructive" });
    }
    setIsCreating(false);
  };

  const handleJoinGroup = async () => {
    if (!joinCode.trim() || isJoining) return;
    setIsJoining(true);
    try {
      await joinGroupByCode(joinCode.toUpperCase());
      setJoinCode('');
      setIsJoinOpen(false);
      toast({ title: "Joined!", description: "You've been added to the group." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Invalid invite code", variant: "destructive" });
    }
    setIsJoining(false);
  };

  return (
    <Layout>
      <div className="px-6 py-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Your Groups</h1>
          <div className="flex gap-2">
            <Dialog open={isJoinOpen} onOpenChange={setIsJoinOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="border-white/10">
                  <UserPlus size={16} className="mr-1" /> Join
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10">
                <DialogHeader>
                  <DialogTitle>Join a Group</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Invite Code</Label>
                    <Input 
                      placeholder="Enter code (e.g. ABC123)"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      className="bg-white/5 border-white/10 uppercase"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleJoinGroup} disabled={!joinCode.trim() || isJoining} className="w-full">
                    {isJoining ? 'Joining...' : 'Join Group'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-primary text-black">
                  <Plus size={16} className="mr-1" /> New
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10">
                <DialogHeader>
                  <DialogTitle>Create a Group</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Group Name</Label>
                    <Input 
                      placeholder="e.g. Friday Night Crew"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="bg-white/5 border-white/10"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateGroup} disabled={!newGroupName.trim() || isCreating} className="w-full">
                    {isCreating ? 'Creating...' : 'Create Group'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
            <Users size={40} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No groups yet</p>
            <Button onClick={() => setIsCreateOpen(true)} className="bg-primary text-black">
              Create Your First Group
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(group => (
              <Link key={group.id} href={`/group/${group.id}`}>
                <Card className="p-4 bg-white/5 border-white/10 hover:bg-white/10 transition-all cursor-pointer group">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-blue-500/20 flex items-center justify-center">
                        <Users size={20} className="text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold group-hover:text-primary transition-colors">{group.name}</h3>
                        <p className="text-xs text-muted-foreground flex items-center gap-2">
                          {group.members.length} member{group.members.length !== 1 ? 's' : ''}
                          {group.locked && (
                            <span className="flex items-center gap-1 text-yellow-500">
                              <Lock size={10} /> Locked
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-primary group-hover:text-black transition-all">
                      <ArrowRight size={14} />
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
