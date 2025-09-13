import type { Notification } from '@/types/notification';

export const formatNotificationTime = (timestamp: Date): string => {
  const now = new Date();
  const diff = now.getTime() - timestamp.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return timestamp.toLocaleDateString();
};

export const getNotificationIcon = (type: Notification['type']): string => {
  switch (type) {
    case 'success':
      return '✓';
    case 'warning':
      return '⚠';
    case 'error':
      return '✕';
    case 'info':
    default:
      return 'ℹ';
  }
};

export const getNotificationColor = (type: Notification['type']): string => {
  switch (type) {
    case 'success':
      return 'text-green-600 bg-green-50 border-green-200';
    case 'warning':
      return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    case 'error':
      return 'text-red-600 bg-red-50 border-red-200';
    case 'info':
    default:
      return 'text-blue-600 bg-blue-50 border-blue-200';
  }
};

export const filterNotificationsByCategory = (
  notifications: Notification[],
  category?: string
): Notification[] => {
  if (!category) return notifications;
  return notifications.filter(
    notification => notification.category === category
  );
};

export const sortNotificationsByTime = (
  notifications: Notification[]
): Notification[] => {
  return [...notifications].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );
};

// Additional utility functions for notification components
export const getNotificationTypeIcon = (type: Notification['type']): string => {
  return getNotificationIcon(type);
};

export const getNotificationCategoryIcon = (category?: string): string => {
  switch (category) {
    case 'shipment':
      return '🚢';
    case 'invoice':
      return '📄';
    case 'boe':
      return '📋';
    case 'expense':
      return '💰';
    case 'system':
      return '⚙️';
    default:
      return '📢';
  }
};

export const getNotificationColors = (
  type: Notification['type']
): { bg: string; icon: string; border: string } => {
  const baseColor = getNotificationColor(type);
  return {
    bg: baseColor.split(' ')[1], // Extract bg color from the class string
    icon: baseColor.split(' ')[0], // Extract text color from the class string
    border: baseColor.split(' ')[2] || '', // Extract border color if present
  };
};

// Notification category and type labels
export const NOTIFICATION_CATEGORY_LABELS: Record<string, string> = {
  shipment: 'Shipments',
  invoice: 'Invoices',
  boe: 'BOE',
  expense: 'Expenses',
  system: 'System',
  unknown: 'Unknown',
};

export const NOTIFICATION_TYPE_LABELS = {
  info: 'Information',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
} as const;
