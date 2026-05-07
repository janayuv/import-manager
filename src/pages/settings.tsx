// src/pages/settings.tsx
'use client';

import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { toast } from 'sonner';

import * as React from 'react';

import { ModuleSettings } from '@/components/module-settings';
import { ModuleSettingsDemo } from '@/components/module-settings-demo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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
    <div className="container mx-auto space-y-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-blue-600">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure application preferences and module settings
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" useAccentColor onClick={handleReset}>
            Reset
          </Button>
          <Button variant="destructive" onClick={handleClearSettings}>
            Clear All Settings
          </Button>
          <Button onClick={handleSave} variant="default" useAccentColor>
            Save Settings
          </Button>
        </div>
      </div>

      {/* Module Settings Demo */}
      <ModuleSettingsDemo />

      {/* Module Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Module Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {modules.map(module => (
              <Button
                key={module.key}
                variant={selectedModule === module.key ? 'default' : 'outline'}
                useAccentColor
                onClick={() => setSelectedModule(module.key)}
                className="flex h-20 flex-col items-center justify-center"
              >
                <span className="font-medium">{module.title}</span>
                <span className="text-muted-foreground text-xs">
                  Configure Fields
                </span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Module Specific Settings */}
      {selectedModule && (
        <Card>
          <CardContent className="pt-6">
            <ModuleSettings
              moduleName={selectedModule as keyof AppSettings['modules']}
              moduleTitle={
                modules.find(m => m.key === selectedModule)?.title || ''
              }
              onClose={() => setSelectedModule(null)}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Invoice Calculation Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>Line Total Precision</Label>
                <Select
                  value={lineTotalDecimals.toString()}
                  onValueChange={value =>
                    void persistInvoiceCalculationSettings(
                      value === '0' ? 0 : 2,
                      invoiceTotalDecimals
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 decimals</SelectItem>
                    <SelectItem value="0">0 decimals</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Invoice Total Precision</Label>
                <Select
                  value={invoiceTotalDecimals.toString()}
                  onValueChange={value =>
                    void persistInvoiceCalculationSettings(
                      lineTotalDecimals,
                      value === '0' ? 0 : 2
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 decimals</SelectItem>
                    <SelectItem value="0">0 decimals</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Number Format Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Number Formatting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Decimal Places</Label>
                <Select
                  value={settings.numberFormat.decimalPlaces.toString()}
                  onValueChange={value =>
                    updateNumberSettings({ decimalPlaces: parseInt(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0</SelectItem>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Currency Symbol</Label>
                <Input
                  value={settings.numberFormat.currencySymbol}
                  onChange={e =>
                    updateNumberSettings({ currencySymbol: e.target.value })
                  }
                  placeholder="₹"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                checked={settings.numberFormat.useThousandsSeparator}
                onCheckedChange={checked =>
                  updateNumberSettings({ useThousandsSeparator: checked })
                }
              />
              <Label>Use Thousands Separator</Label>
            </div>

            {/* Preview */}
            <div className="bg-muted rounded-lg p-4">
              <h4 className="mb-2 font-medium">Preview:</h4>
              <div className="space-y-1 text-sm">
                <div>
                  Number: {formatNumber(1234567.89, settings.numberFormat)}
                </div>
                <div>
                  Currency: {formatCurrency(987654.32, settings.numberFormat)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Date Format Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Date Formatting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Date Format</Label>
              <Select
                value={settings.dateFormat.format}
                onValueChange={value =>
                  updateDateSettings({
                    format: value as AppSettings['dateFormat']['format'],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  <SelectItem value="DD-MM-YYYY">DD-MM-YYYY</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                checked={settings.dateFormat.includeTime}
                onCheckedChange={checked =>
                  updateDateSettings({ includeTime: checked })
                }
              />
              <Label>Include Time</Label>
            </div>

            {/* Preview */}
            <div className="bg-muted rounded-lg p-4">
              <h4 className="mb-2 font-medium">Preview:</h4>
              <div className="text-sm">
                {formatDate(new Date(), settings.dateFormat)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Text Format Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Text Formatting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Text Case</Label>
              <Select
                value={settings.textFormat.case}
                onValueChange={value =>
                  updateTextSettings({
                    case: value as AppSettings['textFormat']['case'],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sentencecase">Sentence case</SelectItem>
                  <SelectItem value="lowercase">lowercase</SelectItem>
                  <SelectItem value="uppercase">UPPERCASE</SelectItem>
                  <SelectItem value="titlecase">Title Case</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                checked={settings.textFormat.trimWhitespace}
                onCheckedChange={checked =>
                  updateTextSettings({ trimWhitespace: checked })
                }
              />
              <Label>Trim Whitespace</Label>
            </div>

            {/* Preview */}
            <div className="bg-muted rounded-lg p-4">
              <h4 className="mb-2 font-medium">Preview:</h4>
              <div className="text-sm">
                {formatText('hello world example text', settings.textFormat)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
