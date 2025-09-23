import { describe, it, expect } from 'vitest';
import {
  isValidHexColor,
  isValidRgbColor,
  isValidHslColor,
  isValidColor,
  normalizeHexColor,
  hexToRgb,
  rgbToHex,
  getLuminance,
  getContrastRatio,
  meetsWcagAA,
  meetsWcagAAA,
  getContrastLevel,
  formatColorForDisplay,
  getDefaultBackgroundColor,
} from '@/lib/color-utils';

describe('Color Validation', () => {
  describe('isValidHexColor', () => {
    it('should validate 6-character hex colors', () => {
      expect(isValidHexColor('#ffffff')).toBe(true);
      expect(isValidHexColor('#000000')).toBe(true);
      expect(isValidHexColor('#3b82f6')).toBe(true);
      expect(isValidHexColor('#FF5733')).toBe(true);
    });

    it('should validate 3-character hex colors', () => {
      expect(isValidHexColor('#fff')).toBe(true);
      expect(isValidHexColor('#000')).toBe(true);
      expect(isValidHexColor('#abc')).toBe(true);
    });

    it('should reject invalid hex colors', () => {
      expect(isValidHexColor('ffffff')).toBe(false);
      expect(isValidHexColor('#gggggg')).toBe(false);
      expect(isValidHexColor('#12345')).toBe(false);
      expect(isValidHexColor('#1234567')).toBe(false);
      expect(isValidHexColor('')).toBe(false);
    });
  });

  describe('isValidRgbColor', () => {
    it('should validate RGB colors', () => {
      expect(isValidRgbColor('rgb(255, 255, 255)')).toBe(true);
      expect(isValidRgbColor('rgb(0, 0, 0)')).toBe(true);
      expect(isValidRgbColor('rgb(59, 130, 246)')).toBe(true);
    });

    it('should validate RGBA colors', () => {
      expect(isValidRgbColor('rgba(255, 255, 255, 0.5)')).toBe(true);
      expect(isValidRgbColor('rgba(0, 0, 0, 1)')).toBe(true);
    });

    it('should reject invalid RGB colors', () => {
      expect(isValidRgbColor('rgb(256, 0, 0)')).toBe(false);
      expect(isValidRgbColor('rgb(-1, 0, 0)')).toBe(false);
      expect(isValidRgbColor('rgb(255, 0)')).toBe(false);
      expect(isValidRgbColor('rgb(255, 0, 0, 0, 0)')).toBe(false);
    });
  });

  describe('isValidHslColor', () => {
    it('should validate HSL colors', () => {
      expect(isValidHslColor('hsl(0, 0%, 100%)')).toBe(true);
      expect(isValidHslColor('hsl(360, 100%, 50%)')).toBe(true);
      expect(isValidHslColor('hsl(180, 50%, 25%)')).toBe(true);
    });

    it('should validate HSLA colors', () => {
      expect(isValidHslColor('hsla(0, 0%, 100%, 0.5)')).toBe(true);
      expect(isValidHslColor('hsla(360, 100%, 50%, 1)')).toBe(true);
    });

    it('should reject invalid HSL colors', () => {
      expect(isValidHslColor('hsl(361, 0%, 100%)')).toBe(false);
      expect(isValidHslColor('hsl(0, 101%, 100%)')).toBe(false);
      expect(isValidHslColor('hsl(0, 0%, 101%)')).toBe(false);
      expect(isValidHslColor('hsl(0, 0%)')).toBe(false);
    });
  });

  describe('isValidColor', () => {
    it('should validate any supported color format', () => {
      expect(isValidColor('#ffffff')).toBe(true);
      expect(isValidColor('rgb(255, 255, 255)')).toBe(true);
      expect(isValidColor('hsl(0, 0%, 100%)')).toBe(true);
    });

    it('should reject unsupported formats', () => {
      expect(isValidColor('red')).toBe(false);
      expect(isValidColor('color(display-p3 1 0 0)')).toBe(false);
      expect(isValidColor('')).toBe(false);
    });
  });
});

describe('Color Normalization', () => {
  describe('normalizeHexColor', () => {
    it('should normalize 3-character hex to 6-character', () => {
      expect(normalizeHexColor('#abc')).toBe('#aabbcc');
      expect(normalizeHexColor('#fff')).toBe('#ffffff');
      expect(normalizeHexColor('#000')).toBe('#000000');
    });

    it('should leave 6-character hex unchanged', () => {
      expect(normalizeHexColor('#aabbcc')).toBe('#aabbcc');
      expect(normalizeHexColor('#ffffff')).toBe('#ffffff');
    });

    it('should convert to lowercase', () => {
      expect(normalizeHexColor('#ABC')).toBe('#aabbcc');
      expect(normalizeHexColor('#FFFFFF')).toBe('#ffffff');
    });
  });
});

