import { X } from 'lucide-react';
import { motion } from 'framer-motion';

import { Button } from '@/components/ui/button';
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
              <div className="text-sm">No notifications yet</div>
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
                      className={`hover:bg-muted/50 cursor-pointer p-4 ${!notification.read ? 'bg-muted/30' : ''} `}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start gap-3">
                        {/* Category Icon */}
                        <div className="mt-0.5 flex-shrink-0">
                          <div className={`rounded-full p-2 ${colors.bg}`}>
                            <span className={`h-4 w-4 ${colors.icon}`}>
                              {CategoryIcon}
                            </span>
                          </div>
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <span className={`h-4 w-4 ${colors.icon}`}>
                              {TypeIcon}
                            </span>
                            <h4 className="truncate text-sm font-medium">
                              {notification.title}
                            </h4>
                            {!notification.read && (
                              <div className="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                            )}
                          </div>

                          <p className="text-muted-foreground mb-2 line-clamp-2 text-xs">
                            {notification.message}
                          </p>

                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground text-xs">
                              {formatNotificationTime(notification.timestamp)}
                            </span>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={e => {
                                e.stopPropagation();
                                deleteNotification?.(notification.id);
                              }}
                              className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
                            >
                              <X className="h-3 w-3" />
                            </Button>
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
