import React from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications } from '@/contexts/NotificationContext';
import type { Notification } from '@/types/notification';
import {
  formatNotificationTime,
  getNotificationIcon,
  getNotificationColor,
  getNotificationCategoryIcon,
} from '@/lib/notification-utils';

interface NotificationDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationDropdown({ isOpen }: NotificationDropdownProps) {
  const { notifications, unreadCount, markAsRead, removeNotification } =
    useNotifications();

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
  };

  const handleDismiss = (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    removeNotification(notificationId);
  };

  if (!isOpen) return null;

  return (
    <div className="bg-background absolute top-full right-0 z-50 mt-2 w-80 rounded-lg border shadow-lg">
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="h-5 w-5 rounded-full p-0 text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </div>
      </div>

      <ScrollArea className="max-h-96">
        {notifications.length === 0 ? (
          <div className="text-muted-foreground p-6 text-center">
            <Bell className="mx-auto mb-3 h-8 w-8 opacity-50" />
            <p className="text-sm">No notifications</p>
            <p className="mt-1 text-xs">You're all caught up!</p>
          </div>
        ) : (
          <div className="p-2">
            {notifications.map(notification => (
              <div
                key={notification.id}
                className={`group hover:bg-muted/50 cursor-pointer rounded-lg border-b p-3 transition-all ${
                  !notification.read
                    ? 'bg-primary/5 border-l-primary border-l-2'
                    : 'border-transparent'
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs ${getNotificationColor(notification.type)}`}
                    >
                      {notification.category
                        ? getNotificationCategoryIcon(notification.category)
                        : getNotificationIcon(notification.type)}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-start justify-between">
                      <h4 className="text-sm leading-tight font-medium">
                        {notification.title}
                      </h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={e => handleDismiss(e, notification.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>

                    {notification.message && (
                      <p className="text-muted-foreground mb-2 text-sm leading-relaxed">
                        {notification.message}
                      </p>
                    )}

                    <div className="flex items-center justify-between">
                      <p className="text-muted-foreground text-xs">
                        {formatNotificationTime(notification.timestamp)}
                      </p>
                      {notification.category && (
                        <Badge variant="outline" className="text-xs">
                          {notification.category}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
