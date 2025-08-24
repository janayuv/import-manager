# Theme Guide - Import Manager

## Overview

The Import Manager application now uses a unified theme system with centralized design tokens and semantic color variables. This ensures consistent UI across all modules and provides easy theme customization.

## Design Tokens

### Semantic Colors

The application uses semantic color tokens that automatically adapt to light/dark modes:

- `primary` / `primary-foreground` - Main brand color (buttons, headers, links)
- `secondary` / `secondary-foreground` - Secondary actions and backgrounds
- `accent` / `accent-foreground` - Highlighted elements
- `destructive` / `destructive-foreground` - Error states, delete actions
- `success` / `success-foreground` - Success states, active status
- `warning` / `warning-foreground` - Warning states, pending status
- `info` / `info-foreground` - Information states, neutral actions
- `neutral` / `neutral-foreground` - Neutral states, secondary information
- `muted` / `muted-foreground` - Disabled states, subtle text
- `background` / `foreground` - Main background and text
- `card` / `card-foreground` - Card backgrounds and text
- `border` - Border colors
- `input` - Input field backgrounds
- `ring` - Focus ring colors

### Baseline Design Tokens

Fluid responsive tokens that scale with screen size:

```css
/* Spacing */
--space-xs: clamp(4px, 0.4vw, 6px);
--space-sm: clamp(8px, 0.7vw, 10px);
--space-md: clamp(12px, 1vw, 14px);
--space-lg: clamp(16px, 1.2vw, 18px);
--space-xl: clamp(24px, 2vw, 28px);

/* Border Radius */
--radius-scale-sm: clamp(4px, 0.5vw, 6px);
--radius-scale-md: clamp(8px, 0.8vw, 10px);
--radius-scale-lg: clamp(12px, 1vw, 14px);
--radius-scale-xl: clamp(16px, 1.2vw, 18px);
--radius-scale-2xl: clamp(24px, 2vw, 28px);

/* Typography */
--font-sm: clamp(0.875rem, 0.6vw + 0.5rem, 0.9rem);
--font-base: clamp(1rem, 0.8vw + 0.6rem, 1.125rem);
--font-lg: clamp(1.125rem, 1vw + 0.7rem, 1.25rem);
--font-xl: clamp(1.25rem, 1.2vw + 0.8rem, 1.5rem);
--font-2xl: clamp(1.5rem, 1.5vw + 1rem, 1.75rem);
```

## Theme Palettes

The application supports multiple color palettes that can be easily switched:

- `theme-zinc` (default) - Neutral gray palette
- `theme-blue` - Blue accent palette
- `theme-green` - Green accent palette
- `theme-orange` - Orange accent palette
- `theme-red` - Red accent palette
- `theme-purple` - Purple accent palette

## Usage Guidelines

### Buttons

Use semantic button variants:

```tsx
// Primary action
<Button variant="default">Primary Action</Button>

// Secondary action
<Button variant="secondary">Secondary Action</Button>

// Success state
<Button variant="success">Save</Button>

// Warning state
<Button variant="warning">Warning</Button>

// Destructive action
<Button variant="destructive">Delete</Button>

// Info state
<Button variant="info">Info</Button>

// Neutral state
<Button variant="neutral">Neutral</Button>
```

### Badges

Use semantic badge variants for status indicators:

```tsx
// Active/Success status
<Badge variant="success">Active</Badge>

// Warning/Pending status
<Badge variant="warning">Pending</Badge>

// Error/Destructive status
<Badge variant="destructive">Error</Badge>

// Info status
<Badge variant="info">Info</Badge>

// Neutral status
<Badge variant="neutral">Neutral</Badge>
```

### Table Headers

All table headers now use the primary theme color:

```tsx
// Table header with primary theme
<TableHeader className="bg-primary text-primary-foreground">
  <TableRow>
    <TableHead>Column Header</TableHead>
  </TableRow>
</TableHeader>
```

