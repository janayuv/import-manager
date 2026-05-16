import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { useState, useEffect, useCallback, useRef } from 'react';

import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';
import { useDebugUtils, getEnvironmentConfig } from '@/lib/debug-utils';
import { confirm as confirmUserAction } from '@/lib/tauri-bridge';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const IM = {
  bg: '#0A0A0A',
  panel: '#101010',
  alt: '#0C0C0B',
  header: '#0D0D0B',
  text: '#EFEDE8',
  muted: '#8C8A82',
  faint: '#56544E',
  rule: '#1F1E1A',
  accent: '#E8A23A',
  accentBg: 'rgba(232,162,58,0.10)',
  accentBdr: 'rgba(232,162,58,0.25)',
  good: '#5FCB7D',
  goodBg: 'rgba(95,203,125,0.10)',
  goodBdr: 'rgba(95,203,125,0.22)',
  bad: '#F87171',
  badBg: 'rgba(248,113,113,0.09)',
  badBdr: 'rgba(248,113,113,0.20)',
  blue: '#60A5FA',
  blueBg: 'rgba(96,165,250,0.08)',
  blueBdr: 'rgba(96,165,250,0.20)',
  mono: "Consolas, 'Courier New', monospace",
} as const;

const panelStyle: React.CSSProperties = {
  border: `1px solid ${IM.rule}`,
  background: IM.panel,
  display: 'flex',
  flexDirection: 'column',
};

const panelHeaderStyle: React.CSSProperties = {
  background: IM.header,
  borderBottom: `1px solid ${IM.rule}`,
  padding: '8px 16px',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const panelTitleStyle: React.CSSProperties = {
  fontFamily: IM.mono,
  fontSize: 11,
  fontWeight: 700,
  color: IM.text,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: IM.mono,
  fontSize: 10,
  fontWeight: 700,
  color: IM.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  display: 'block',
  marginBottom: 8,
};

const fieldLabelStyle: React.CSSProperties = {
  fontFamily: IM.mono,
  fontSize: 10,
  color: IM.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  display: 'block',
  marginBottom: 4,
};

function StatusPill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      style={{
        fontFamily: IM.mono,
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        padding: '1px 6px',
        background: on ? IM.goodBg : IM.badBg,
        color: on ? IM.good : IM.bad,
        border: `1px solid ${on ? IM.goodBdr : IM.badBdr}`,
      }}
    >
      {label}
    </span>
  );
}