describe('Color Conversion', () => {
  describe('hexToRgb', () => {
    it('should convert hex to RGB', () => {
      expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
      expect(hexToRgb('#3b82f6')).toEqual({ r: 59, g: 130, b: 246 });
    });

    it('should handle 3-character hex', () => {
      expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(hexToRgb('#000')).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('should return null for invalid hex', () => {
      expect(hexToRgb('invalid')).toBeNull();
      expect(hexToRgb('#gggggg')).toBeNull();
    });
  });

  describe('rgbToHex', () => {
    it('should convert RGB to hex', () => {
      expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
      expect(rgbToHex(0, 0, 0)).toBe('#000000');
      expect(rgbToHex(59, 130, 246)).toBe('#3b82f6');
    });

    it('should clamp values to valid range', () => {
      expect(rgbToHex(300, -10, 100)).toBe('#ff0064');
    });
  });
});

describe('Contrast Calculations', () => {
  describe('getLuminance', () => {
    it('should calculate luminance correctly', () => {
      const white = { r: 255, g: 255, b: 255 };
      const black = { r: 0, g: 0, b: 0 };

      expect(getLuminance(white.r, white.g, white.b)).toBeCloseTo(1, 2);
      expect(getLuminance(black.r, black.g, black.b)).toBeCloseTo(0, 2);
    });
  });

  describe('getContrastRatio', () => {
    it('should calculate contrast ratio correctly', () => {
      const white = { r: 255, g: 255, b: 255 };
      const black = { r: 0, g: 0, b: 0 };

      const ratio = getContrastRatio(white, black);
      expect(ratio).toBeCloseTo(21, 1); // Maximum contrast ratio
    });

    it('should be symmetric', () => {
      const color1 = { r: 100, g: 150, b: 200 };
      const color2 = { r: 200, g: 100, b: 150 };

      const ratio1 = getContrastRatio(color1, color2);
      const ratio2 = getContrastRatio(color2, color1);
      expect(ratio1).toBeCloseTo(ratio2, 2);
    });
  });

  describe('WCAG Compliance', () => {
    it('should check WCAG AA compliance', () => {
      const white = { r: 255, g: 255, b: 255 };
      const black = { r: 0, g: 0, b: 0 };
      const gray = { r: 128, g: 128, b: 128 };

      expect(meetsWcagAA(white, black)).toBe(true);
      expect(meetsWcagAA(black, white)).toBe(true);
      expect(meetsWcagAA(gray, white)).toBe(false);
    });

    it('should check WCAG AAA compliance', () => {
      const white = { r: 255, g: 255, b: 255 };
      const black = { r: 0, g: 0, b: 0 };
      const lightGray = { r: 200, g: 200, b: 200 };

      expect(meetsWcagAAA(white, black)).toBe(true);
      expect(meetsWcagAAA(black, white)).toBe(true);
      expect(meetsWcagAAA(lightGray, white)).toBe(false);
    });
  });

  describe('getContrastLevel', () => {
    it('should return correct contrast levels', () => {
      expect(getContrastLevel(21)).toBe('AAA');
      expect(getContrastLevel(7)).toBe('AAA');
      expect(getContrastLevel(6.9)).toBe('AA');
      expect(getContrastLevel(4.5)).toBe('AA');
      expect(getContrastLevel(4.4)).toBe('Fail');
      expect(getContrastLevel(1)).toBe('Fail');
    });
  });
});

describe('Utility Functions', () => {
  describe('formatColorForDisplay', () => {
    it('should format hex colors for display', () => {
      expect(formatColorForDisplay('#abc')).toBe('#AABBCC');
      expect(formatColorForDisplay('#ffffff')).toBe('#FFFFFF');
    });

    it('should return other formats unchanged', () => {
      expect(formatColorForDisplay('rgb(255, 255, 255)')).toBe(
        'rgb(255, 255, 255)'
      );
      expect(formatColorForDisplay('hsl(0, 0%, 100%)')).toBe(
        'hsl(0, 0%, 100%)'
      );
    });
  });

  describe('getDefaultBackgroundColor', () => {
    it('should return correct background colors', () => {
      expect(getDefaultBackgroundColor(false)).toEqual({
        r: 255,
        g: 255,
        b: 255,
      });
      expect(getDefaultBackgroundColor(true)).toEqual({ r: 23, g: 23, b: 23 });
    });
  });
});
