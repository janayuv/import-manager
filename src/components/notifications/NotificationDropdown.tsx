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
    <div className="absolute top-full right-0 z-50 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg">
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
          <Badge variant="secondary">{unreadCount}</Badge>
        </div>
      </div>

      <ScrollArea className="max-h-96">
        {notifications.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <Bell className="mx-auto mb-2 h-8 w-8 text-gray-400" />
            <p>No notifications</p>
          </div>
        ) : (
          <div className="p-2">
            {notifications.map(notification => (
              <div
                key={notification.id}
                className={`cursor-pointer border-b border-gray-100 p-3 transition-colors hover:bg-gray-50 ${
                  !notification.read ? 'bg-blue-50' : ''
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {notification.title}
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${getNotificationColor(notification.type)}`}
                      >
                        {getNotificationIcon(notification.type)}
                      </span>
                    </div>
                    <p className="mb-1 text-sm text-gray-600">
                      {notification.message}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatNotificationTime(notification.timestamp)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
                    onClick={e => handleDismiss(e, notification.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
