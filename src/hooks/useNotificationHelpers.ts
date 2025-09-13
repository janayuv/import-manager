import { useNotifications } from '@/contexts/NotificationContext';
import type { Notification } from '@/types/notification';

export function useNotificationHelpers() {
  const { addNotification, markAsRead, removeNotification } =
    useNotifications();

  const showSuccess = (title: string, message: string, category?: string) => {
    addNotification({
      title,
      message,
      type: 'success',
      category,
    });
  };

  const showError = (title: string, message: string, category?: string) => {
    addNotification({
      title,
      message,
      type: 'error',
      category,
    });
  };

  const showWarning = (title: string, message: string, category?: string) => {
    addNotification({
      title,
      message,
      type: 'warning',
      category,
    });
  };

  const showInfo = (title: string, message: string, category?: string) => {
    addNotification({
      title,
      message,
      type: 'info',
      category,
    });
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);

    if (notification.actionUrl) {
      // Handle navigation to action URL
      console.log('Navigate to:', notification.actionUrl);
    }
  };

  const dismissNotification = (id: string) => {
    removeNotification(id);
  };

  // Additional notification functions for demo
  const notifyShipmentEvent = (title: string, message: string) => {
    showSuccess(title, message, 'shipment');
  };

  const notifyInvoiceEvent = (title: string, message: string) => {
    showInfo(title, message, 'invoice');
  };

  const notifyBOEEvent = (title: string, message: string) => {
    showWarning(title, message, 'boe');
  };

  const notifyExpenseEvent = (title: string, message: string) => {
    showError(title, message, 'expense');
  };

  const notifySystemEvent = (title: string, message: string) => {
    showInfo(title, message, 'system');
  };

  const notifySuccess = showSuccess;
  const notifyError = showError;
  const notifyWarning = showWarning;
  const notifyInfo = showInfo;

  return {
    showSuccess,
    showError,
    showWarning,
    showInfo,
    handleNotificationClick,
    dismissNotification,
    notifyShipmentEvent,
    notifyInvoiceEvent,
    notifyBOEEvent,
    notifyExpenseEvent,
    notifySystemEvent,
    notifySuccess,
    notifyError,
    notifyWarning,
    notifyInfo,
  };
}
