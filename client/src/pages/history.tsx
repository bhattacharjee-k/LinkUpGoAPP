import React from 'react';
import { useApp } from '@/lib/context';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Calendar, ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';

export function History() {
  const { user } = useApp();
  const [_, setLocation] = useLocation();

  if (!user) {
    setLocation('/');
    return null;
  }

  return (
    <Layout>
      <div className="px-6 py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/')} data-testid="button-back">
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-2xl font-bold">History</h1>
        </div>

        {/* Empty State */}
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-6">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
            <Calendar size={40} className="text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">No past plans yet</h2>
            <p className="text-muted-foreground max-w-sm">
              Once you lock in and complete a plan, it'll show up here.
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
      </div>
    </Layout>
  );
}
