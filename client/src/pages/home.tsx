import React from 'react';
import { useApp } from '@/lib/context';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Calendar, MapPin, Users, ArrowRight, PlusCircle } from 'lucide-react';
import { Link, useLocation } from 'wouter';

export function Home() {
  const { user, sessions, groups, createGroup, startSession } = useApp();
  const [_, setLocation] = useLocation();

  if (!user) return null; // Should redirect to onboarding ideally

  return (
    <Layout>
      <div className="px-6 py-8 space-y-8">
        
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-display font-bold">Hey, {user.name}</h1>
            <p className="text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin size={14} /> {user.city}
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-blue-500 border-2 border-white/20" />
        </div>

        {/* Action Card */}
        <div className="p-1 rounded-2xl bg-gradient-to-r from-primary to-green-600 shadow-lg shadow-primary/20">
          <div className="bg-background/90 backdrop-blur-md rounded-xl p-6 space-y-4">
            <h2 className="text-xl font-bold">Ready to LinkUpGo?</h2>
            <p className="text-sm text-muted-foreground">Start a new planning session with your groups or create a new squad.</p>
            <div className="flex gap-3">
              <Button onClick={() => setLocation('/groups')} className="flex-1 bg-white/10 hover:bg-white/20 text-white border-0">
                <Users size={16} className="mr-2" /> Groups
              </Button>
              <Button onClick={() => setLocation('/new-session')} className="flex-1 bg-primary text-black hover:bg-primary/90">
                <Plus size={16} className="mr-2" /> New Plan
              </Button>
            </div>
          </div>
        </div>

        {/* Active Sessions */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold">Active Plans</h3>
            <Link href="/history" className="text-xs text-primary font-medium">History</Link>
          </div>
          
          {sessions.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-white/10 rounded-xl">
              <p className="text-muted-foreground text-sm">No active plans yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map(session => (
                <Link key={session.id} href={`/session/${session.id}`}>
                  <Card className="p-4 bg-white/5 border-white/10 hover:bg-white/10 transition-all cursor-pointer group">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider">
                            {session.status}
                          </span>
                          <span className="text-xs text-muted-foreground">Today</span>
                        </div>
                        <h4 className="font-bold text-lg group-hover:text-primary transition-colors">
                          {groups.find(g => g.id === session.groupId)?.name || 'Unknown Group'}
                        </h4>
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

        {/* Groups Preview */}
        <div className="space-y-4">
           <h3 className="text-lg font-bold">Your Squads</h3>
           <div className="grid grid-cols-2 gap-3">
             {groups.map(group => (
               <Card key={group.id} onClick={() => setLocation(`/group/${group.id}`)} className="p-4 bg-white/5 border-white/10 aspect-square flex flex-col justify-between hover:border-primary/50 transition-all cursor-pointer">
                 <div className="flex -space-x-2">
                   {[1,2,3].map(i => (
                     <div key={i} className="w-6 h-6 rounded-full bg-gray-700 border border-background" />
                   ))}
                 </div>
                 <div>
                   <h4 className="font-bold text-sm">{group.name}</h4>
                   <p className="text-xs text-muted-foreground">{group.members.length} members</p>
                 </div>
               </Card>
             ))}
             <button onClick={() => createGroup(`Squad ${groups.length + 1}`)} className="rounded-xl border border-dashed border-white/20 flex flex-col items-center justify-center gap-2 aspect-square hover:bg-white/5 transition-all text-muted-foreground hover:text-primary">
               <PlusCircle size={24} />
               <span className="text-xs font-medium">Create New</span>
             </button>
           </div>
        </div>

      </div>
    </Layout>
  );
}
