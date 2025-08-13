'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getVisibleFields, getFieldConfig, getModuleSettings, type AppSettings } from '@/lib/settings'

export function ModuleSettingsDemo() {
  const [selectedModule, setSelectedModule] = React.useState<keyof AppSettings['modules']>('boeSummary')

  const modules: Array<{ key: keyof AppSettings['modules']; title: string }> = [
    { key: 'shipment', title: 'Shipment' },
    { key: 'invoice', title: 'Invoice' },
    { key: 'boe', title: 'BOE' },
    { key: 'boeSummary', title: 'BOE Summary' },
    { key: 'supplier', title: 'Supplier' },
    { key: 'itemMaster', title: 'Item Master' },
    { key: 'expenses', title: 'Expenses' },
  ]

  // Safety check - try to get settings, but handle errors gracefully
  let visibleFields: string[] = []
  let moduleSettings: any = { fields: {}, itemsPerPage: 10, showTotals: false, showActions: true }
  
  try {
    visibleFields = getVisibleFields(selectedModule)
    moduleSettings = getModuleSettings(selectedModule)
  } catch (error) {
    console.warn('ModuleSettingsDemo: Error loading settings:', error)
    // Use default values if settings are not available
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Module Settings Demo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {modules.map((module) => (
              <button
                key={module.key}
                onClick={() => setSelectedModule(module.key)}
                className={`p-4 border rounded-lg text-left transition-colors ${
                  selectedModule === module.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-muted'
                }`}
              >
                <div className="font-medium">{module.title}</div>
                <div className="text-sm opacity-80">Click to view settings</div>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Visible Fields</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {visibleFields.map((fieldName, index) => {
                    const config = getFieldConfig(selectedModule, fieldName)
                    return (
                      <div
                        key={fieldName}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <span className="font-medium">
                          {index + 1}. {fieldName.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {config?.width || 'auto'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Module Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Items per Page:</span>
                    <span className="font-medium">{moduleSettings.itemsPerPage}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Show Totals:</span>
                    <span className="font-medium">{moduleSettings.showTotals ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Show Actions:</span>
                    <span className="font-medium">{moduleSettings.showActions ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Fields:</span>
                    <span className="font-medium">
                      {Object.keys(moduleSettings.fields).length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">Usage Example:</h4>
            <pre className="text-sm overflow-x-auto">
              {`// Get visible fields for a module
const visibleFields = getVisibleFields('boeSummary')

// Get field configuration
const fieldConfig = getFieldConfig('boeSummary', 'partNo')

// Get all module settings
const moduleSettings = getModuleSettings('boeSummary')

// Use in your component
{visibleFields.map(fieldName => (
  <th key={fieldName} style={{ width: getFieldConfig('boeSummary', fieldName)?.width }}>
    {fieldName}
  </th>
))}`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
