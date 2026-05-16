// src/pages/settings.tsx
'use client';

import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { toast } from 'sonner';

import * as React from 'react';

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
      </div>
    </div>
  );
}
