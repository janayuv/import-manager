export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: Date;
  read: boolean;
  category?: string;
  actionUrl?: string;
}

export interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (
    notification: Omit<Notification, 'id' | 'timestamp' | 'read'>
  ) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  deleteNotification?: (id: string) => void;
  clearAllNotifications?: () => void;
  stats?: {
    total: number;
    unread: number;
    byCategory: Record<string, number>;
    byType: Record<string, number>;
  };
  isLoading?: boolean;
}

export type NotificationCategory =
  | 'shipment'
  | 'invoice'
  | 'boe'
  | 'expense'
  | 'system';
export type NotificationType = 'info' | 'success' | 'warning' | 'error';