### Form Elements

Use semantic colors for form validation and states:

```tsx
// Required field indicator
<Label>Field Name <span className="text-destructive">*</span></Label>

// Error message
{error && <p className="text-destructive text-sm">{error}</p>}

// Success message
{success && <p className="text-success text-sm">{success}</p>}

// Warning message
{warning && <p className="text-warning text-sm">{warning}</p>}
```

### Cards and Containers

Use semantic background colors:

```tsx
// Main card
<Card className="bg-card">
  <CardContent className="text-card-foreground">
    Content
  </CardContent>
</Card>

// Muted background
<div className="bg-muted text-muted-foreground">
  Secondary content
</div>

// Success background
<div className="bg-success/10 text-success">
  Success message
</div>

// Warning background
<div className="bg-warning/10 text-warning">
  Warning message
</div>

// Error background
<div className="bg-destructive/10 text-destructive">
  Error message
</div>
```

## Responsive Design

The application uses fluid responsive scaling that automatically adjusts based on screen size:

- **Small screens (≤1366px)**: Compact layout with smaller spacing and typography
- **Medium screens (1367px-1919px)**: Standard layout
- **Large screens (≥1920px)**: Expanded layout with larger spacing and typography

### Responsive Classes

```tsx
// Fluid typography
<h1 className="text-fluid-2xl">Responsive Heading</h1>

// Fluid spacing
<div className="space-fluid">Responsive spacing</div>

// Fluid buttons
<Button className="btn-fluid">Responsive Button</Button>

// Fluid inputs
<Input className="input-fluid" />

// Fluid tables
<Table className="table-fluid" />
```

## Implementation Notes

### What Was Changed

1. **Centralized Theme Tokens**: Added semantic color variables in `src/index.css`
2. **Extended UI Variants**: Updated button and badge variants in `src/components/ui/`
3. **Removed Hardcoded Colors**: Replaced all hardcoded hex colors with semantic tokens
4. **Table Headers**: Standardized all table headers to use `bg-primary text-primary-foreground`
5. **Status Badges**: Updated all status indicators to use semantic variants
6. **Form Validation**: Standardized error/success/warning colors
7. **Responsive Scaling**: Maintained existing fluid responsive system

### Files Modified

- `src/index.css` - Added semantic color variables and theme palettes
- `src/components/ui/button-variants.ts` - Extended with semantic variants
- `src/components/ui/badge-variants.ts` - Extended with semantic variants
- `src/components/ui/responsive-table.tsx` - Updated table header styling
- `src/components/boe/data-table.tsx` - Updated table header styling
- Various component files - Replaced hardcoded colors with semantic tokens

### Benefits

1. **Consistency**: All modules now use the same color scheme
2. **Maintainability**: Easy to change colors from a single location
3. **Accessibility**: Proper contrast ratios in light/dark modes
4. **Responsiveness**: Maintains existing fluid scaling system
5. **Extensibility**: Easy to add new theme palettes
6. **Developer Experience**: Clear semantic naming conventions

## Future Enhancements

1. **Theme Switcher**: Add UI to switch between theme palettes
2. **Custom Themes**: Allow users to create custom color schemes
3. **System Theme**: Automatic light/dark mode detection
4. **Brand Customization**: Allow organizations to set their brand colors

## Migration Guide

When adding new components or modifying existing ones:

1. **Use semantic tokens** instead of hardcoded colors
2. **Follow the variant system** for buttons and badges
3. **Use responsive classes** for fluid scaling
4. **Test in both light and dark modes**
5. **Ensure proper contrast ratios**

Example migration:

```tsx
// ❌ Before (hardcoded)
<Button className="bg-blue-500 text-white">Action</Button>
<div className="bg-red-100 text-red-800">Error</div>

// ✅ After (semantic)
<Button variant="default">Action</Button>
<div className="bg-destructive/10 text-destructive">Error</div>
```
