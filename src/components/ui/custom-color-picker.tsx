import { useState, useEffect } from 'react';
import { Check, AlertTriangle, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTheme } from '@/components/layout/theme-context';
import {
  isValidHexColor,
  normalizeHexColor,
  formatColorForDisplay,
  getContrastRatio,
  getContrastLevel,
  getDefaultBackgroundColor,
  hexToRgb,
  suggestContrastingColor,
  rgbToHex,
} from '@/lib/color-utils';

interface CustomColorPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialColor?: string;
}

export function CustomColorPicker({
  open,
  onOpenChange,
  initialColor,
}: CustomColorPickerProps) {
  const { theme, setCustomAccentColor } = useTheme();
  const [colorInput, setColorInput] = useState('');
  const [nativeColorInput, setNativeColorInput] = useState('#000000');
  const [error, setError] = useState<string | null>(null);
  const [contrastWarning, setContrastWarning] = useState<string | null>(null);
  const [suggestedColor, setSuggestedColor] = useState<string | null>(null);

  // Initialize with current custom color or default
  useEffect(() => {
    if (open) {
      const currentColor = initialColor || theme.customAccentColor || '#3b82f6';
      const normalized = normalizeHexColor(currentColor);
      setColorInput(normalized);
      setNativeColorInput(normalized);
      validateColor(normalized);
    }
  }, [open, initialColor, theme.customAccentColor]); // eslint-disable-line react-hooks/exhaustive-deps

  const validateColor = (color: string) => {
    setError(null);
    setContrastWarning(null);
    setSuggestedColor(null);

    if (!isValidHexColor(color)) {
      setError('Please enter a valid hex color (e.g., #abc or #aabbcc)');
      return false;
    }

    const normalized = normalizeHexColor(color);
    const rgb = hexToRgb(normalized);
    if (!rgb) return false;

    // Check contrast with default background
    const isDark =
      theme.mode === 'dark' ||
      (theme.mode === 'system' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    const backgroundColor = getDefaultBackgroundColor(isDark);
    const contrastRatio = getContrastRatio(rgb, backgroundColor);
    const contrastLevel = getContrastLevel(contrastRatio);

    if (contrastLevel === 'Fail') {
      const suggested = suggestContrastingColor(rgb, backgroundColor);
      setSuggestedColor(rgbToHex(suggested.r, suggested.g, suggested.b));
      setContrastWarning(
        `Low contrast ratio (${contrastRatio.toFixed(1)}:1). Text may be hard to read.`
      );
    }

    return true;
  };

  const handleColorInputChange = (value: string) => {
    // Auto-add # if user types without it
    let processedValue = value;
    if (value && !value.startsWith('#')) {
      processedValue = '#' + value;
    }

    setColorInput(processedValue);
    setNativeColorInput(processedValue);
    validateColor(processedValue);
  };

  const handleNativeColorChange = (value: string) => {
    setNativeColorInput(value);
    setColorInput(value);
    validateColor(value);
  };

  const handleSave = () => {
    if (!error && isValidHexColor(colorInput)) {
      const normalized = normalizeHexColor(colorInput);
      setCustomAccentColor(normalized);
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const handleReset = () => {
    setCustomAccentColor(null);
    onOpenChange(false);
  };

  const handleUseSuggested = () => {
    if (suggestedColor) {
      setColorInput(suggestedColor);
      setNativeColorInput(suggestedColor);
      validateColor(suggestedColor);
    }
  };

  const isValid = !error && isValidHexColor(colorInput);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Custom Accent Color</DialogTitle>
          <DialogDescription>
            Choose a custom color for your accent elements. The color will be
            applied across all accent-colored components in the application.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Color Preview */}
          <div className="flex items-center justify-center">
            <div
              className="border-border h-24 w-24 rounded-lg border-2 shadow-lg"
              style={{
                backgroundColor: isValid
                  ? normalizeHexColor(colorInput)
                  : '#e5e7eb',
              }}
              aria-label={`Color preview: ${isValid ? formatColorForDisplay(colorInput) : 'invalid color'}`}
            />
          </div>

          {/* Native Color Picker */}
          <div className="space-y-2">
            <Label htmlFor="native-color-picker">Color Picker</Label>
            <div className="flex items-center gap-2">
              <input
                id="native-color-picker"
                type="color"
                value={nativeColorInput}
                onChange={e => handleNativeColorChange(e.target.value)}
                className="border-input bg-background h-10 w-20 rounded border"
                aria-label="Choose color visually"
              />
              <span className="text-muted-foreground text-sm">
                {isValid ? formatColorForDisplay(colorInput) : 'Invalid color'}
              </span>
            </div>
          </div>

          {/* Hex Input */}
          <div className="space-y-2">
            <Label htmlFor="hex-input">Hex Color</Label>
            <Input
              id="hex-input"
              type="text"
              value={colorInput}
              onChange={e => handleColorInputChange(e.target.value)}
              placeholder="#3b82f6"
              className={error ? 'border-destructive' : ''}
              aria-describedby={error ? 'color-error' : undefined}
            />
            {error && (
              <p id="color-error" className="text-destructive text-sm">
                {error}
              </p>
            )}
          </div>

          {/* Contrast Warning */}
          {contrastWarning && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p>{contrastWarning}</p>
                  {suggestedColor && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleUseSuggested}
                        className="h-8"
                      >
                        Use Suggested Color
                      </Button>
                      <div
                        className="h-6 w-6 rounded border"
                        style={{ backgroundColor: suggestedColor }}
                        aria-label={`Suggested color: ${suggestedColor}`}
                      />
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset to Default
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!isValid}>
              <Check className="mr-2 h-4 w-4" />
              Save Color
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
