import { useMemo } from 'react';
import { toast } from 'sonner';
import { useNotifications } from '@/contexts/NotificationContext';
import type { Notification } from '@/types/notification';

export interface NotificationOptions {
  /** Whether to show as toast (temporary) or persistent notification */
  persistent?: boolean;
  /** Category for persistent notifications */
  category?: string;
  /** Duration for toast notifications (default: 4000ms) */
  duration?: number;
  /** Action URL for persistent notifications */
  actionUrl?: string;
  /** Additional data for the notification */
  data?: Record<string, unknown>;
}

export interface UnifiedNotificationHelpers {
  // Success notifications
  success: (
    title: string,
    message?: string,
    options?: NotificationOptions
  ) => void;

  // Error notifications
  error: (
    title: string,
    message?: string,
    options?: NotificationOptions
  ) => void;

  // Warning notifications
  warning: (
    title: string,
    message?: string,
    options?: NotificationOptions
  ) => void;

  // Info notifications
  info: (
    title: string,
    message?: string,
    options?: NotificationOptions
  ) => void;

  // Loading notifications (toast only)
  loading: (message: string) => string;

  // Dismiss loading notification
  dismiss: (id: string) => void;

  // Module-specific helpers
  shipment: {
    created: (invoiceNumber: string) => void;
    updated: (invoiceNumber: string) => void;
    deleted: (invoiceNumber: string) => void;
    imported: (count: number) => void;
    exported: (count: number) => void;
    delivered: (invoiceNumber: string) => void;
    error: (operation: string, error?: string) => void;
  };

  invoice: {
    created: (invoiceNumber: string, status: string) => void;
    updated: (invoiceNumber: string) => void;
    deleted: (invoiceNumber: string) => void;
    finalized: (invoiceNumber: string) => void;
    imported: (count: number) => void;
    error: (operation: string, error?: string) => void;
  };

  boe: {
    created: (beNumber: string) => void;
    updated: (beNumber: string) => void;
    deleted: (beNumber: string) => void;
    imported: (count: number) => void;
    error: (operation: string, error?: string) => void;
  };

  expense: {
    created: (invoiceNo: string) => void;
    updated: (invoiceNo: string) => void;
    deleted: (invoiceNo: string) => void;
    imported: (count: number) => void;
    error: (operation: string, error?: string) => void;
  };

  supplier: {
    created: (name: string) => void;
    updated: (name: string) => void;
    deleted: (name: string) => void;
    imported: (count: number) => void;
    error: (operation: string, error?: string) => void;
  };

  item: {
    created: (partNumber: string) => void;
    updated: (partNumber: string) => void;
    deleted: (partNumber: string) => void;
    imported: (count: number) => void;
    exported: (count: number) => void;
    error: (operation: string, error?: string) => void;
  };

  system: {
    backup: (status: 'started' | 'completed' | 'failed') => void;
    maintenance: (message: string) => void;
    update: (version: string) => void;
    error: (operation: string, error?: string) => void;
  };
}