function NeutralPill({ label }: { label: string }) {
  return (
    <span
      style={{
        fontFamily: IM.mono,
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        padding: '1px 6px',
        background: IM.blueBg,
        color: IM.blue,
        border: `1px solid ${IM.blueBdr}`,
      }}
    >
      {label}
    </span>
  );
}

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
          const confirmed = await confirmUserAction(
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

  const loadEnvironmentInfo = useCallback(async () => {
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
  }, [
    config.enableVerboseLogging,
    config.showEnvironmentInfo,
    formatDebugInfo,
    getSystemInfo,
    logger,
    runDebugAction,
  ]);

  useEffect(() => {
    void loadEnvironmentInfo();
  }, [loadEnvironmentInfo]);

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
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}
    >
      {/* Environment Status */}
      {config.showEnvironmentInfo && (
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <span style={panelTitleStyle}>Environment Status</span>
            <StatusPill
              on={config.enableDebugPanel}
              label={config.enableDebugPanel ? 'Debug Mode' : 'Production Mode'}
            />
          </div>
          <div style={{ padding: 16 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 16,
              }}
            >
              {/* Environment */}
              <div>
                <span style={sectionLabelStyle}>Environment</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <StatusPill
                    on={envConfig.isDevelopment}
                    label={`Dev: ${envConfig.isDevelopment ? 'Yes' : 'No'}`}
                  />
                  <StatusPill
                    on={envConfig.isProduction}
                    label={`Prod: ${envConfig.isProduction ? 'Yes' : 'No'}`}
                  />
                </div>
              </div>
              {/* Logging */}
              <div>
                <span style={sectionLabelStyle}>Logging</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <StatusPill
                    on={config.enableVerboseLogging}
                    label={`Verbose: ${config.enableVerboseLogging ? 'On' : 'Off'}`}
                  />
                  <NeutralPill label={`Level: ${envConfig.logLevel}`} />
                </div>
              </div>
              {/* Monitoring */}
              <div>
                <span style={sectionLabelStyle}>Monitoring</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <StatusPill
                    on={config.enablePerformanceMonitoring}
                    label={`Perf: ${config.enablePerformanceMonitoring ? 'On' : 'Off'}`}
                  />
                  <StatusPill
                    on={config.enableErrorTracking}
                    label={`Errors: ${config.enableErrorTracking ? 'On' : 'Off'}`}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Debug & Setup */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle}>
          <span style={panelTitleStyle}>Expense Types — Debug &amp; Setup</span>
          <NeutralPill label="Auto-Adjusting" />
        </div>

        <div
          style={{
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {/* Auto-Adjusting Debug Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={sectionLabelStyle}>Debug Actions</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {config.customDebugActions?.map(action => (
                <Button
                  key={action.id}
                  onClick={() => runDebugAction(action.id)}
                  disabled={loading}
                  variant={
                    action.variant === 'destructive' ? 'destructive' : 'default'
                  }
                  useAccentColor={action.variant !== 'destructive'}
                >
                  {loading ? 'Loading...' : action.label}
                </Button>
              ))}
            </div>

            {/* Legacy Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={sectionLabelStyle}>Legacy Actions</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Button
                  onClick={addSampleExpenseTypes}
                  disabled={loading}
                  variant="default"
                  useAccentColor
                >
                  Add Sample Expense Types
                </Button>
                <Button
                  onClick={fixLclChargesRate}
                  disabled={loading}
                  variant="destructive"
                >
                  Fix LCL Charges Rate
                </Button>
              </div>
            </div>

            {/* Debug output */}
            {debugInfo && (
              <div
                style={{
                  background: IM.alt,
                  border: `1px solid ${IM.rule}`,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <span style={panelTitleStyle}>Debug Output</span>
                  <NeutralPill label="Auto-Generated" />
                </div>
                <pre
                  style={{
                    fontFamily: IM.mono,
                    fontSize: 11,
                    color: IM.text,
                    whiteSpace: 'pre-wrap',
                    maxHeight: 320,
                    overflowY: 'auto',
                    margin: 0,
                  }}
                >
                  {debugInfo}
                </pre>
              </div>
            )}

            {/* Environment info */}
            {config.showEnvironmentInfo && environmentInfo && (
              <div
                style={{
                  background: IM.alt,
                  border: `1px solid ${IM.rule}`,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <span style={panelTitleStyle}>Environment Info</span>
                  <NeutralPill label="Development Only" />
                </div>
                <pre
                  style={{
                    fontFamily: IM.mono,
                    fontSize: 10,
                    color: IM.muted,
                    whiteSpace: 'pre-wrap',
                    maxHeight: 200,
                    overflowY: 'auto',
                    margin: 0,
                  }}
                >
                  {environmentInfo}
                </pre>
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ borderTop: `1px solid ${IM.rule}` }} />

          {/* Add New Expense Type */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={panelTitleStyle}>Add New Expense Type</span>
              <NeutralPill label="Manual Entry" />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
              }}
            >
              <div>
                <Label style={fieldLabelStyle}>Name</Label>
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
                <Label style={fieldLabelStyle}>CGST Rate (%)</Label>
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
                <Label style={fieldLabelStyle}>SGST Rate (%)</Label>
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
                <Label style={fieldLabelStyle}>IGST Rate (%)</Label>
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
            <div>
              <Button
                onClick={addExpenseType}
                disabled={loading || !newExpenseType.name.trim()}
                variant="default"
                useAccentColor
              >
                Add Expense Type
              </Button>
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: `1px solid ${IM.rule}` }} />

          {/* Instructions */}
          <div
            style={{
              background: IM.alt,
              border: `1px solid ${IM.rule}`,
              padding: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 12,
              }}
            >
              <span style={panelTitleStyle}>Instructions &amp; Behavior</span>
              <NeutralPill label="Environment-Aware" />
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                fontFamily: IM.mono,
                fontSize: 11,
                color: IM.muted,
              }}
            >
              <div>
                <div
                  style={{
                    color: IM.text,
                    fontWeight: 700,
                    marginBottom: 4,
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Debug Actions
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
                  <li>
                    Debug actions auto-adjust based on environment
                    (dev/test/prod)
                  </li>
                  <li>
                    Development mode shows verbose logging and environment info
                  </li>
                  <li>Production mode hides sensitive debug information</li>
                  <li>
                    Performance monitoring is enabled in development/test
                    environments
                  </li>
                </ul>
              </div>
              <div>
                <div
                  style={{
                    color: IM.text,
                    fontWeight: 700,
                    marginBottom: 4,
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Expense Management
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
                  <li>
                    Click debug actions to see current expense types and their
                    rates
                  </li>
                  <li>
                    Add sample expense types with correct rates automatically
                  </li>
                  <li>
                    Fix actions include confirmation prompts for destructive
                    operations
                  </li>
                  <li>
                    All actions include performance monitoring and error
                    tracking
                  </li>
                </ul>
              </div>
              <div>
                <div
                  style={{
                    color: IM.text,
                    fontWeight: 700,
                    marginBottom: 4,
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Technical Details
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
                  <li>
                    Rates should be entered as percentages (e.g., 9 for 9%)
                  </li>
                  <li>
                    System converts percentages to basis points for storage (9%
                    = 900 basis points)
                  </li>
                  <li>
                    Environment detection uses multiple fallback methods for
                    reliability
                  </li>
                  <li>
                    Error handling includes automatic fallbacks and
                    user-friendly messages
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
