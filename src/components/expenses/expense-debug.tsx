import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect, useCallback, useRef } from 'react';

import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';
import { useDebugUtils, getEnvironmentConfig } from '@/lib/debug-utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export function ExpenseDebug() {
  const notifications = useUnifiedNotifications();
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [environmentInfo, setEnvironmentInfo] = useState<string>('');
  const [newExpenseType, setNewExpenseType] = useState({
    name: '',
    cgstRate: 9, // 9% as percentage
    sgstRate: 9, // 9% as percentage
    igstRate: 0, // 0% as percentage
  });

  // Ref to prevent multiple auto-runs
  const hasAutoRun = useRef(false);

  // Get environment config for display
  const envConfig = getEnvironmentConfig();

  // Auto-adjust debug configuration based on environment
  const { config, logger, getSystemInfo, formatDebugInfo } = useDebugUtils(
    'Expenses',
    [
      // Custom debug actions specific to expenses module
      {
        id: 'debug-expense-types',
        label: 'Debug Expense Types',
        description: 'Show current expense types and their rates',
        action: async () => {
          const info = await invoke<string>('debug_expense_types');
          return info;
        },
        variant: 'default',
      },
      {
        id: 'debug-expense-data',
        label: 'Debug Expense Data',
        description: 'Show expense data counts and statistics',
        action: async () => {
          const info = await invoke<string>('debug_expense_data_counts');
          return info;
        },
        variant: 'default',
      },
      {
        id: 'fix-expense-types',
        label: 'Fix All Expense Types',
        description: 'Fix expense types with correct rates',
        action: async () => {
          const result = await invoke<string>('fix_expense_types');
          return result;
        },
        variant: 'destructive',
        requiresConfirmation: true,
      },
      {
        id: 'fix-existing-expenses',
        label: 'Fix Existing Expenses',
        description:
          'Fix existing expenses with correct rates and recalculated amounts',
        action: async () => {
          const result = await invoke<string>('fix_existing_expenses');
          return result;
        },
        variant: 'destructive',
        requiresConfirmation: true,
      },
      {
        id: 'cleanup-orphaned-invoices',
        label: 'Cleanup Orphaned Invoices',
        description: 'Clean up orphaned expense invoices',
        action: async () => {
          const result = await invoke<string>(
            'cleanup_orphaned_expense_invoices'
          );
          return result;
        },
        variant: 'destructive',
        requiresConfirmation: true,
      },
    ]
  );

  // Auto-adjusting debug action runner with error handling and fallbacks
  const runDebugAction = useCallback(
    async (actionId: string): Promise<void> => {
      setLoading(true);
      const startTime = performance.now();

      try {
        logger.debug(`ExpenseDebug: Running debug action: ${actionId}`);

        // Find the action in custom actions or default actions
        const action = config.customDebugActions?.find(a => a.id === actionId);

        if (!action) {
          throw new Error(`Debug action '${actionId}' not found`);
        }

        // Handle confirmation requirement
        if (action.requiresConfirmation) {
          const confirmed = confirm(
            `Are you sure you want to ${action.label.toLowerCase()}? This action cannot be undone.`
          );
          if (!confirmed) {
            logger.info(`ExpenseDebug: Action ${actionId} cancelled by user`);
            return;
          }
        }

        // Execute the action
        const result = await action.action();
        setDebugInfo(result);

        // Log success with performance metrics
        const duration = performance.now() - startTime;
        logger.performance(
          `ExpenseDebug: Action ${actionId} completed`,
          duration
        );

        // Show success notification
        notifications.success(
          'Debug Action Completed',
          `${action.label} completed successfully`
        );
      } catch (error) {
        const duration = performance.now() - startTime;
        logger.error(
          `ExpenseDebug: Action ${actionId} failed after ${duration}ms`,
          error
        );
        notifications.error(
          'Debug Error',
          `Failed to ${actionId.replace('-', ' ')}`
        );
      } finally {
        setLoading(false);
      }
    },
    [config, logger, notifications]
  );

  // Auto-adjust behavior: Load environment info on component mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const loadEnvironmentInfo = async () => {
      try {
        const envConfig = getEnvironmentConfig();
        logger.debug('ExpenseDebug: Environment config loaded', envConfig);

        if (config.showEnvironmentInfo) {
          const systemInfo = getSystemInfo();
          setEnvironmentInfo(formatDebugInfo(systemInfo));
        }

        // Auto-run debug actions in development mode (only once)
        if (
          envConfig.isDevelopment &&
          config.enableVerboseLogging &&
          !hasAutoRun.current
        ) {
          hasAutoRun.current = true;
          logger.debug(
            'ExpenseDebug: Auto-running debug actions in development mode'
          );
          await runDebugAction('debug-expense-types');
        }
      } catch (error) {
        logger.error('ExpenseDebug: Failed to load environment info', error);
      }
    };

    loadEnvironmentInfo();
  }, []); // Empty dependency array to run only once on mount

  // Legacy function for backward compatibility (now uses auto-adjusting pattern)
  const debugExpenseTypes = async () => {
    await runDebugAction('debug-expense-types');
  };

  const addExpenseType = async () => {
    if (!newExpenseType.name.trim()) {
      notifications.error(
        'Validation Error',
        'Please enter an expense type name'
      );
      return;
    }

    setLoading(true);
    try {
      await invoke('add_expense_type_with_rates', {
        name: newExpenseType.name,
        cgstRate: newExpenseType.cgstRate * 100, // Convert percentage to basis points for backend
        sgstRate: newExpenseType.sgstRate * 100,
        igstRate: newExpenseType.igstRate * 100,
      });
      notifications.success(
        'Expense Type Added',
        `Added expense type: ${newExpenseType.name}`
      );
      setNewExpenseType({
        name: '',
        cgstRate: 9,
        sgstRate: 9,
        igstRate: 0,
      });
      // Refresh debug info
      await debugExpenseTypes();
    } catch (error) {
      console.error('Failed to add expense type:', error);
      notifications.error('Creation Error', 'Failed to add expense type');
    } finally {
      setLoading(false);
    }
  };

  // Auto-adjusting sample data addition with environment-aware logging
  const addSampleExpenseTypes = async () => {
    setLoading(true);
    const startTime = performance.now();

    try {
      logger.debug('ExpenseDebug: Adding sample expense types');

      const sampleTypes = [
        { name: 'Transport Charges-LCL', cgst: 9, sgst: 9, igst: 0 },
        { name: 'Transport Charges-FCL', cgst: 9, sgst: 9, igst: 0 },
        { name: 'CFS Charges-FCL', cgst: 9, sgst: 9, igst: 0 },
        { name: 'Customs Duty', cgst: 9, sgst: 9, igst: 0 },
        { name: 'Freight Charges', cgst: 0, sgst: 0, igst: 18 },
        { name: 'Handling Charges', cgst: 9, sgst: 9, igst: 0 },
      ];

      for (const type of sampleTypes) {
        await invoke('add_expense_type_with_rates', {
          name: type.name,
          cgstRate: type.cgst * 100, // Convert percentage to basis points for backend
          sgstRate: type.sgst * 100,
          igstRate: type.igst * 100,
        });
        logger.debug(`ExpenseDebug: Added sample type: ${type.name}`);
      }

      const duration = performance.now() - startTime;
      logger.performance('ExpenseDebug: Sample types added', duration);

      notifications.success('Sample Data Added', 'Added sample expense types');

      // Auto-refresh debug info after adding samples
      await debugExpenseTypes();
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error(
        `ExpenseDebug: Failed to add sample types after ${duration}ms`,
        error
      );
      notifications.error(
        'Creation Error',
        'Failed to add sample expense types'
      );
    } finally {
      setLoading(false);
    }
  };

  // Legacy functions now use auto-adjusting pattern
  // Note: These functions are now handled by the auto-adjusting debug actions

  const fixLclChargesRate = async () => {
    setLoading(true);
    const startTime = performance.now();

    try {
      logger.debug('ExpenseDebug: Fixing LCL charges rate');
      const result = await invoke<string>('fix_lcl_charges_rate');
      setDebugInfo(result);

      const duration = performance.now() - startTime;
      logger.performance('ExpenseDebug: LCL charges rate fixed', duration);

      notifications.success('Fix Applied', 'Fixed LCL Charges rate');
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error(
        `ExpenseDebug: Failed to fix LCL charges rate after ${duration}ms`,
        error
      );
      notifications.error('Fix Error', 'Failed to fix LCL Charges rate');
    } finally {
      setLoading(false);
    }
  };

  // cleanupOrphanedExpenseInvoices is now handled by auto-adjusting debug actions

  return (
    <div className="space-y-6 p-6">
      {/* Auto-adjusting Environment Status */}
      {config.showEnvironmentInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Environment Status
              <Badge
                variant={config.enableDebugPanel ? 'default' : 'secondary'}
              >
                {config.enableDebugPanel ? 'Debug Mode' : 'Production Mode'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Environment</Label>
                <div className="flex gap-2">
                  <Badge
                    variant={envConfig.isDevelopment ? 'default' : 'outline'}
                  >
                    Development: {envConfig.isDevelopment ? 'Yes' : 'No'}
                  </Badge>
                  <Badge
                    variant={envConfig.isProduction ? 'default' : 'outline'}
                  >
                    Production: {envConfig.isProduction ? 'Yes' : 'No'}
                  </Badge>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Logging</Label>
                <div className="flex gap-2">
                  <Badge
                    variant={
                      config.enableVerboseLogging ? 'default' : 'outline'
                    }
                  >
                    Verbose: {config.enableVerboseLogging ? 'On' : 'Off'}
                  </Badge>
                  <Badge variant="outline">Level: {envConfig.logLevel}</Badge>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Monitoring</Label>
                <div className="flex gap-2">
                  <Badge
                    variant={
                      config.enablePerformanceMonitoring ? 'default' : 'outline'
                    }
                  >
                    Performance:{' '}
                    {config.enablePerformanceMonitoring ? 'On' : 'Off'}
                  </Badge>
                  <Badge
                    variant={config.enableErrorTracking ? 'default' : 'outline'}
                  >
                    Error Tracking: {config.enableErrorTracking ? 'On' : 'Off'}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Debug & Setup Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Expense Types Debug & Setup
            <Badge variant="outline" className="text-xs">
              Auto-Adjusting
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Auto-Adjusting Debug Actions */}
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {config.customDebugActions?.map(action => (
                <Button
                  key={action.id}
                  onClick={() => runDebugAction(action.id)}
                  disabled={loading}
                  variant={action.variant === 'destructive' ? 'destructive' : 'default'}
                  className="text-sm"
                  useAccentColor={action.variant !== 'destructive'}
                >
                  {loading ? 'Loading...' : action.label}
                </Button>
              ))}
            </div>

            {/* Legacy Actions for Backward Compatibility */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm font-medium">
                Legacy Actions (Auto-Adjusted)
              </Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={addSampleExpenseTypes}
                  disabled={loading}
                  variant="default"
                  useAccentColor
                  className="text-sm"
                >
                  Add Sample Expense Types
                </Button>
                <Button
                  onClick={fixLclChargesRate}
                  disabled={loading}
                  variant="destructive"
                  className="text-sm"
                >
                  Fix LCL Charges Rate
                </Button>
              </div>
            </div>

            {/* Debug Information Display */}
            {debugInfo && (
              <div className="bg-muted rounded-lg p-4">
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  Debug Information
                  <Badge variant="outline" className="text-xs">
                    Auto-Generated
                  </Badge>
                </h3>
                <pre className="max-h-96 overflow-auto text-sm whitespace-pre-wrap">
                  {debugInfo}
                </pre>
              </div>
            )}

            {/* Environment Information Display (Development Only) */}
            {config.showEnvironmentInfo && environmentInfo && (
              <div className="bg-muted rounded-lg p-4">
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  Environment Information
                  <Badge variant="outline" className="text-xs">
                    Development Only
                  </Badge>
                </h3>
                <pre className="max-h-64 overflow-auto text-xs whitespace-pre-wrap">
                  {environmentInfo}
                </pre>
              </div>
            )}
          </div>

          <Separator />

          {/* Add New Expense Type Section */}
          <div className="space-y-4">
            <h3 className="flex items-center gap-2 font-semibold">
              Add New Expense Type
              <Badge variant="outline" className="text-xs">
                Manual Entry
              </Badge>
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={newExpenseType.name}
                  onChange={e =>
                    setNewExpenseType(prev => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  placeholder="Expense type name"
                />
              </div>
              <div>
                <Label>CGST Rate (%)</Label>
                <Input
                  type="number"
                  step="1"
                  value={newExpenseType.cgstRate}
                  onChange={e => {
                    const percentage = parseFloat(e.target.value) || 0;
                    setNewExpenseType(prev => ({
                      ...prev,
                      cgstRate: percentage,
                    }));
                  }}
                  placeholder="9"
                />
              </div>
              <div>
                <Label>SGST Rate (%)</Label>
                <Input
                  type="number"
                  step="1"
                  value={newExpenseType.sgstRate}
                  onChange={e => {
                    const percentage = parseFloat(e.target.value) || 0;
                    setNewExpenseType(prev => ({
                      ...prev,
                      sgstRate: percentage,
                    }));
                  }}
                  placeholder="9"
                />
              </div>
              <div>
                <Label>IGST Rate (%)</Label>
                <Input
                  type="number"
                  step="1"
                  value={newExpenseType.igstRate}
                  onChange={e => {
                    const percentage = parseFloat(e.target.value) || 0;
                    setNewExpenseType(prev => ({
                      ...prev,
                      igstRate: percentage,
                    }));
                  }}
                  placeholder="0"
                />
              </div>
            </div>
            <Button
              onClick={addExpenseType}
              disabled={loading || !newExpenseType.name.trim()}
              variant="default"
              useAccentColor
            >
              Add Expense Type
            </Button>
          </div>

          {/* Auto-Adjusting Instructions */}
          <div className="bg-muted rounded-lg p-4">
            <h3 className="text-foreground mb-2 flex items-center gap-2 font-semibold">
              Instructions & Auto-Adjust Behavior
              <Badge variant="outline" className="text-xs">
                Environment-Aware
              </Badge>
            </h3>
            <div className="text-foreground space-y-3 text-sm">
              <div>
                <h4 className="mb-1 font-medium">🔧 Debug Actions:</h4>
                <ul className="ml-4 space-y-1">
                  <li>
                    • Debug actions auto-adjust based on environment
                    (dev/test/prod)
                  </li>
                  <li>
                    • Development mode shows verbose logging and environment
                    info
                  </li>
                  <li>• Production mode hides sensitive debug information</li>
                  <li>
                    • Performance monitoring is enabled in development/test
                    environments
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="mb-1 font-medium">📊 Expense Management:</h4>
                <ul className="ml-4 space-y-1">
                  <li>
                    • Click debug actions to see current expense types and their
                    rates
                  </li>
                  <li>
                    • Add sample expense types with correct rates automatically
                  </li>
                  <li>
                    • Fix actions include confirmation prompts for destructive
                    operations
                  </li>
                  <li>
                    • All actions include performance monitoring and error
                    tracking
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="mb-1 font-medium">⚙️ Technical Details:</h4>
                <ul className="ml-4 space-y-1">
                  <li>
                    • Rates should be entered as percentages (e.g., 9 for 9%)
                  </li>
                  <li>
                    • System converts percentages to basis points for storage
                    (9% = 900 basis points)
                  </li>
                  <li>
                    • Environment detection uses multiple fallback methods for
                    reliability
                  </li>
                  <li>
                    • Error handling includes automatic fallbacks and
                    user-friendly messages
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
