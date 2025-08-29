'use client';

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';

import * as React from 'react';

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
  type ModuleFieldSettings,
  type ModuleSettings,
} from '@/lib/settings';
import { useSettings } from '@/lib/use-settings';

interface ModuleSettingsProps {
  moduleName: keyof AppSettings['modules'];
  moduleTitle: string;
  onClose?: () => void;
}

interface SortableFieldItemProps {
  fieldName: string;
  config: ModuleFieldSettings;
  onToggle: (fieldName: string, visible: boolean) => void;
  onWidthChange: (fieldName: string, width: string) => void;
}

function SortableFieldItem({
  fieldName,
  config,
  onToggle,
  onWidthChange,
}: SortableFieldItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: fieldName,
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-background flex items-center gap-4 rounded-lg border p-3"
    >
      <div
        {...attributes}
        {...listeners}
        className="text-muted-foreground cursor-move"
      >
        ⋮⋮
      </div>

      <div className="flex-1">
        <Label className="font-medium capitalize">
          {fieldName.replace(/([A-Z])/g, ' $1').trim()}
        </Label>
      </div>

      <div className="flex items-center gap-4">
        <div className="w-24">
          <Input
            value={config.width || ''}
            onChange={e => onWidthChange(fieldName, e.target.value)}
            placeholder="Width"
            className="text-sm"
          />
        </div>

        <Switch
          checked={config.visible}
          onCheckedChange={checked => onToggle(fieldName, checked)}
        />
      </div>
    </div>
  );
}

export function ModuleSettings({
  moduleName,
  moduleTitle,
  onClose,
}: ModuleSettingsProps) {
  const {
    settings: globalSettings,
    updateModuleSettings: updateGlobalModuleSettings,
    updateModuleField: updateGlobalModuleField,
  } = useSettings();

  const [settings, setSettings] = React.useState<ModuleSettings | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  React.useEffect(() => {
    if (globalSettings?.modules?.[moduleName]) {
      setSettings(globalSettings.modules[moduleName]);
    }
  }, [globalSettings, moduleName]);

  // Check if settings are loaded
  if (
    !globalSettings ||
    !globalSettings.modules ||
    !globalSettings.modules[moduleName] ||
    !settings
  ) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-lg font-medium">Loading settings...</div>
          <div className="text-muted-foreground text-sm">
            Please wait while settings are being loaded.
          </div>
        </div>
      </div>
    );
  }

  console.log('🔧 ModuleSettings - Module name:', moduleName);
  console.log('🔧 ModuleSettings - Global settings:', globalSettings);
  console.log('🔧 ModuleSettings - Module settings:', settings);
  console.log('🔧 ModuleSettings - Module fields:', settings?.fields);

  const handleFieldToggle = (fieldName: string, visible: boolean) => {
    console.log(
      '🔧 ModuleSettings - Toggling field:',
      fieldName,
      'to:',
      visible
    );
    updateGlobalModuleField(moduleName, fieldName, { visible });
    toast.success(`${fieldName} ${visible ? 'shown' : 'hidden'}`);
  };

  const handleFieldWidthChange = (fieldName: string, width: string) => {
    console.log(
      '🔧 ModuleSettings - Changing field width:',
      fieldName,
      'to:',
      width
    );
    updateGlobalModuleField(moduleName, fieldName, { width });
  };

  const handleModuleSettingChange = (
    key: keyof ModuleSettings,
    value: unknown
  ) => {
    console.log(
      '🔧 ModuleSettings - Changing module setting:',
      key,
      'to:',
      value
    );
    updateGlobalModuleSettings(moduleName, { [key]: value });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const fields = Object.entries(settings.fields);
      const oldIndex = fields.findIndex(
        ([fieldName]) => fieldName === active.id.toString()
      );
      const newIndex = fields.findIndex(
        ([fieldName]) => fieldName === over.id.toString()
      );

      const reorderedFields = arrayMove(fields, oldIndex, newIndex);

      // Update order for all fields
      const updatedFields = Object.fromEntries(
        reorderedFields.map(([fieldName, config], index) => [
          fieldName,
          { ...config, order: index + 1 },
        ])
      );

      console.log('🔧 ModuleSettings - Reordering fields:', updatedFields);
      updateGlobalModuleSettings(moduleName, { fields: updatedFields });
      toast.success('Field order updated');
    }
  };

  const sortedFields = Object.entries(settings.fields).sort(
    (a, b) => a[1].order - b[1].order
  );
  const fieldIds = sortedFields.map(([fieldName]) => fieldName);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{moduleTitle} Settings</h2>
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      {/* Module General Settings */}
      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Items per Page</Label>
              <Select
                value={settings.itemsPerPage.toString()}
                onValueChange={value =>
                  handleModuleSettingChange('itemsPerPage', parseInt(value))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={settings.showTotals}
                onCheckedChange={checked =>
                  handleModuleSettingChange('showTotals', checked)
                }
              />
              <Label>Show Totals Row</Label>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              checked={settings.showActions}
              onCheckedChange={checked =>
                handleModuleSettingChange('showActions', checked)
              }
            />
            <Label>Show Actions Column</Label>
          </div>
        </CardContent>
      </Card>

      {/* Field Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Field Configuration</CardTitle>
          <p className="text-muted-foreground text-sm">
            Drag and drop to reorder fields, or toggle visibility
          </p>
        </CardHeader>
        <CardContent>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={fieldIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {sortedFields.map(([fieldName, config]) => (
                  <SortableFieldItem
                    key={fieldName}
                    fieldName={fieldName}
                    config={config}
                    onToggle={handleFieldToggle}
                    onWidthChange={handleFieldWidthChange}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border">
              <thead>
                <tr className="bg-muted">
                  {sortedFields
                    .filter(([, config]) => config.visible)
                    .map(([fieldName, config]) => (
                      <th
                        key={fieldName}
                        className="border p-2 text-left"
                        style={{ width: config.width }}
                      >
                        {fieldName.replace(/([A-Z])/g, ' $1').trim()}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {sortedFields
                    .filter(([, config]) => config.visible)
                    .map(([fieldName]) => (
                      <td key={fieldName} className="border p-2">
                        Sample {fieldName}
                      </td>
                    ))}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
