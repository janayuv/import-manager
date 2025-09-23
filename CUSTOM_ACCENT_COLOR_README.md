# Custom Accent Color Feature

## Overview

The Import Manager now supports custom accent colors, allowing users to personalize their interface with any color of their choice. This feature extends the existing theme system with a custom color picker that includes validation, contrast checking, and accessibility features.

## Features

### 🎨 Custom Color Selection
- **Native Color Picker**: Use the browser's native color picker for visual selection
- **Hex Input**: Manual hex color input with auto-formatting (#abc → #aabbcc)
- **Live Preview**: Real-time color preview as you type or select
- **Validation**: Comprehensive validation for hex, RGB, and HSL color formats

### ♿ Accessibility Features
- **Contrast Checking**: Automatic WCAG AA/AAA compliance checking
- **Contrast Warnings**: Alerts for low contrast ratios with suggested alternatives
- **Keyboard Navigation**: Full keyboard support for all controls
- **Screen Reader Support**: Proper ARIA labels and live regions

### 💾 Persistence & Integration
- **localStorage Persistence**: Custom colors are saved and restored across sessions
- **CSS Variable Integration**: Colors are applied via CSS custom properties
- **Tailwind Integration**: Works seamlessly with existing Tailwind classes
- **Theme System Integration**: Integrates with existing theme provider

## Usage

### For Users

1. **Access Custom Color Picker**:
   - Click the palette icon in the header
   - Click the "+" (Custom Color) option at the end of the color grid

2. **Choose Your Color**:
   - Use the native color picker for visual selection
   - Or type a hex color directly (e.g., #ff5733)
   - Preview updates in real-time

3. **Save Your Color**:
   - Click "Save Color" to apply
   - Or "Reset to Default" to remove custom color
   - Colors are automatically saved and persist across sessions

### For Developers

#### Using Custom Accent Colors

```tsx
import { useTheme } from '@/components/layout/theme-context';

function MyComponent() {
  const { theme, setCustomAccentColor } = useTheme();
  
  // Check if custom color is set
  if (theme.customAccentColor) {
    console.log('Custom accent color:', theme.customAccentColor);
  }
  
  // Set a custom color programmatically
  const handleSetCustomColor = () => {
    setCustomAccentColor('#ff5733');
  };
  
  return (
    <div className="bg-accent text-accent-foreground">
      This uses the custom accent color
    </div>
  );
}
```

#### Color Validation Utilities

```tsx
import { 
  isValidHexColor, 
  getContrastRatio, 
  meetsWcagAA 
} from '@/lib/color-utils';

// Validate colors
const isValid = isValidHexColor('#ff5733'); // true

// Check contrast
const contrast = getContrastRatio(
  { r: 255, g: 87, b: 51 }, // #ff5733
  { r: 255, g: 255, b: 255 } // white
);

const isAccessible = meetsWcagAA(
  { r: 255, g: 87, b: 51 },
  { r: 255, g: 255, b: 255 }
);
```

## Technical Implementation

### Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Site Header   │───▶│ CustomColorPicker │───▶│ Theme Provider  │
│   (Color Grid)  │    │     (Modal)       │    │  (State Mgmt)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │ Color Utilities  │    │ CSS Variables   │
                       │ (Validation)     │    │ (--accent)      │
                       └──────────────────┘    └─────────────────┘
```

### Key Components

- **`CustomColorPicker`**: Modal component with color picker and validation
- **`ThemeProvider`**: Extended to handle custom accent colors
- **`color-utils.ts`**: Comprehensive color validation and contrast utilities
- **CSS Variables**: Dynamic accent color application via `--accent`

### Data Flow

1. User clicks custom color option in header
2. `CustomColorPicker` modal opens with current color
3. User selects/inputs color with real-time validation
4. Contrast checking provides accessibility feedback
5. On save, `setCustomAccentColor()` updates theme state
6. Theme provider updates CSS variables and localStorage
7. All accent-colored components update automatically

## Testing

### Unit Tests
- **Color Validation**: Tests for hex, RGB, HSL validation
- **Contrast Calculations**: WCAG compliance checking
- **Theme Provider**: Custom color persistence and state management

### E2E Tests
- **User Flow**: Complete custom color selection workflow
- **Persistence**: Color persistence across page reloads
- **Accessibility**: Contrast warnings and keyboard navigation

Run tests:
```bash
# Unit tests
npm test -- src/lib/__tests__/color-utils.test.ts
npm test -- src/components/layout/__tests__/theme-provider.test.tsx

# E2E tests
npm run test:e2e -- tests/custom-accent-color.spec.ts
```

## Browser Support

- **Modern Browsers**: Full support for native color picker
- **Legacy Browsers**: Fallback to hex input only
- **Mobile**: Touch-friendly color picker interface

## Performance

- **CSS Variables**: No runtime color calculations
- **localStorage**: Minimal storage footprint
- **Lazy Loading**: Color utilities loaded only when needed

## Future Enhancements

- [ ] Color palette presets
- [ ] Color history/favorites
- [ ] Advanced color formats (HSL, RGB sliders)
- [ ] Color scheme generation
- [ ] Export/import color themes

## Troubleshooting

### Custom Color Not Applied
1. Check browser console for validation errors
2. Verify hex color format (#ffffff)
3. Ensure localStorage is enabled

### Contrast Warnings
1. Use suggested alternative colors
2. Test with different background colors
3. Consider using darker/lighter variants

### Performance Issues
1. Clear localStorage if corrupted
2. Check for CSS variable conflicts
3. Verify Tailwind configuration
