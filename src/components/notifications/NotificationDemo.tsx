import { Bell, TestTube, Zap } from 'lucide-react';



import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNotificationHelpers } from '@/hooks/useNotificationHelpers';

/**
 * Demo component to showcase the notification system
 * This can be used for testing and demonstration purposes
 */
export function NotificationDemo() {
  const {
    notifyShipmentEvent,
    notifyInvoiceEvent,
    notifyBOEEvent,
    notifyExpenseEvent,
    notifySystemEvent,
    notifySuccess,
    notifyError,
    notifyWarning,
    notifyInfo,
  } = useNotificationHelpers();

  const handleShipmentDemo = async () => {
    await notifyShipmentEvent({
      type: 'shipment_created',
      shipmentId: 'SHIP-001',
      shipmentNumber: 'SHIP-001',
    });
  };

  const handleInvoiceDemo = async () => {
    await notifyInvoiceEvent({
      type: 'invoice_paid',
      invoiceId: 'INV-001',
      invoiceNumber: 'INV-001',
      amount: 1500.0,
      currency: 'USD',
    });
  };

  const handleBOEDemo = async () => {
    await notifyBOEEvent({
      type: 'boe_approved',
      boeId: 'BOE-001',
      boeNumber: 'BOE-001',
    });
  };

  const handleExpenseDemo = async () => {
    await notifyExpenseEvent({
      type: 'expense_rejected',
      expenseId: 'EXP-001',
      amount: 250.0,
      currency: 'USD',
      category: 'Travel',
    });
  };

  const handleSystemDemo = async () => {
    await notifySystemEvent({
      type: 'backup_completed',
      details: 'Daily backup completed successfully at 2:00 AM',
    });
  };

  const handleQuickNotifications = async () => {
    await notifySuccess(
      'Operation Successful',
      'The data has been saved successfully'
    );

    setTimeout(async () => {
      await notifyInfo('Information', 'This is an informational message');
    }, 1000);

    setTimeout(async () => {
      await notifyWarning('Warning', 'Please check your input data');
    }, 2000);

    setTimeout(async () => {
      await notifyError('Error Occurred', 'Failed to process the request');
    }, 3000);
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification System Demo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Module-specific notifications */}
          <div className="space-y-3">
            <h3 className="text-muted-foreground text-sm font-medium">
              Module Notifications
            </h3>

            <Button
              onClick={handleShipmentDemo}
              variant="outline"
              className="w-full justify-start"
            >
              <Zap className="mr-2 h-4 w-4" />
              Shipment Created
            </Button>

            <Button
              onClick={handleInvoiceDemo}
              variant="outline"
              className="w-full justify-start"
            >
              <Zap className="mr-2 h-4 w-4" />
              Invoice Paid
            </Button>

            <Button
              onClick={handleBOEDemo}
              variant="outline"
              className="w-full justify-start"
            >
              <Zap className="mr-2 h-4 w-4" />
              BOE Approved
            </Button>

            <Button
              onClick={handleExpenseDemo}
              variant="outline"
              className="w-full justify-start"
            >
              <Zap className="mr-2 h-4 w-4" />
              Expense Rejected
            </Button>

            <Button
              onClick={handleSystemDemo}
              variant="outline"
              className="w-full justify-start"
            >
              <Zap className="mr-2 h-4 w-4" />
              System Backup
            </Button>
          </div>

          {/* Quick notifications */}
          <div className="space-y-3">
            <h3 className="text-muted-foreground text-sm font-medium">
              Quick Notifications
            </h3>

            <Button
              onClick={handleQuickNotifications}
              variant="outline"
              className="w-full justify-start"
            >
              <TestTube className="mr-2 h-4 w-4" />
              Test All Types
            </Button>
          </div>
        </div>

        <div className="text-muted-foreground bg-muted/50 mt-4 rounded-md p-3 text-xs">
          <p className="mb-1 font-medium">
            How to use notifications in your components:
          </p>
          <code className="text-xs">
            {`const { notifySuccess } = useNotificationHelpers();
await notifySuccess('Title', 'Message', 'category');`}
          </code>
        </div>
      </CardContent>
    </Card>
  );
}
