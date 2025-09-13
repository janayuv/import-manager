import { X, Bell } from 'lucide-react';
import { motion } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useNotifications } from '@/contexts/NotificationContext';
import {
  getNotificationTypeIcon,
  getNotificationCategoryIcon,
  getNotificationColors,
  formatNotificationTime,
} from '@/lib/notification-utils';
import type { Notification } from '@/types/notification';

interface NotificationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationSheet({
  open,
  onOpenChange,
}: NotificationSheetProps) {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  // Get latest 10 notifications for mobile
  const recentNotifications = notifications.slice(0, 10);

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }

    // Navigate if action URL is provided
    if (notification.actionUrl) {
      // Navigation would be handled here
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 sm:w-96">
        <SheetHeader className="border-b p-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold">
              Notifications
            </SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {unreadCount > 0 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-muted-foreground text-sm">
                {unreadCount} unread notification{unreadCount === 1 ? '' : 's'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="h-7 text-xs"
              >
                Mark all read
              </Button>
            </div>
          )}
        </SheetHeader>

        <ScrollArea className="flex-1">
          {recentNotifications.length === 0 ? (
            <div className="text-muted-foreground p-8 text-center">
              <Bell className="mx-auto mb-3 h-8 w-8 opacity-50" />
              <div className="text-sm">No notifications yet</div>
              <div className="mt-1 text-xs">You're all caught up!</div>
            </div>
          ) : (
            <div className="divide-y">
              {recentNotifications.map(
                (notification: Notification, index: number) => {
                  const TypeIcon = getNotificationTypeIcon(notification.type);
                  const CategoryIcon = getNotificationCategoryIcon(
                    notification.category
                  );
                  const colors = getNotificationColors(notification.type);

                  return (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={`group hover:bg-muted/50 cursor-pointer p-4 transition-all ${
                        !notification.read
                          ? 'bg-primary/5 border-l-primary border-l-2'
                          : ''
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start gap-3">
                        {/* Category Icon */}
                        <div className="flex-shrink-0">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs ${colors.bg}`}
                          >
                            {CategoryIcon}
                          </div>
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`h-4 w-4 ${colors.icon}`}>
                                {TypeIcon}
                              </span>
                              <h4 className="text-sm leading-tight font-medium">
                                {notification.title}
                              </h4>
                              {!notification.read && (
                                <div className="bg-primary h-2 w-2 flex-shrink-0 rounded-full" />
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={e => {
                                e.stopPropagation();
                                deleteNotification?.(notification.id);
                              }}
                              className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100"
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
                            <span className="text-muted-foreground text-xs">
                              {formatNotificationTime(notification.timestamp)}
                            </span>
                            {notification.category && (
                              <Badge variant="outline" className="text-xs">
                                {notification.category}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                }
              )}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 10 && (
          <div className="border-t p-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                // Navigate to full notifications page
                onOpenChange(false);
              }}
            >
              View all {notifications.length} notifications
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
