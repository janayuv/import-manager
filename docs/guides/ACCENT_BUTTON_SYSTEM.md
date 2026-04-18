# Accent Color Button System

This document describes the implementation of accent color-based button styling across all modules in the Import Manager application.

## Overview

The accent color button system allows buttons to automatically adapt to the selected theme color, providing a consistent and dynamic user interface that responds to theme changes.

## Implementation

### 1. Button Variants

The button system includes new accent-specific variants:

- `accent` - Primary accent color button
- `outline-accent` - Outlined button with accent color border and text
- `ghost-accent` - Ghost button with accent color text
- `link-accent` - Link-style button with accent color text

### 2. Enhanced Button Component

The `Button` component now includes:

```tsx
interface ButtonProps extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  useAccentColor?: boolean; // New prop to enable accent color mode
}
```

### 3. Automatic Accent Conversion

When `useAccentColor={true}` is set, the following variants are automatically converted:

- `default` → `accent`
- `outline` → `outline-accent`
- `ghost` → `ghost-accent`
- `link` → `link-accent`

## Usage Examples

### Basic Usage

```tsx
import { Button } from '@/components/ui/button';

// Regular button (uses primary color)
<Button variant="default">Save</Button>

// Accent color button (uses theme accent color)
<Button variant="default" useAccentColor>Save</Button>

// Direct accent variant
<Button variant="accent">Save</Button>
```

### Module Integration

```tsx
// Supplier form
<Button variant="default" useAccentColor>Add New Supplier</Button>

// Expense form
<Button type="submit" useAccentColor>Add Expense</Button>

// Invoice wizard
<Button variant="outline" useAccentColor>Save Draft</Button>
```

## CSS Variables

The system uses CSS custom properties that are automatically updated based on the selected theme:

### Light Mode Accent Colors
```css
:root.theme-blue {
  --accent: oklch(0.95 0.04 220);
  --accent-foreground: oklch(0.205 0 0);
}
```

### Dark Mode Accent Colors
```css
.dark.theme-blue {
  --accent: oklch(0.3 0.05 220);
  --accent-foreground: oklch(0.985 0 0);
}
```

## Supported Themes

All theme colors support accent color buttons:

- Blue (default)
- Green
- Orange
- Red
- Purple
- Teal
- Cyan
- Sky
- Indigo
- Violet
- Fuchsia
- Pink
- Rose

## Button Variants Reference

| Variant | Description | Accent Equivalent |
|---------|-------------|-------------------|
| `default` | Primary button | `accent` |
| `outline` | Outlined button | `outline-accent` |
| `ghost` | Ghost button | `ghost-accent` |
| `link` | Link button | `link-accent` |
| `secondary` | Secondary button | No accent equivalent |
| `destructive` | Destructive button | No accent equivalent |
| `success` | Success button | No accent equivalent |
| `warning` | Warning button | No accent equivalent |
| `info` | Info button | No accent equivalent |
| `neutral` | Neutral button | No accent equivalent |

## Migration Guide

### For New Components

Use `useAccentColor={true}` for buttons that should adapt to the theme:

```tsx
// ✅ Recommended
<Button variant="default" useAccentColor>Save</Button>

// ✅ Also works
<Button variant="accent">Save</Button>
```

### For Existing Components

Update existing buttons to use accent colors:

```tsx
// Before
<Button variant="default">Save</Button>

// After
<Button variant="default" useAccentColor>Save</Button>
```

## Testing

Use the `AccentButtonDemo` component to test accent color functionality:

```tsx
import { AccentButtonDemo } from '@/components/examples/AccentButtonDemo';

// Add to any page for testing
<AccentButtonDemo />
```

## Best Practices

1. **Consistency**: Use `useAccentColor={true}` for primary action buttons across modules
2. **Semantic Colors**: Keep destructive, success, warning, and info buttons as-is for semantic meaning
3. **Theme Testing**: Test buttons with different theme colors to ensure proper contrast
4. **Accessibility**: Ensure sufficient contrast ratios for all accent color combinations

## Future Enhancements

- [ ] Add hover state animations for accent colors
- [ ] Implement accent color gradients for special buttons
- [ ] Add accent color variants for other UI components
- [ ] Create accent color palette generator for custom themes

## Troubleshooting

### Buttons Not Updating with Theme

1. Ensure the theme provider is properly configured
2. Check that CSS variables are loaded correctly
3. Verify the button component is using the latest version

### Color Contrast Issues

1. Test with different theme colors
2. Check both light and dark modes
3. Use browser dev tools to inspect CSS variables

### Performance Considerations

The accent color system is optimized for performance:
- CSS variables are pre-calculated
- No runtime color calculations
- Minimal JavaScript overhead

