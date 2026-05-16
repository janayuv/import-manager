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

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AppBar, PageHeader } from '@/components/shared/im';

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
      <div className="im-page">
        <AppBar crumbs={['Import Manager', 'Notifications']} />
        <div className="im-dashboard-body">
          <div
            className="animate-pulse"
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <div className="bg-muted h-8 w-1/3 rounded"></div>
            <div className="bg-muted h-32 rounded"></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-muted h-16 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="im-page">
      <AppBar crumbs={['Import Manager', 'Notifications']} />
      <PageHeader
        title="Notifications"
        subtitle="System notifications and alerts"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {unreadCount > 0 && (
              <button type="button" className="im-btn" onClick={markAllAsRead}>
                <CheckCheck
                  style={{
                    marginRight: 6,
                    width: 14,
                    height: 14,
                    display: 'inline',
                  }}
                />
                Mark all read
              </button>
            )}

            {notifications.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="im-btn"
                    style={{ padding: '0 8px' }}
                  >
                    <MoreVertical style={{ width: 14, height: 14 }} />
                  </button>
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
        }
      />

      <div
        className="im-dashboard-body"
        style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
      >
        {/* Stats Cards */}
        <div className="im-kpi-grid">
          <div className="im-kpi">
            <span className="im-kpi__label">Total</span>
            <span className="im-kpi__value">{stats?.total || 0}</span>
            <div className="im-kpi__accent-line" />
          </div>

          <div className="im-kpi">
            <span className="im-kpi__label">Unread</span>
            <span
              className="im-kpi__value"
              style={{ color: 'var(--color-im-accent)' }}
            >
              {stats?.unread || 0}
            </span>
            <div className="im-kpi__accent-line" />
          </div>

          <div className="im-kpi">
            <span className="im-kpi__label">Errors</span>
            <span
              className="im-kpi__value"
              style={{ color: 'var(--color-im-bad)' }}
            >
              {stats?.byType?.error || 0}
            </span>
            <div className="im-kpi__accent-line" />
          </div>

          <div className="im-kpi">
            <span className="im-kpi__label">Warnings</span>
            <span className="im-kpi__value" style={{ color: '#FB923C' }}>
              {stats?.byType?.warning || 0}
            </span>
            <div className="im-kpi__accent-line" />
          </div>
        </div>

        {/* Filters */}
        <div className="im-section">
          <div className="im-section__header">
            <span
              className="im-section__label"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Filter style={{ width: 14, height: 14 }} />
              Filters
            </span>
          </div>
          <div
            className="im-section__body"
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              {/* Search */}
              <div style={{ position: 'relative' }}>
                <Search
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 14,
                    height: 14,
                    color: 'var(--color-im-muted)',
                  }}
                />
                <input
                  className="im-input"
                  style={{ paddingLeft: 32 }}
                  placeholder="Search notifications..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Category Filter */}
              <div className="im-select-wrap">
                <select
                  className="im-select"
                  value={categoryFilter}
                  onChange={e =>
                    setCategoryFilter(
                      e.target.value as NotificationCategory | 'all'
                    )
                  }
                >
                  <option value="all">All Categories</option>
                  {Object.entries(NOTIFICATION_CATEGORY_LABELS).map(
                    ([key, label]) => (
                      <option key={key} value={key}>
                        {String(label)}
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* Type Filter */}
              <div className="im-select-wrap">
                <select
                  className="im-select"
                  value={typeFilter}
                  onChange={e =>
                    setTypeFilter(e.target.value as NotificationType | 'all')
                  }
                >
                  <option value="all">All Types</option>
                  {Object.entries(NOTIFICATION_TYPE_LABELS).map(
                    ([key, label]) => (
                      <option key={key} value={key}>
                        {String(label)}
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* Read Status Filter */}
              <div className="im-select-wrap">
                <select
                  className="im-select"
                  value={readFilter}
                  onChange={e =>
                    setReadFilter(e.target.value as 'all' | 'unread' | 'read')
                  }
                >
                  <option value="all">All Status</option>
                  <option value="unread">Unread</option>
                  <option value="read">Read</option>
                </select>
              </div>
            </div>

            {/* Active Filters */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {(searchQuery ||
                categoryFilter !== 'all' ||
                typeFilter !== 'all' ||
                readFilter !== 'all') && (
                <>
                  <span
                    style={{ color: 'var(--color-im-muted)', fontSize: 13 }}
                  >
                    Active filters:
                  </span>
                  {searchQuery && (
                    <span className="im-badge is-neutral">
                      Search: {searchQuery}
                    </span>
                  )}
                  {categoryFilter !== 'all' && (
                    <span className="im-badge is-neutral">
                      Category: {NOTIFICATION_CATEGORY_LABELS[categoryFilter]}
                    </span>
                  )}
                  {typeFilter !== 'all' && (
                    <span className="im-badge is-neutral">
                      Type: {NOTIFICATION_TYPE_LABELS[typeFilter]}
                    </span>
                  )}
                  {readFilter !== 'all' && (
                    <span className="im-badge is-neutral">
                      Status: {readFilter}
                    </span>
                  )}
                  <button
                    type="button"
                    className="im-btn im-btn--sm"
                    onClick={handleClearFilters}
                  >
                    Clear all
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Notifications List */}
        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">
              Activity Timeline ({filteredNotifications.length})
            </span>
          </div>
          <div className="im-section__body" style={{ padding: 0 }}>
            {filteredNotifications.length === 0 ? (
              <div
                style={{
                  color: 'var(--color-im-muted)',
                  padding: 32,
                  textAlign: 'center',
                }}
              >
                {notifications.length === 0
                  ? 'No notifications yet'
                  : 'No notifications match your filters'}
              </div>
            ) : (
              <div className="divide-y">
                <AnimatePresence>
                  {filteredNotifications.map(
                    (notification: Notification, index: number) => {
                      const TypeIcon = getNotificationTypeIcon(
                        notification.type
                      );
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
                          className={`hover:bg-muted/50 group cursor-pointer p-4 ${!notification.read ? 'bg-muted/30' : ''} `}
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
                                <span
                                  className="im-badge is-neutral"
                                  style={{ fontSize: 11 }}
                                >
                                  {
                                    NOTIFICATION_CATEGORY_LABELS[
                                      notification.category || 'unknown'
                                    ]
                                  }
                                </span>
                              </div>

                              <p
                                style={{
                                  color: 'var(--color-im-muted)',
                                  marginBottom: 8,
                                  fontSize: 13,
                                }}
                              >
                                {notification.message}
                              </p>

                              <div className="flex items-center justify-between">
                                <span
                                  style={{
                                    color: 'var(--color-im-muted)',
                                    fontSize: 12,
                                  }}
                                >
                                  {formatNotificationTime(
                                    notification.timestamp
                                  )}
                                </span>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className="im-btn im-btn--sm"
                                    style={{ padding: '0 6px' }}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <MoreVertical
                                      style={{ width: 14, height: 14 }}
                                    />
                                  </button>
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
          </div>
        </div>
      </div>
    </div>
  );
}
