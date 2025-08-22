# Responsive Scaling System Guide

This guide explains how to use the comprehensive responsive scaling system implemented for the Tauri v2 Import Manager app.

## Overview

The responsive scaling system automatically adjusts UI elements (fonts, buttons, tables, spacing, etc.) based on the display size, ensuring optimal viewing experience across different screen sizes:
- **14" Laptop**: ~1366-1920px width
- **21" Monitor**: ~1920-2560px width or higher

## Features

### 1. Fluid Typography
Automatically scales text sizes using CSS `clamp()` functions:

```css
/* Base font size scales from 14px to 18px */
body { font-size: clamp(14px, 1vw + 10px, 18px); }

/* Available text classes */
.text-fluid-xs    /* 10px - 12px */
.text-fluid-sm    /* 12px - 14px */
.text-fluid-base  /* 14px - 18px */
.text-fluid-lg    /* 16px - 20px */
.text-fluid-xl    /* 18px - 24px */
.text-fluid-2xl   /* 20px - 28px */
.text-fluid-3xl   /* 24px - 32px */
```

### 2. Responsive Components
Pre-built components that automatically scale:

```tsx
import { 
  ResponsiveText, 
  ResponsiveButton, 
  ResponsiveInput, 
  ResponsiveTable,
  ResponsiveCard,
  ResponsiveIcon,
  ResponsiveContainer,
  ResponsiveGrid,
  ResponsiveSpacing
} from '@/components/ui/responsive'

// Usage examples
<ResponsiveText size="lg">Large responsive text</ResponsiveText>
<ResponsiveButton variant="lg" onClick={handleClick}>Large Button</ResponsiveButton>
<ResponsiveInput placeholder="Enter text..." />
<ResponsiveTable>
  {/* Table content */}
</ResponsiveTable>
```

### 3. CSS Classes
Direct CSS classes for manual styling:

```html
<!-- Buttons -->
<button class="btn-fluid">Default Button</button>
<button class="btn-fluid-sm">Small Button</button>
<button class="btn-fluid-lg">Large Button</button>

<!-- Inputs -->
<input class="input-fluid" placeholder="Enter text..." />
<input class="input-fluid-sm" placeholder="Small input..." />
<input class="input-fluid-lg" placeholder="Large input..." />

<!-- Tables -->
<table class="table-fluid">
  <thead>
    <tr>
      <th>Header</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Content</td>
    </tr>
  </tbody>
</table>

<!-- Cards -->
<div class="card-fluid">
  <h3>Card Title</h3>
  <p>Card content</p>
</div>

<!-- Spacing -->
<div class="space-fluid">
  <div>Item 1</div>
  <div>Item 2</div>
</div>

<!-- Padding/Margins -->
<div class="p-fluid">Padding</div>
<div class="m-fluid">Margin</div>
```

### 4. React Hooks
Custom hooks for responsive logic:

```tsx
import { 
  useResponsive, 
  useResponsiveScale, 
  useResponsiveClasses,
  useResponsiveLayout 
} from '@/hooks/useResponsive'

// Basic responsive state
const { width, height, screenSize, isSmallScreen } = useResponsive()

// Responsive scaling utilities
const { scaleFactor, buttonSize, textSize } = useResponsiveScale()

// Responsive class names
const { textClass, buttonClass, inputClass } = useResponsiveClasses()

// Layout decisions
const { sidebarWidth, gridColumns, showSidebar } = useResponsiveLayout()
```

## Screen Size Categories

### Small (≤1366px)
- **Target**: 14" laptops
- **Scaling**: 90% of base size
- **Layout**: Compact, single column grids
- **Sidebar**: Collapsed or hidden

### Medium (1367px - 1920px)
- **Target**: Standard monitors
- **Scaling**: 100% (base size)
- **Layout**: Standard multi-column grids
- **Sidebar**: Standard width

### Large (1921px - 2560px)
- **Target**: Large monitors
- **Scaling**: 110% of base size
- **Layout**: Expanded multi-column grids
- **Sidebar**: Wider sidebar

### Ultra-wide (>2560px)
- **Target**: Ultra-wide monitors
- **Scaling**: 120% of base size
- **Layout**: Maximum column utilization
- **Sidebar**: Maximum width

## Media Queries

The system includes specific media queries for fine-tuning:

```css
/* Small laptop optimization */
@media (max-width: 1366px) {
  body { font-size: clamp(13px, 0.9vw + 9px, 16px); }
  .btn-fluid { min-width: clamp(70px, 7vw, 100px); }
  .input-fluid { width: clamp(100px, 18vw, 250px); }
}

/* Large monitor optimization */
@media (min-width: 1920px) {
  body { font-size: clamp(16px, 1.1vw + 12px, 20px); }
  .btn-fluid { min-width: clamp(90px, 9vw, 140px); }
  .input-fluid { width: clamp(140px, 22vw, 350px); }
}

/* Ultra-wide monitor optimization */
@media (min-width: 2560px) {
  body { font-size: clamp(18px, 1.2vw + 14px, 22px); }
  .btn-fluid { min-width: clamp(100px, 10vw, 160px); }
  .input-fluid { width: clamp(160px, 24vw, 400px); }
}
```

## Implementation Examples

