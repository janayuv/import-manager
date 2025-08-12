// src/pages/settings.tsx
'use client'

import { toast } from 'sonner'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  loadSettings,
  saveSettings,
  clearSettings,
  type AppSettings,
  formatNumber,
  formatCurrency,
  formatDate,
  formatText,
} from '@/lib/settings'
import { ModuleSettings } from '@/components/module-settings'
import { ModuleSettingsDemo } from '@/components/module-settings-demo'

export default function SettingsPage() {
  const [settings, setSettings] = React.useState<AppSettings>(loadSettings())
  const [selectedModule, setSelectedModule] = React.useState<string | null>(null)

  const updateNumberSettings = (updates: Partial<AppSettings['numberFormat']>) => {
    setSettings(prev => ({
      ...prev,
      numberFormat: { ...prev.numberFormat, ...updates }
    }))
  }

  const updateDateSettings = (updates: Partial<AppSettings['dateFormat']>) => {
    setSettings(prev => ({
      ...prev,
      dateFormat: { ...prev.dateFormat, ...updates }
    }))
  }

  const updateTextSettings = (updates: Partial<AppSettings['textFormat']>) => {
    setSettings(prev => ({
      ...prev,
      textFormat: { ...prev.textFormat, ...updates }
    }))
  }

  const handleSave = () => {
    saveSettings(settings)
    toast.success('Settings saved successfully')
  }

  const handleReset = () => {
    setSettings(loadSettings())
    toast.info('Settings reset')
  }

  const handleClearSettings = () => {
    clearSettings()
    setSettings(loadSettings())
    toast.success('Settings cleared and reset to defaults')
  }

  const modules = [
    { key: 'shipment', title: 'Shipment' },
    { key: 'invoice', title: 'Invoice' },
    { key: 'boe', title: 'BOE' },
    { key: 'boeSummary', title: 'BOE Summary' },
    { key: 'supplier', title: 'Supplier' },
    { key: 'itemMaster', title: 'Item Master' },
    { key: 'expenses', title: 'Expenses' },
  ]

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Settings</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>Reset</Button>
          <Button variant="destructive" onClick={handleClearSettings}>Clear All Settings</Button>
          <Button onClick={handleSave}>Save Settings</Button>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {modules.map((module) => (
              <Button
                key={module.key}
                variant={selectedModule === module.key ? "default" : "outline"}
                onClick={() => setSelectedModule(module.key)}
                className="h-20 flex flex-col items-center justify-center"
              >
                <span className="font-medium">{module.title}</span>
                <span className="text-xs text-muted-foreground">Configure Fields</span>
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
              moduleTitle={modules.find(m => m.key === selectedModule)?.title || ''}
              onClose={() => setSelectedModule(null)}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  onValueChange={(value) => updateNumberSettings({ decimalPlaces: parseInt(value) })}
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
                  onChange={(e) => updateNumberSettings({ currencySymbol: e.target.value })}
                  placeholder="₹"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                checked={settings.numberFormat.useThousandsSeparator}
                onCheckedChange={(checked) => updateNumberSettings({ useThousandsSeparator: checked })}
              />
              <Label>Use Thousands Separator</Label>
            </div>

            {/* Preview */}
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Preview:</h4>
              <div className="space-y-1 text-sm">
                <div>Number: {formatNumber(1234567.89, settings.numberFormat)}</div>
                <div>Currency: {formatCurrency(987654.32, settings.numberFormat)}</div>
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
                                 onValueChange={(value) => updateDateSettings({ format: value as AppSettings['dateFormat']['format'] })}
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
                onCheckedChange={(checked) => updateDateSettings({ includeTime: checked })}
              />
              <Label>Include Time</Label>
            </div>

            {/* Preview */}
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Preview:</h4>
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
                                 onValueChange={(value) => updateTextSettings({ case: value as AppSettings['textFormat']['case'] })}
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
                onCheckedChange={(checked) => updateTextSettings({ trimWhitespace: checked })}
              />
              <Label>Trim Whitespace</Label>
            </div>

            {/* Preview */}
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Preview:</h4>
              <div className="text-sm">
                {formatText('hello world example text', settings.textFormat)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
