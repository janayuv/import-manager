// src/pages/settings.tsx
'use client';

import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { toast } from 'sonner';
import { useThemeDesign } from '@/components/ThemeProvider';

import * as React from 'react';

interface GoogleOAuthCredentialsInfo {
  configured: boolean;
  runtimeOverride: boolean;
  clientId: string;
  hasRuntimeSecret: boolean;
}

import { ModuleSettings } from '@/components/module-settings';
import {
  AppBar,
  PageHeader,
  SettingsSection,
  SettingRow,
  ImToggle,
} from '@/components/shared/im';
import {
  type AppSettings,
  clearSettings,
  formatCurrency,
  formatDate,
  formatNumber,
  formatText,
  loadSettings,
} from '@/lib/settings';
import { useCurrentUserId } from '@/lib/user-context';
import { useSettings } from '@/lib/use-settings';

// src/pages/settings.tsx

// src/pages/settings.tsx

// src/pages/settings.tsx

export default function SettingsPage() {
  const userId = useCurrentUserId();
  const { theme, mode, setTheme, setMode } = useThemeDesign();
  const {
    settings,
    updateSettings,
    updateNumberSettings,
    updateDateSettings,
    updateTextSettings,
  } = useSettings();
  const [selectedModule, setSelectedModule] = React.useState<string | null>(
    null
  );
  const [lineTotalDecimals, setLineTotalDecimals] = React.useState<0 | 2>(2);
  const [invoiceTotalDecimals, setInvoiceTotalDecimals] = React.useState<0 | 2>(
    2
  );

  const [oauthInfo, setOauthInfo] =
    React.useState<GoogleOAuthCredentialsInfo | null>(null);
  const [oauthClientId, setOauthClientId] = React.useState('');
  const [oauthClientSecret, setOauthClientSecret] = React.useState('');
  const [oauthSaving, setOauthSaving] = React.useState(false);
  const [showSecret, setShowSecret] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;
    invoke<{ lineTotalDecimals: 0 | 2; invoiceTotalDecimals: 0 | 2 }>(
      'get_invoice_calculation_settings'
    )
      .then(config => {
        if (!isMounted) return;
        setLineTotalDecimals(config.lineTotalDecimals);
        setInvoiceTotalDecimals(config.invoiceTotalDecimals);
      })
      .catch(error => {
        console.error('Failed to load invoice calculation settings:', error);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    let isMounted = true;
    invoke<GoogleOAuthCredentialsInfo>('get_google_oauth_credentials', {
      userId,
    })
      .then(info => {
        if (!isMounted) return;
        setOauthInfo(info);
        setOauthClientId(info.clientId);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [userId]);

  const handleSaveOauth = React.useCallback(async () => {
    if (!oauthClientId.trim()) {
      toast.error('Client ID is required');
      return;
    }
    setOauthSaving(true);
    try {
      await invoke('set_google_oauth_credentials', {
        clientId: oauthClientId.trim(),
        clientSecret: oauthClientSecret.trim(),
        userId,
      });
      const updated = await invoke<GoogleOAuthCredentialsInfo>(
        'get_google_oauth_credentials',
        { userId }
      );
      setOauthInfo(updated);
      setOauthClientId(updated.clientId);
      setOauthClientSecret('');
      toast.success('Google OAuth credentials saved');
    } catch {
      toast.error('Failed to save credentials');
    } finally {
      setOauthSaving(false);
    }
  }, [oauthClientId, oauthClientSecret, userId]);

  const handleClearOauth = React.useCallback(async () => {
    try {
      await invoke('clear_google_oauth_credentials', { userId });
      const updated = await invoke<GoogleOAuthCredentialsInfo>(
        'get_google_oauth_credentials',
        { userId }
      );
      setOauthInfo(updated);
      setOauthClientId(updated.clientId);
      setOauthClientSecret('');
      toast.success('Google OAuth credentials cleared');
    } catch {
      toast.error('Failed to clear credentials');
    }
  }, [userId]);

  const persistInvoiceCalculationSettings = React.useCallback(
    async (lineDecimals: 0 | 2, invoiceDecimals: 0 | 2) => {
      try {
        const updated = await invoke<{
          lineTotalDecimals: 0 | 2;
          invoiceTotalDecimals: 0 | 2;
        }>('set_invoice_calculation_settings', {
          lineTotalDecimals: lineDecimals,
          invoiceTotalDecimals: invoiceDecimals,
          userId,
        });
        setLineTotalDecimals(updated.lineTotalDecimals);
        setInvoiceTotalDecimals(updated.invoiceTotalDecimals);
        toast.success('Invoice calculation settings updated');
      } catch (error) {
        console.error('Failed to save invoice calculation settings:', error);
        toast.error('Failed to save invoice calculation settings');
      }
    },
    [userId]
  );

  const handleSave = () => {
    // Settings are automatically saved via context
    toast.success('Settings saved successfully');
  };

  const handleReset = () => {
    const defaultSettings = loadSettings();
    updateSettings(defaultSettings);
    toast.info('Settings reset');
  };

  const handleClearSettings = () => {
    clearSettings();
    const defaultSettings = loadSettings();
    updateSettings(defaultSettings);
    toast.success('Settings cleared and reset to defaults');
  };

  const modules = [
    { key: 'shipment', title: 'Shipment' },
    { key: 'invoice', title: 'Invoice' },
    { key: 'boe', title: 'BOE' },
    { key: 'boeSummary', title: 'BOE Summary' },
    { key: 'supplier', title: 'Supplier' },
    { key: 'itemMaster', title: 'Item Master' },
    { key: 'expenses', title: 'Expenses' },
  ];

  return (
    <div className="im-page">
      <AppBar crumbs={['Import Manager', 'Settings']} />
      <PageHeader
        title="Settings"
        subtitle="Configure application preferences and module settings"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="im-btn" onClick={handleReset}>
              Reset
            </button>
            <button
              className="im-btn im-btn--danger"
              onClick={handleClearSettings}
            >
              Clear All Settings
            </button>
            <button className="im-btn im-btn--primary" onClick={handleSave}>
              Save Settings
            </button>
          </div>
        }
      />

      <div
        className="im-settings-body"
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {/* Appearance */}
        <section aria-labelledby="appearance-heading" className="im-section">
          <div className="im-section__header">
            <span className="im-section__label" id="appearance-heading">
              // Appearance
            </span>
          </div>
          <div
            className="im-section__body"
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <div style={{ display: 'flex', gap: 12 }}>
              {/* Default theme card */}
              <button
                onClick={() => setTheme('default')}
                aria-pressed={theme === 'default'}
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: '12px 16px',
                  border:
                    theme === 'default'
                      ? '2px solid var(--primary)'
                      : '2px solid var(--border)',
                  borderRadius: 6,
                  background: 'var(--card)',
                  cursor: 'pointer',
                  minWidth: 160,
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--foreground)',
                    fontFamily: 'var(--font-im-mono)',
                    letterSpacing: '0.04em',
                  }}
                >
                  shadcn Default
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      display: 'inline-block',
                    }}
                  />
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      background: '#f1f5f9',
                      display: 'inline-block',
                    }}
                  />
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      background: '#e2e8f0',
                      display: 'inline-block',
                    }}
                  />
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      background: '#7c3aed',
                      display: 'inline-block',
                    }}
                  />
                </div>
                {theme === 'default' && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 8,
                      fontSize: 11,
                      color: 'var(--primary)',
                      fontWeight: 700,
                    }}
                  >
                    ✓
                  </span>
                )}
              </button>

              {/* Steel theme card */}
              <button
                onClick={() => setTheme('steel')}
                aria-pressed={theme === 'steel'}
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: '12px 16px',
                  border:
                    theme === 'steel'
                      ? '2px solid #2563eb'
                      : '2px solid var(--border)',
                  borderRadius: 6,
                  background: 'var(--card)',
                  cursor: 'pointer',
                  minWidth: 160,
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: theme === 'steel' ? 28 : 8,
                    fontSize: 9,
                    fontWeight: 700,
                    background: '#2563eb',
                    color: '#fff',
                    borderRadius: 3,
                    padding: '1px 5px',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}
                >
                  New
                </span>
                {theme === 'steel' && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 8,
                      fontSize: 11,
                      color: '#2563eb',
                      fontWeight: 700,
                    }}
                  >
                    ✓
                  </span>
                )}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--foreground)',
                    fontFamily: 'var(--font-im-mono)',
                    letterSpacing: '0.04em',
                  }}
                >
                  IM Steel
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      background: '#ffffff',
                      border: '1px solid #e3e8ef',
                      display: 'inline-block',
                    }}
                  />
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      background: '#fafbfc',
                      display: 'inline-block',
                    }}
                  />
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      background: '#e3e8ef',
                      display: 'inline-block',
                    }}
                  />
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      background: '#2563eb',
                      display: 'inline-block',
                    }}
                  />
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      background: '#1e40af',
                      display: 'inline-block',
                    }}
                  />
                </div>
              </button>
            </div>

            {/* Mode segmented control */}
            <div
              role="group"
              aria-label="Color mode"
              style={{ display: 'flex', gap: 4 }}
            >
              {(['light', 'dark', 'system'] as const).map(m => (
                <button
                  key={m}
                  className={`im-btn${mode === m ? 'im-btn--primary' : ''}`}
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  style={{ minWidth: 72, fontSize: 12 }}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            <button
              className="im-btn"
              style={{ alignSelf: 'flex-start', fontSize: 12 }}
              onClick={() => {
                setTheme('default');
                setMode('system');
              }}
            >
              Reset to default
            </button>
          </div>
        </section>

        {/* Module Selection */}
        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">// Module Settings</span>
          </div>
          <div className="im-section__body">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 8,
              }}
            >
              {modules.map(module => (
                <button
                  key={module.key}
                  className={`im-btn${selectedModule === module.key ? 'im-btn--primary' : ''}`}
                  onClick={() => setSelectedModule(module.key)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    height: 64,
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{module.title}</span>
                  <span
                    style={{
                      fontSize: 11,
                      color:
                        selectedModule === module.key
                          ? 'inherit'
                          : 'var(--color-im-faint)',
                    }}
                  >
                    Configure Fields
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Module Specific Settings */}
        {selectedModule && (
          <div className="im-section">
            <div className="im-section__body">
              <ModuleSettings
                moduleName={selectedModule as keyof AppSettings['modules']}
                moduleTitle={
                  modules.find(m => m.key === selectedModule)?.title || ''
                }
                onClose={() => setSelectedModule(null)}
              />
            </div>
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 16,
          }}
        >
          <SettingsSection title="Invoice Calculation Settings">
            <SettingRow
              label="Line Total Precision"
              desc="Decimal places for line item totals"
            >
              <div className="im-select-wrap" style={{ width: 160 }}>
                <select
                  className="im-select"
                  value={lineTotalDecimals.toString()}
                  onChange={e =>
                    void persistInvoiceCalculationSettings(
                      e.target.value === '0' ? 0 : 2,
                      invoiceTotalDecimals
                    )
                  }
                >
                  <option value="2">2 decimals</option>
                  <option value="0">0 decimals</option>
                </select>
              </div>
            </SettingRow>
            <SettingRow
              label="Invoice Total Precision"
              desc="Decimal places for invoice totals"
            >
              <div className="im-select-wrap" style={{ width: 160 }}>
                <select
                  className="im-select"
                  value={invoiceTotalDecimals.toString()}
                  onChange={e =>
                    void persistInvoiceCalculationSettings(
                      lineTotalDecimals,
                      e.target.value === '0' ? 0 : 2
                    )
                  }
                >
                  <option value="2">2 decimals</option>
                  <option value="0">0 decimals</option>
                </select>
              </div>
            </SettingRow>
          </SettingsSection>

          {/* Number Format Settings */}
          <SettingsSection title="Number Formatting">
            <SettingRow label="Decimal Places">
              <div className="im-select-wrap" style={{ width: 100 }}>
                <select
                  className="im-select"
                  value={settings.numberFormat.decimalPlaces.toString()}
                  onChange={e =>
                    updateNumberSettings({
                      decimalPlaces: parseInt(e.target.value),
                    })
                  }
                >
                  <option value="0">0</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </div>
            </SettingRow>
            <SettingRow label="Currency Symbol">
              <input
                className="im-input"
                style={{ width: 80 }}
                value={settings.numberFormat.currencySymbol}
                onChange={e =>
                  updateNumberSettings({ currencySymbol: e.target.value })
                }
                placeholder="₹"
              />
            </SettingRow>
            <SettingRow label="Use Thousands Separator">
              <ImToggle
                checked={settings.numberFormat.useThousandsSeparator}
                onChange={checked =>
                  updateNumberSettings({ useThousandsSeparator: checked })
                }
              />
            </SettingRow>
            <SettingRow label="Preview">
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  fontSize: 12.5,
                  fontFamily: 'var(--font-im-mono)',
                }}
              >
                <div>{formatNumber(1234567.89, settings.numberFormat)}</div>
                <div>{formatCurrency(987654.32, settings.numberFormat)}</div>
              </div>
            </SettingRow>
          </SettingsSection>

          {/* Date Format Settings */}
          <SettingsSection title="Date Formatting">
            <SettingRow label="Date Format">
              <div className="im-select-wrap" style={{ width: 160 }}>
                <select
                  className="im-select"
                  value={settings.dateFormat.format}
                  onChange={e =>
                    updateDateSettings({
                      format: e.target
                        .value as AppSettings['dateFormat']['format'],
                    })
                  }
                >
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                </select>
              </div>
            </SettingRow>
            <SettingRow label="Include Time">
              <ImToggle
                checked={settings.dateFormat.includeTime}
                onChange={checked =>
                  updateDateSettings({ includeTime: checked })
                }
              />
            </SettingRow>
            <SettingRow label="Preview">
              <span
                style={{
                  fontSize: 12.5,
                  fontFamily: 'var(--font-im-mono)',
                  color: 'var(--color-im-muted)',
                }}
              >
                {formatDate(new Date(), settings.dateFormat)}
              </span>
            </SettingRow>
          </SettingsSection>

          {/* Text Format Settings */}
          <SettingsSection title="Text Formatting">
            <SettingRow label="Text Case">
              <div className="im-select-wrap" style={{ width: 160 }}>
                <select
                  className="im-select"
                  value={settings.textFormat.case}
                  onChange={e =>
                    updateTextSettings({
                      case: e.target.value as AppSettings['textFormat']['case'],
                    })
                  }
                >
                  <option value="sentencecase">Sentence case</option>
                  <option value="lowercase">lowercase</option>
                  <option value="uppercase">UPPERCASE</option>
                  <option value="titlecase">Title Case</option>
                </select>
              </div>
            </SettingRow>
            <SettingRow label="Trim Whitespace">
              <ImToggle
                checked={settings.textFormat.trimWhitespace}
                onChange={checked =>
                  updateTextSettings({ trimWhitespace: checked })
                }
              />
            </SettingRow>
            <SettingRow label="Preview">
              <span
                style={{
                  fontSize: 12.5,
                  fontFamily: 'var(--font-im-mono)',
                  color: 'var(--color-im-muted)',
                }}
              >
                {formatText('hello world example text', settings.textFormat)}
              </span>
            </SettingRow>
          </SettingsSection>
        </div>

        {/* Google Drive OAuth Credentials */}
        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">// Google Drive OAuth</span>
          </div>
          <div
            className="im-section__body"
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            {/* Status badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {oauthInfo?.configured ? (
                oauthInfo.runtimeOverride ? (
                  <span className="im-pill im-pill--green">
                    Runtime credentials active
                  </span>
                ) : (
                  <span className="im-pill im-pill--blue">
                    Build-time credentials active
                  </span>
                )
              ) : (
                <span className="im-pill im-pill--red">Not configured</span>
              )}
              {oauthInfo?.runtimeOverride && (
                <button
                  className="im-btn im-btn--danger"
                  style={{ fontSize: 11, padding: '2px 10px' }}
                  onClick={() => void handleClearOauth()}
                >
                  Clear
                </button>
              )}
            </div>

            <p
              style={{
                fontSize: 12,
                color: 'var(--color-im-muted)',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Create a <strong>Desktop</strong> OAuth 2.0 client in Google Cloud
              Console and paste the credentials below. Add{' '}
              <code
                style={{
                  fontFamily: 'var(--font-im-mono)',
                  fontSize: 11,
                  background: 'var(--muted)',
                  padding: '1px 4px',
                  borderRadius: 3,
                }}
              >
                http://127.0.0.1:8765/
              </code>{' '}
              as a redirect URI.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label
                style={{
                  fontSize: 12,
                  fontFamily: 'var(--font-im-mono)',
                  color: 'var(--color-im-label)',
                }}
              >
                CLIENT ID
              </label>
              <input
                className="im-input"
                placeholder="xxxxxxxxxx.apps.googleusercontent.com"
                value={oauthClientId}
                onChange={e => setOauthClientId(e.target.value)}
                style={{ fontFamily: 'var(--font-im-mono)', fontSize: 12 }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label
                style={{
                  fontSize: 12,
                  fontFamily: 'var(--font-im-mono)',
                  color: 'var(--color-im-label)',
                }}
              >
                CLIENT SECRET{' '}
                {oauthInfo?.hasRuntimeSecret && (
                  <span
                    style={{ color: 'var(--color-im-muted)', fontWeight: 400 }}
                  >
                    (stored — enter new value to replace)
                  </span>
                )}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  className="im-input"
                  type={showSecret ? 'text' : 'password'}
                  placeholder={
                    oauthInfo?.hasRuntimeSecret
                      ? '••••••••••••••••'
                      : 'GOCSPX-...'
                  }
                  value={oauthClientSecret}
                  onChange={e => setOauthClientSecret(e.target.value)}
                  style={{
                    fontFamily: 'var(--font-im-mono)',
                    fontSize: 12,
                    paddingRight: 72,
                    width: '100%',
                  }}
                />
                <button
                  type="button"
                  className="im-btn"
                  onClick={() => setShowSecret(v => !v)}
                  style={{
                    position: 'absolute',
                    right: 4,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: 11,
                    padding: '2px 8px',
                  }}
                >
                  {showSecret ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                className="im-btn im-btn--primary"
                onClick={() => void handleSaveOauth()}
                disabled={oauthSaving || !oauthClientId.trim()}
              >
                {oauthSaving ? 'Saving…' : 'Save Credentials'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