### 1. Dashboard Cards
```tsx
import { ResponsiveCard, ResponsiveText, ResponsiveGrid } from '@/components/ui/responsive'

const DashboardCards = () => {
  return (
    <ResponsiveGrid variant="lg">
      <ResponsiveCard>
        <ResponsiveText size="xl">Revenue</ResponsiveText>
        <ResponsiveText size="2xl">$50,000</ResponsiveText>
      </ResponsiveCard>
      <ResponsiveCard>
        <ResponsiveText size="xl">Orders</ResponsiveText>
        <ResponsiveText size="2xl">150</ResponsiveText>
      </ResponsiveCard>
    </ResponsiveGrid>
  )
}
```

### 2. Data Tables
```tsx
import { ResponsiveTable, ResponsiveText } from '@/components/ui/responsive'

const DataTable = ({ data }) => {
  return (
    <ResponsiveTable>
      <thead>
        <tr>
          <th><ResponsiveText>Name</ResponsiveText></th>
          <th><ResponsiveText>Email</ResponsiveText></th>
          <th><ResponsiveText>Status</ResponsiveText></th>
        </tr>
      </thead>
      <tbody>
        {data.map(item => (
          <tr key={item.id}>
            <td><ResponsiveText>{item.name}</ResponsiveText></td>
            <td><ResponsiveText>{item.email}</ResponsiveText></td>
            <td><ResponsiveText>{item.status}</ResponsiveText></td>
          </tr>
        ))}
      </tbody>
    </ResponsiveTable>
  )
}
```

### 3. Form Components
```tsx
import { ResponsiveInput, ResponsiveButton, ResponsiveSpacing } from '@/components/ui/responsive'

const ContactForm = () => {
  return (
    <form>
      <ResponsiveSpacing variant="lg">
        <ResponsiveInput placeholder="Name" />
        <ResponsiveInput placeholder="Email" />
        <ResponsiveInput placeholder="Message" />
        <ResponsiveButton type="submit">Send Message</ResponsiveButton>
      </ResponsiveSpacing>
    </form>
  )
}
```

### 4. Navigation
```tsx
import { useResponsiveLayout } from '@/hooks/useResponsive'

const Navigation = () => {
  const { sidebarWidth, showSidebar } = useResponsiveLayout()
  
  return (
    <nav className={`${sidebarWidth} ${showSidebar ? 'block' : 'hidden'}`}>
      {/* Navigation content */}
    </nav>
  )
}
```

## Best Practices

### 1. Use Responsive Components
Prefer the responsive components over manual CSS classes when possible:

```tsx
// ✅ Good
<ResponsiveButton>Click me</ResponsiveButton>

// ❌ Avoid
<button className="btn-fluid">Click me</button>
```

### 2. Leverage Hooks for Logic
Use hooks for responsive logic instead of manual calculations:

```tsx
// ✅ Good
const { screenSize, isSmallScreen } = useResponsive()
const { buttonSize } = useResponsiveScale()

// ❌ Avoid
const isSmall = window.innerWidth <= 1366
```

### 3. Test Across Screen Sizes
Always test your components across different screen sizes:
- 1366px (small laptop)
- 1920px (standard monitor)
- 2560px (large monitor)

### 4. Use Semantic Sizing
Choose sizes that make sense semantically:

```tsx
// ✅ Good
<ResponsiveText size="xl">Main Heading</ResponsiveText>
<ResponsiveText size="base">Body text</ResponsiveText>
<ResponsiveText size="sm">Caption</ResponsiveText>

// ❌ Avoid
<ResponsiveText size="3xl">Small caption</ResponsiveText>
```

## Migration Guide

### From Fixed Sizes
Replace fixed sizes with responsive alternatives:

```tsx
// Before
<button className="px-4 py-2 text-sm">Button</button>
<input className="w-64 px-3 py-2" />
<div className="text-lg">Title</div>

// After
<ResponsiveButton>Button</ResponsiveButton>
<ResponsiveInput />
<ResponsiveText size="lg">Title</ResponsiveText>
```

### From Manual Media Queries
Replace manual media queries with responsive utilities:

```tsx
// Before
const [isMobile, setIsMobile] = useState(false)
useEffect(() => {
  const checkSize = () => setIsMobile(window.innerWidth < 768)
  checkSize()
  window.addEventListener('resize', checkSize)
  return () => window.removeEventListener('resize', checkSize)
}, [])

// After
const { isSmallScreen } = useResponsive()
```

## Troubleshooting

### Common Issues

1. **Elements not scaling properly**
   - Ensure you're using the responsive classes or components
   - Check that the CSS is properly loaded
   - Verify viewport meta tag is present

2. **Layout breaking on specific screen sizes**
   - Test with the responsive hooks to debug
   - Check media query breakpoints
   - Verify grid and flex layouts

3. **Performance issues**
   - The system uses CSS clamp() for optimal performance
   - Avoid JavaScript-based scaling when possible
   - Use the hooks sparingly for logic, not styling

### Debug Tools

Use the responsive hooks to debug:

```tsx
const { width, screenSize, breakpoint } = useResponsive()
console.log(`Screen: ${width}px, Size: ${screenSize}, Breakpoint: ${breakpoint}`)
```

## Conclusion

This responsive scaling system provides a comprehensive solution for adapting your Tauri v2 app across different display sizes. By using the provided components, classes, and hooks, you can ensure your app looks great and functions well on any screen size from 14" laptops to ultra-wide monitors.

The system is designed to be:
- **Automatic**: No manual calculations needed
- **Consistent**: Uniform scaling across all components
- **Performant**: CSS-based scaling with minimal JavaScript
- **Maintainable**: Clear patterns and reusable components
