import { memo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { HardDeletePinSettings } from '@/components/database/types';

export interface DatabaseSettingsTabProps {
  pinSettings: HardDeletePinSettings | null;
  pinLockActive: boolean;
  pinLockRemainingSeconds: number | null;
  pinThresholdInput: number;
  onPinThresholdInputChange: (value: number) => void;
  onPinThresholdBlur: () => void;
  onToggleHardDeletePinEnabled: (checked: boolean) => void | Promise<void>;
  onOpenSetPin: () => void;
  onOpenChangePin: () => void;
}

export const DatabaseSettingsTab = memo(function DatabaseSettingsTab({
  pinSettings,
  pinLockActive,
  pinLockRemainingSeconds,
  pinThresholdInput,
  onPinThresholdInputChange,
  onPinThresholdBlur,
  onToggleHardDeletePinEnabled,
  onOpenSetPin,
  onOpenChangePin,
}: DatabaseSettingsTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Database Settings</CardTitle>
        <CardDescription>
          Configure backup schedules and security settings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hard Delete Protection</CardTitle>
            <CardDescription>
              Protect hard delete operations with a numeric PIN.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Enable Hard Delete PIN</p>
                <p className="text-muted-foreground text-xs">
                  Require PIN when affected records exceed threshold.
                </p>
              </div>
              <Switch
                checked={!!pinSettings?.enabled}
                onCheckedChange={checked =>
                  void onToggleHardDeletePinEnabled(checked)
                }
                disabled={!pinSettings?.hasPin}
              />
            </div>
            {!pinSettings?.hasPin && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  PIN is not set. Set a PIN to enable protection.
                </AlertDescription>
              </Alert>
            )}
            {pinLockActive && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Too many incorrect attempts. Try again in{' '}
                  {pinLockRemainingSeconds ?? 0} seconds.
                </AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pin-threshold">
                  Require PIN when deleting more than:
                </Label>
                <Input
                  id="pin-threshold"
                  type="number"
                  min={1}
                  value={pinThresholdInput}
                  onChange={e =>
                    onPinThresholdInputChange(Number(e.target.value))
                  }
                  onBlur={() => void onPinThresholdBlur()}
                />
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={onOpenSetPin}>Set PIN</Button>
                <Button
                  variant="outline"
                  onClick={onOpenChangePin}
                  disabled={!pinSettings?.hasPin}
                >
                  Change PIN
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
});
