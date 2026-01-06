import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useLocation } from 'wouter';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [_, setLocation] = useLocation();

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const { count } = await api.notifications.unreadCount();
        setUnreadCount(count);
      } catch (error) {
        console.error('Failed to fetch notification count:', error);
      }
    };

    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <button
      data-testid="button-notifications"
      onClick={() => setLocation('/updates')}
      className={cn(
        "relative p-2 rounded-full transition-colors",
        "hover:bg-white/10 active:bg-white/20"
      )}
    >
      <Bell size={22} className="text-white" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-primary text-black text-[10px] font-bold rounded-full px-1">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}
