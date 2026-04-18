/**
 * Color validation and contrast checking utilities
 */

/**
 * Validates if a string is a valid hex color
 * Supports both 3 and 6 character hex formats (#abc, #aabbcc)
 */
export function isValidHexColor(color: string): boolean {
  const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  return hexPattern.test(color);
}

/**
 * Validates if a string is a valid RGB color
 * Supports format: rgb(255, 255, 255) or rgba(255, 255, 255, 0.5)
 */
export function isValidRgbColor(color: string): boolean {
  const rgbPattern =
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+)?\s*\)$/;
  if (!rgbPattern.test(color)) return false;

  const matches = color.match(rgbPattern);
  if (!matches) return false;

  const [, r, g, b] = matches.map(Number);
  return r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255;
}

/**
 * Validates if a string is a valid HSL color
 * Supports format: hsl(360, 100%, 50%) or hsla(360, 100%, 50%, 0.5)
 */
export function isValidHslColor(color: string): boolean {
  const hslPattern =
    /^hsla?\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*(?:,\s*[\d.]+)?\s*\)$/;
  if (!hslPattern.test(color)) return false;

  const matches = color.match(hslPattern);
  if (!matches) return false;

  const [, h, s, l] = matches.map(Number);
  return h >= 0 && h <= 360 && s >= 0 && s <= 100 && l >= 0 && l <= 100;
}

/**
 * Validates if a string is a valid color in any supported format
 */
export function isValidColor(color: string): boolean {
  return (
    isValidHexColor(color) || isValidRgbColor(color) || isValidHslColor(color)
  );
}

/**
 * Normalizes a hex color to 6-character format
 * Converts #abc to #aabbcc
 */
export function normalizeHexColor(hex: string): string {
  if (!isValidHexColor(hex)) return hex;

  if (hex.length === 4) {
    // Convert #abc to #aabbcc
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toLowerCase();
  }

  return hex.toLowerCase();
}

/**
 * Converts a hex color to RGB values
 */
export function hexToRgb(
  hex: string
): { r: number; g: number; b: number } | null {
  const normalized = normalizeHexColor(hex);
  if (!isValidHexColor(normalized)) return null;

  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);

  return { r, g, b };
}

/**
 * Converts RGB values to hex color
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.round(Math.max(0, Math.min(255, n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Converts RGB values to HSL
 */
export function rgbToHsl(
  r: number,
  g: number,
  b: number
): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Calculates the relative luminance of a color
 * Used for contrast ratio calculations
 */
export function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculates the contrast ratio between two colors
 * Returns a value between 1 and 21
 */
export function getContrastRatio(
  color1: { r: number; g: number; b: number },
  color2: { r: number; g: number; b: number }
): number {
  const lum1 = getLuminance(color1.r, color1.g, color1.b);
  const lum2 = getLuminance(color2.r, color2.g, color2.b);

  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);

  return (brightest + 0.05) / (darkest + 0.05);
}

/**
 * Checks if a color meets WCAG AA contrast requirements
 * Returns true if contrast ratio is >= 4.5 (for normal text)
 */
export function meetsWcagAA(
  color1: { r: number; g: number; b: number },
  color2: { r: number; g: number; b: number }
): boolean {
  const ratio = getContrastRatio(color1, color2);
  return ratio >= 4.5;
}

/**
 * Checks if a color meets WCAG AAA contrast requirements
 * Returns true if contrast ratio is >= 7 (for normal text)
 */
export function meetsWcagAAA(
  color1: { r: number; g: number; b: number },
  color2: { r: number; g: number; b: number }
): boolean {
  const ratio = getContrastRatio(color1, color2);
  return ratio >= 7;
}

/**
 * Gets contrast level description
 */
export function getContrastLevel(ratio: number): 'AAA' | 'AA' | 'Fail' {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  return 'Fail';
}

/**
 * Suggests a contrasting color for better readability
 * Returns a lighter or darker version of the input color
 */
export function suggestContrastingColor(
  color: { r: number; g: number; b: number },
  background: { r: number; g: number; b: number },
  targetRatio: number = 4.5
): { r: number; g: number; b: number } {
  const hsl = rgbToHsl(color.r, color.g, color.b);
  const bgLuminance = getLuminance(background.r, background.g, background.b);

  // Determine if we need to lighten or darken
  const shouldLighten = bgLuminance < 0.5;

  // Adjust lightness to achieve target contrast
  let newL = shouldLighten ? 90 : 10; // Start with extreme values

  // Binary search to find optimal lightness
  let low = shouldLighten ? 50 : 0;
  let high = shouldLighten ? 100 : 50;

  for (let i = 0; i < 10; i++) {
    const testHsl = { ...hsl, l: newL };
    const testRgb = hslToRgb(testHsl.h, testHsl.s, newL);
    const ratio = getContrastRatio(testRgb, background);

    if (Math.abs(ratio - targetRatio) < 0.1) break;

    if (ratio < targetRatio) {
      if (shouldLighten) {
        low = newL;
        newL = (newL + high) / 2;
      } else {
        high = newL;
        newL = (low + newL) / 2;
      }
    } else {
      if (shouldLighten) {
        high = newL;
        newL = (low + newL) / 2;
      } else {
        low = newL;
        newL = (newL + high) / 2;
      }
    }
  }

  return hslToRgb(hsl.h, hsl.s, Math.round(newL));
}

/**
 * Converts HSL values to RGB
 */
function hslToRgb(
  h: number,
  s: number,
  l: number
): { r: number; g: number; b: number } {
  h /= 360;
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (0 <= h && h < 1 / 6) {
    r = c;
    g = x;
    b = 0;
  } else if (1 / 6 <= h && h < 2 / 6) {
    r = x;
    g = c;
    b = 0;
  } else if (2 / 6 <= h && h < 3 / 6) {
    r = 0;
    g = c;
    b = x;
  } else if (3 / 6 <= h && h < 4 / 6) {
    r = 0;
    g = x;
    b = c;
  } else if (4 / 6 <= h && h < 5 / 6) {
    r = x;
    g = 0;
    b = c;
  } else if (5 / 6 <= h && h < 1) {
    r = c;
    g = 0;
    b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/**
 * Formats a color for display in the UI
 */
export function formatColorForDisplay(color: string): string {
  if (isValidHexColor(color)) {
    return normalizeHexColor(color).toUpperCase();
  }
  return color;
}

/**
 * Gets the default background color for contrast checking
 * Returns white for light mode, dark gray for dark mode
 */
export function getDefaultBackgroundColor(isDark: boolean): {
  r: number;
  g: number;
  b: number;
} {
  return isDark ? { r: 23, g: 23, b: 23 } : { r: 255, g: 255, b: 255 };
}
