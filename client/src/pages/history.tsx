import React from 'react';
import { useApp } from '@/lib/context';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Calendar, ArrowLeft, ArrowRight, MapPin, Star } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { cn } from "@/lib/utils";

export function History() {
  const { user, sessions, groups } = useApp();
  const [_, setLocation] = useLocation();

  if (!user) {
    setLocation('/');
    return null;
  }

  const pastSessions = sessions
    .filter(s => s.status === 'locked')
    .sort((a, b) => (b.lockedAt || 0) - (a.lockedAt || 0));

  const getWinningSuggestion = (session: typeof sessions[0]) => {
    if (!session.winningOptionId || !session.suggestions) return null;
    return session.suggestions.find(s => s.id === session.winningOptionId) || null;
  };

  const formatLockedDate = (lockedAt?: number) => {
    if (!lockedAt) return '';
    const d = new Date(lockedAt);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <Layout>
      <div className="px-6 py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/')} data-testid="button-back">
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-2xl font-bold">History</h1>
        </div>

        {pastSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-6">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
              <Calendar size={40} className="text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">No past plans yet</h2>
              <p className="text-muted-foreground max-w-sm">
                Once you confirm a plan, it'll show up here.
              </p>
            </div>
            <Button 
              onClick={() => setLocation('/new-session')} 
              className="bg-primary text-[#0a0a0a] font-bold"
              data-testid="button-create-plan"
            >
              Create a New Plan
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {pastSessions.map(session => {
              const winner = getWinningSuggestion(session);
              const groupName = groups.find(g => g.id === session.groupId)?.name || 'Unknown Group';
              
              return (
                <Link key={session.id} href={`/session/${session.id}`}>
                  <Card className="p-4 bg-white/5 border-white/10 hover:bg-white/10 transition-all cursor-pointer group" data-testid={`card-history-${session.id}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-green-500/20 text-green-400">
                            Confirmed
                          </span>
                          {session.lockedAt && (
                            <span className="text-xs text-muted-foreground">{formatLockedDate(session.lockedAt)}</span>
                          )}
                        </div>
                        <h4 className="font-bold text-base group-hover:text-primary transition-colors truncate">
                          {winner?.name || session.name || 'Confirmed Plan'}
                        </h4>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span>{groupName}</span>
                          {winner && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-0.5">
                                {session.filters.category.join(', ')}
                              </span>
                            </>
                          )}
                          {winner?.rating && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-0.5">
                                <Star size={10} className="text-yellow-500 fill-yellow-500" /> {winner.rating}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all ml-3 flex-shrink-0">
                        <ArrowRight size={14} />
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