export function useUnifiedNotifications(): UnifiedNotificationHelpers {
  const { addNotification } = useNotifications();

  const showNotification = (
    type: Notification['type'],
    title: string,
    message?: string,
    options: NotificationOptions = {}
  ) => {
    const {
      persistent = false,
      category,
      duration = 4000,
      actionUrl,
      data,
    } = options;

    if (persistent) {
      // Add to persistent notification system
      addNotification({
        title,
        message: message || '',
        type,
        category,
        actionUrl,
      });
    } else {
      // Show as toast
      const toastOptions: Record<string, unknown> = { duration };
      if (data) {
        toastOptions.data = data;
      }

      switch (type) {
        case 'success':
          toast.success(title, { description: message, ...toastOptions });
          break;
        case 'error':
          toast.error(title, { description: message, ...toastOptions });
          break;
        case 'warning':
          toast.warning(title, { description: message, ...toastOptions });
          break;
        case 'info':
        default:
          toast.info(title, { description: message, ...toastOptions });
          break;
      }
    }
  };

  const loading = (message: string): string => {
    return String(toast.loading(message));
  };

  const dismiss = (id: string) => {
    toast.dismiss(id);
  };

  return useMemo(
    () => ({
      success: (title, message, options) =>
        showNotification('success', title, message, options),
      error: (title, message, options) =>
        showNotification('error', title, message, options),
      warning: (title, message, options) =>
        showNotification('warning', title, message, options),
      info: (title, message, options) =>
        showNotification('info', title, message, options),
      loading,
      dismiss,

      shipment: {
        created: invoiceNumber =>
          showNotification(
            'success',
            'Shipment Created',
            `Shipment ${invoiceNumber} has been created successfully`,
            { category: 'shipment' }
          ),
        updated: invoiceNumber =>
          showNotification(
            'success',
            'Shipment Updated',
            `Shipment ${invoiceNumber} has been updated successfully`,
            { category: 'shipment' }
          ),
        deleted: invoiceNumber =>
          showNotification(
            'success',
            'Shipment Deleted',
            `Shipment ${invoiceNumber} has been deleted successfully`,
            { category: 'shipment' }
          ),
        imported: count =>
          showNotification(
            'success',
            'Import Complete',
            `${count} shipments imported successfully`,
            { category: 'shipment' }
          ),
        exported: count =>
          showNotification(
            'success',
            'Export Complete',
            `${count} shipments exported successfully`,
            { category: 'shipment' }
          ),
        delivered: invoiceNumber =>
          showNotification(
            'success',
            'Shipment Delivered',
            `Shipment ${invoiceNumber} has been marked as delivered`,
            { category: 'shipment' }
          ),
        error: (operation, error) =>
          showNotification(
            'error',
            'Shipment Error',
            `Failed to ${operation} shipment${error ? `: ${error}` : ''}`,
            { category: 'shipment' }
          ),
      },

      invoice: {
        created: (invoiceNumber, status) =>
          showNotification(
            'success',
            'Invoice Created',
            `Invoice ${invoiceNumber} has been created as ${status}`,
            { category: 'invoice' }
          ),
        updated: invoiceNumber =>
          showNotification(
            'success',
            'Invoice Updated',
            `Invoice ${invoiceNumber} has been updated successfully`,
            { category: 'invoice' }
          ),
        deleted: invoiceNumber =>
          showNotification(
            'success',
            'Invoice Deleted',
            `Invoice ${invoiceNumber} has been deleted successfully`,
            { category: 'invoice' }
          ),
        finalized: invoiceNumber =>
          showNotification(
            'success',
            'Invoice Finalized',
            `Invoice ${invoiceNumber} has been finalized successfully`,
            { category: 'invoice' }
          ),
        imported: count =>
          showNotification(
            'success',
            'Import Complete',
            `${count} invoices imported successfully`,
            { category: 'invoice' }
          ),
        error: (operation, error) =>
          showNotification(
            'error',
            'Invoice Error',
            `Failed to ${operation} invoice${error ? `: ${error}` : ''}`,
            { category: 'invoice' }
          ),
      },

      boe: {
        created: beNumber =>
          showNotification(
            'success',
            'BOE Created',
            `BOE ${beNumber} has been created successfully`,
            { category: 'boe' }
          ),
        updated: beNumber =>
          showNotification(
            'success',
            'BOE Updated',
            `BOE ${beNumber} has been updated successfully`,
            { category: 'boe' }
          ),
        deleted: beNumber =>
          showNotification(
            'success',
            'BOE Deleted',
            `BOE ${beNumber} has been deleted successfully`,
            { category: 'boe' }
          ),
        imported: count =>
          showNotification(
            'success',
            'Import Complete',
            `${count} BOEs imported successfully`,
            { category: 'boe' }
          ),
        error: (operation, error) =>
          showNotification(
            'error',
            'BOE Error',
            `Failed to ${operation} BOE${error ? `: ${error}` : ''}`,
            { category: 'boe' }
          ),
      },

      expense: {
        created: invoiceNo =>
          showNotification(
            'success',
            'Expense Created',
            `Expense for invoice ${invoiceNo} has been created successfully`,
            { category: 'expense' }
          ),
        updated: invoiceNo =>
          showNotification(
            'success',
            'Expense Updated',
            `Expense for invoice ${invoiceNo} has been updated successfully`,
            { category: 'expense' }
          ),
        deleted: invoiceNo =>
          showNotification(
            'success',
            'Expense Deleted',
            `Expense for invoice ${invoiceNo} has been deleted successfully`,
            { category: 'expense' }
          ),
        imported: count =>
          showNotification(
            'success',
            'Import Complete',
            `${count} expenses imported successfully`,
            { category: 'expense' }
          ),
        error: (operation, error) =>
          showNotification(
            'error',
            'Expense Error',
            `Failed to ${operation} expense${error ? `: ${error}` : ''}`,
            { category: 'expense' }
          ),
      },

      supplier: {
        created: name =>
          showNotification(
            'success',
            'Supplier Created',
            `Supplier "${name}" has been created successfully`,
            { category: 'supplier' }
          ),
        updated: name =>
          showNotification(
            'success',
            'Supplier Updated',
            `Supplier "${name}" has been updated successfully`,
            { category: 'supplier' }
          ),
        deleted: name =>
          showNotification(
            'success',
            'Supplier Deleted',
            `Supplier "${name}" has been deleted successfully`,
            { category: 'supplier' }
          ),
        imported: count =>
          showNotification(
            'success',
            'Import Complete',
            `${count} suppliers imported successfully`,
            { category: 'supplier' }
          ),
        error: (operation, error) =>
          showNotification(
            'error',
            'Supplier Error',
            `Failed to ${operation} supplier${error ? `: ${error}` : ''}`,
            { category: 'supplier' }
          ),
      },

      item: {
        created: partNumber =>
          showNotification(
            'success',
            'Item Created',
            `Item "${partNumber}" has been created successfully`,
            { category: 'item' }
          ),
        updated: partNumber =>
          showNotification(
            'success',
            'Item Updated',
            `Item "${partNumber}" has been updated successfully`,
            { category: 'item' }
          ),
        deleted: partNumber =>
          showNotification(
            'success',
            'Item Deleted',
            `Item "${partNumber}" has been deleted successfully`,
            { category: 'item' }
          ),
        imported: count =>
          showNotification(
            'success',
            'Import Complete',
            `${count} items imported successfully`,
            { category: 'item' }
          ),
        exported: count =>
          showNotification(
            'success',
            'Export Complete',
            `${count} items exported successfully`,
            { category: 'item' }
          ),
        error: (operation, error) =>
          showNotification(
            'error',
            'Item Error',
            `Failed to ${operation} item${error ? `: ${error}` : ''}`,
            { category: 'item' }
          ),
      },

      system: {
        backup: status => {
          const messages = {
            started: 'System backup has started',
            completed: 'System backup completed successfully',
            failed: 'System backup failed',
          };
          const type =
            status === 'failed'
              ? 'error'
              : status === 'completed'
                ? 'success'
                : 'info';
          showNotification(type, 'System Backup', messages[status], {
            category: 'system',
            persistent: true,
          });
        },
        maintenance: message =>
          showNotification('warning', 'System Maintenance', message, {
            category: 'system',
            persistent: true,
          }),
        update: version =>
          showNotification(
            'info',
            'System Update',
            `System updated to version ${version}`,
            { category: 'system', persistent: true }
          ),
        error: (operation, error) =>
          showNotification(
            'error',
            'System Error',
            `System error during ${operation}${error ? `: ${error}` : ''}`,
            { category: 'system', persistent: true }
          ),
      },
    }),
    [addNotification]
  );
}
