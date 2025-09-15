import {
  Filter,
  Search,
  Trash2,
  CheckCheck,
  MoreVertical,
  Eye,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useState, useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useNotifications } from '@/contexts/NotificationContext';
import {
  getNotificationTypeIcon,
  getNotificationCategoryIcon,
  getNotificationColors,
  formatNotificationTime,
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_TYPE_LABELS,
} from '@/lib/notification-utils';
import type {
  Notification,
  NotificationCategory,
  NotificationType,
} from '@/types/notification';

export default function NotificationsPage() {
  const {
    notifications,
    unreadCount,
    stats,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications,
  } = useNotifications();

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<
    NotificationCategory | 'all'
  >('all');
  const [typeFilter, setTypeFilter] = useState<NotificationType | 'all'>('all');
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>(
    'all'
  );

  // Filtered notifications
  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification: Notification) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !notification.title.toLowerCase().includes(query) &&
          !notification.message.toLowerCase().includes(query)
        ) {
          return false;
        }
      }

      // Category filter
      if (
        categoryFilter !== 'all' &&
        notification.category !== categoryFilter
      ) {
        return false;
      }

      // Type filter
      if (typeFilter !== 'all' && notification.type !== typeFilter) {
        return false;
      }

      // Read status filter
      if (readFilter === 'unread' && notification.read) {
        return false;
      }
      if (readFilter === 'read' && !notification.read) {
        return false;
      }

      return true;
    });
  }, [notifications, searchQuery, categoryFilter, typeFilter, readFilter]);

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setTypeFilter('all');
    setReadFilter('all');
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="bg-muted h-8 w-1/3 rounded"></div>
          <div className="bg-muted h-32 rounded"></div>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-muted h-16 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-blue-600">Notifications</h1>
          <p className="text-muted-foreground">
            System notifications and alerts
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button onClick={markAllAsRead} variant="outline">
              <CheckCheck className="mr-2 h-4 w-4" />
              Mark all read
            </Button>
          )}

          {notifications.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={clearAllNotifications}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear all
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Unread</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {stats?.unread || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {stats?.byType?.error || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Warnings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {stats?.byType?.warning || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {/* Search */}
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform" />
              <Input
                placeholder="Search notifications..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Category Filter */}
            <Select
              value={categoryFilter}
              onValueChange={value =>
                setCategoryFilter(value as NotificationCategory | 'all')
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {Object.entries(NOTIFICATION_CATEGORY_LABELS).map(
                  ([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {String(label)}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>

            {/* Type Filter */}
            <Select
              value={typeFilter}
              onValueChange={value =>
                setTypeFilter(value as NotificationType | 'all')
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(NOTIFICATION_TYPE_LABELS).map(
                  ([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {String(label)}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>

            {/* Read Status Filter */}
            <Select
              value={readFilter}
              onValueChange={value =>
                setReadFilter(value as 'all' | 'unread' | 'read')
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Active Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {(searchQuery ||
              categoryFilter !== 'all' ||
              typeFilter !== 'all' ||
              readFilter !== 'all') && (
              <>
                <span className="text-muted-foreground text-sm">
                  Active filters:
                </span>
                {searchQuery && (
                  <Badge variant="secondary">Search: {searchQuery}</Badge>
                )}
                {categoryFilter !== 'all' && (
                  <Badge variant="secondary">
                    Category: {NOTIFICATION_CATEGORY_LABELS[categoryFilter]}
                  </Badge>
                )}
                {typeFilter !== 'all' && (
                  <Badge variant="secondary">
                    Type: {NOTIFICATION_TYPE_LABELS[typeFilter]}
                  </Badge>
                )}
                {readFilter !== 'all' && (
                  <Badge variant="secondary">Status: {readFilter}</Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  className="h-6 px-2 text-xs"
                >
                  Clear all
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notifications List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Activity Timeline ({filteredNotifications.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filteredNotifications.length === 0 ? (
            <div className="text-muted-foreground p-8 text-center">
              {notifications.length === 0
                ? 'No notifications yet'
                : 'No notifications match your filters'}
            </div>
          ) : (
            <div className="divide-y">
              <AnimatePresence>
                {filteredNotifications.map(
                  (notification: Notification, index: number) => {
                    const TypeIcon = getNotificationTypeIcon(notification.type);
                    const CategoryIcon = getNotificationCategoryIcon(
                      notification.category
                    );
                    const colors = getNotificationColors(notification.type);

                    return (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ delay: index * 0.02 }}
                        className={`group hover:bg-muted/50 cursor-pointer p-4 ${!notification.read ? 'bg-muted/30' : ''} `}
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <div className="flex items-start gap-4">
                          {/* Timeline Indicator */}
                          <div className="flex flex-col items-center">
                            <div
                              className={`rounded-full p-2 ${colors.bg} border-background border-2`}
                            >
                              <span className={`h-4 w-4 ${colors.icon}`}>
                                {CategoryIcon}
                              </span>
                            </div>
                            {index < filteredNotifications.length - 1 && (
                              <div className="bg-border mt-2 h-8 w-px" />
                            )}
                          </div>

                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex items-center gap-2">
                              <span className={`h-4 w-4 ${colors.icon}`}>
                                {TypeIcon}
                              </span>
                              <h3 className="text-sm font-semibold">
                                {notification.title}
                              </h3>
                              {!notification.read && (
                                <div className="h-2 w-2 rounded-full bg-blue-500" />
                              )}
                              <Badge variant="outline" className="text-xs">
                                {
                                  NOTIFICATION_CATEGORY_LABELS[
                                    notification.category || 'unknown'
                                  ]
                                }
                              </Badge>
                            </div>

                            <p className="text-muted-foreground mb-2 text-sm">
                              {notification.message}
                            </p>

                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground text-xs">
                                {formatNotificationTime(notification.timestamp)}
                              </span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {!notification.read && (
                                  <DropdownMenuItem
                                    onClick={e => {
                                      e.stopPropagation();
                                      markAsRead(notification.id);
                                    }}
                                  >
                                    <Eye className="mr-2 h-4 w-4" />
                                    Mark as read
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={e => {
                                    e.stopPropagation();
                                    deleteNotification?.(notification.id);
                                  }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </motion.div>
                    );
                  }
                )}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
