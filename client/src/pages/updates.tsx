import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Bell, BellOff, Mail, Users, Vote, Lock, MessageCircle, CheckCheck } from 'lucide-react';
import { useLocation } from 'wouter';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string;
  isRead: boolean;
  createdAt: string;
}

const iconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  INVITE: Users,
  AVAILABILITY_NUDGE: MessageCircle,
  VOTE_OPEN: Vote,
  PLAN_LOCKED: Lock,
  PLAN_UPDATED: Bell,
};

export function UpdatesPage() {
  const [_, setLocation] = useLocation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [notifs, prefs] = await Promise.all([
        api.notifications.list(),
        api.notifications.getPrefs(),
      ]);
      setNotifications(notifs);
      setEmailEnabled(prefs.emailEnabled ?? true);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      try {
        await api.notifications.markAsRead(notification.id);
        setNotifications(prev =>
          prev.map(n => n.id === notification.id ? { ...n, isRead: true } : n)
        );
      } catch (error) {
        console.error('Failed to mark as read:', error);
      }
    }
    setLocation(notification.url);
  };

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleEmailToggle = async (checked: boolean) => {
    setEmailEnabled(checked);
    try {
      await api.notifications.updatePrefs(checked);
    } catch (error) {
      console.error('Failed to update preferences:', error);
      setEmailEnabled(!checked);
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <Layout>
      <div className="px-6 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <button
            data-testid="button-back"
            onClick={() => setLocation('/')}
            className="p-2 -ml-2 rounded-full hover:bg-white/10"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-display font-bold">Updates</h1>
        </div>

        <Card className="p-4 bg-white/5 border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Mail size={18} className="text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">Email notifications</p>
                <p className="text-xs text-muted-foreground">Get updates via email</p>
              </div>
            </div>
            <Switch
              data-testid="switch-email-notifications"
              checked={emailEnabled}
              onCheckedChange={handleEmailToggle}
            />
          </div>
        </Card>

        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            Notifications
            {unreadCount > 0 && (
              <span className="ml-2 text-sm text-muted-foreground">
                ({unreadCount} unread)
              </span>
            )}
          </h2>
          {unreadCount > 0 && (
            <Button
              data-testid="button-mark-all-read"
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="text-xs text-primary"
            >
              <CheckCheck size={14} className="mr-1" /> Mark all read
            </Button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-10 text-muted-foreground">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-white/10 rounded-xl">
            <BellOff size={32} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">No notifications yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map(notification => {
              const Icon = iconMap[notification.type] || Bell;
              return (
                <button
                  key={notification.id}
                  data-testid={`notification-item-${notification.id}`}
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    "w-full text-left p-4 rounded-xl transition-all",
                    notification.isRead
                      ? "bg-white/5 hover:bg-white/10"
                      : "bg-primary/10 hover:bg-primary/15 border border-primary/20"
                  )}
                >
                  <div className="flex gap-3">
                    <div className={cn(
                      "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
                      notification.isRead ? "bg-white/10" : "bg-primary/20"
                    )}>
                      <Icon size={18} className={notification.isRead ? "text-muted-foreground" : "text-primary"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "font-medium text-sm truncate",
                        !notification.isRead && "text-white"
                      )}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {notification.body}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    {!notification.isRead && (
                      <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
