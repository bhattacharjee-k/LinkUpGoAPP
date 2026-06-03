import React, { useState, useEffect } from 'react';
import { api, type GroupTasteResponse } from '@/lib/api';
import { Sparkles } from 'lucide-react';

interface SquadTasteCardProps {
  groupId: string;
}

export function SquadTasteCard({ groupId }: SquadTasteCardProps) {
  const [taste, setTaste] = useState<GroupTasteResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.groups.getTaste(groupId)
      .then(data => { if (active) setTaste(data); })
      .catch(() => { if (active) setTaste(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [groupId]);

  if (loading) {
    return (
      <div
        className="h-24 rounded-2xl border border-white/10 bg-white/5 animate-pulse"
        data-testid="squad-taste-loading"
      />
    );
  }

  // No history yet → render nothing.
  if (!taste || (taste.topCategories.length === 0 && !taste.text.trim())) {
    return null;
  }

  return (
    <div
      className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-blue-500/5 p-5 space-y-3"
      data-testid="squad-taste-card"
    >
      <div className="flex items-center gap-2 text-primary">
        <Sparkles size={16} className="shrink-0" />
        <span className="text-xs font-bold tracking-wider uppercase text-muted-foreground">
          This crew's taste
        </span>
      </div>

      {taste.topCategories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {taste.topCategories.map(cat => (
            <span
              key={cat}
              className="px-3 py-1 rounded-full text-xs font-medium bg-white/10 border border-white/10 text-foreground"
            >
              {cat}
            </span>
          ))}
        </div>
      )}

      {taste.text.trim() && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {taste.text}
        </p>
      )}
    </div>
  );
}
