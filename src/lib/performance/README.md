# Performance Optimization & Caching System

This document provides a comprehensive guide to the performance optimization and caching system implemented in the Import Manager application.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Caching System](#caching-system)
4. [Performance Hooks](#performance-hooks)
5. [Optimized Components](#optimized-components)
6. [Performance Monitoring](#performance-monitoring)
7. [Bundle Optimization](#bundle-optimization)
8. [Memory Management](#memory-management)
9. [Usage Examples](#usage-examples)
10. [Best Practices](#best-practices)
11. [Testing](#testing)
12. [Configuration](#configuration)

## Overview

The performance optimization system provides:

- **Multi-tier caching** (memory, session, persistent)
- **React performance hooks** for optimized data fetching and state management
- **Memoized components** with automatic performance monitoring
- **Bundle optimization** with code splitting and lazy loading
- **Memory management** with automatic cleanup
- **Performance monitoring** with real-time metrics
- **Image optimization** with lazy loading and caching

## Architecture

```
src/
├── lib/
│   ├── cache/           # Caching system
│   │   └── index.ts     # Cache manager and utilities
│   └── performance/     # Performance utilities
│       └── index.ts     # Monitoring and optimization tools
├── hooks/
│   └── usePerformance.ts # Performance React hooks
└── components/
    └── performance/     # Optimized components
        ├── OptimizedComponents.tsx
        └── PerformanceTest.tsx
```

## Caching System

### Cache Types

1. **Memory Cache** - Fastest, lost on page reload
2. **Session Cache** - Persists during browser session
3. **Persistent Cache** - Persists across sessions (localStorage)
4. **Smart Cache** - Automatic fallback through all cache types

### Cache Configuration

```typescript
import { CACHE_TTL, cache } from '@/lib/cache';

// Configure cache with custom settings
const customCache = new CacheManager({
  ttl: CACHE_TTL.MEDIUM, // 5 minutes
  maxSize: 1000, // Maximum items
  namespace: 'custom-cache', // Namespace for storage
});
```

### Cache Operations

```typescript
// Set data in cache
cache.memory.set('key', data, CACHE_TTL.SHORT);
cache.session.set('key', data, CACHE_TTL.MEDIUM);
cache.persistent.set('key', data, CACHE_TTL.LONG);

// Get data from cache
const data = cache.smart.get('key');

// Check if data exists
const exists = cache.memory.has('key');

// Delete data
cache.memory.delete('key');

// Clear all caches
cache.clearAll();
```

### Cache Utilities

```typescript
import { cacheUtils } from '@/lib/cache';

// Cache with automatic key generation
const key = cacheUtils.withKey('users', { id: 123 }, userData);

// Cache with invalidation
cacheUtils.withInvalidation('user-123', userData, ['users', 'user-list']);

// Invalidate related caches
cacheUtils.invalidateRelated('user-123');

// Debounced cache set
cacheUtils.debouncedSet('key', data, CACHE_TTL.SHORT, 1000);
```

## Performance Hooks

### usePerformanceMonitor

Monitors component render performance and provides transition support.

```typescript
import { usePerformanceMonitor } from '@/hooks/usePerformance'

function MyComponent() {
  const { renderCount, isTransitioning, startTransition } = usePerformanceMonitor('MyComponent')

  return (
    <div>
      <p>Renders: {renderCount}</p>
      {isTransitioning && <p>Transitioning...</p>}
    </div>
  )
}
```

### useCachedData

Optimized data fetching with automatic caching.

```typescript
import { useCachedData, CACHE_TTL } from '@/hooks/usePerformance'

function DataComponent() {
  const { data, loading, error, refetch, invalidate } = useCachedData(
    'users-data',
    async () => {
      const response = await fetch('/api/users')
      return response.json()
    },
    {
      ttl: CACHE_TTL.MEDIUM,
      cacheType: 'smart',
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      onError: (error) => console.error('Failed to fetch:', error),
      onSuccess: (data) => console.log('Data fetched:', data)
    }
  )

  return (
    <div>
      {loading && <p>Loading...</p>}
      {error && <p>Error: {error.message}</p>}
      {data && <p>Users: {data.length}</p>}
      <button onClick={refetch}>Refresh</button>
      <button onClick={invalidate}>Clear Cache</button>
    </div>
  )
}
```

### useTauriData

Optimized data fetching for Tauri commands with caching.

```typescript
import { useTauriData, CACHE_TTL } from '@/hooks/usePerformance'

function SuppliersComponent() {
  const { data: suppliers, loading, error } = useTauriData(
    'get_suppliers',
    { includeInactive: false },
    { ttl: CACHE_TTL.MEDIUM }
  )

  return (
    <div>
      {loading && <p>Loading suppliers...</p>}
      {error && <p>Error: {error.message}</p>}
      {suppliers && <p>Suppliers: {suppliers.length}</p>}
    </div>
  )
}
```

### useOptimizedList

Optimized list data with pagination and filtering.

```typescript
import { useOptimizedList } from '@/hooks/usePerformance'

function ListComponent() {
  const {
    data,
    total,
    page,
    pageSize,
    filters,
    loading,
    error,
    updateFilters,
    goToPage,
    updatePageSize,
    refetch
  } = useOptimizedList(
    async ({ page, pageSize, filters }) => {
      const response = await fetch(`/api/items?page=${page}&size=${pageSize}&filters=${JSON.stringify(filters)}`)
      return response.json()
    },
    {
      initialPage: 1,
      initialPageSize: 20,
      initialFilters: { status: 'active' },
      ttl: CACHE_TTL.SHORT
    }
  )

  return (
    <div>
      <div>
        <button onClick={() => updateFilters({ status: 'inactive' })}>
          Show Inactive
        </button>
        <button onClick={() => goToPage(page + 1)}>
          Next Page
        </button>
      </div>
      {loading && <p>Loading...</p>}
      {data && (
        <div>
          {data.map(item => <div key={item.id}>{item.name}</div>)}
        </div>
      )}
    </div>
  )
}
```

### useOptimizedForm

Optimized form state with debounced updates.

```typescript
import { useOptimizedForm } from '@/hooks/usePerformance'

function FormComponent() {
  const { data, errors, isValidating, updateData, reset, validate } = useOptimizedForm(
    { name: '', email: '', message: '' },
    {
      debounceMs: 300,
      validateOnChange: true,
      validateFn: (data) => {
        const errors = []
        if (!data.name) errors.push('Name is required')
        if (!data.email) errors.push('Email is required')
        return errors.length > 0 ? errors : null
      },
      onDataChange: (data) => console.log('Form data changed:', data)
    }
  )

  return (
    <form>
      <input
        type="text"
        value={data.name}
        onChange={(e) => updateData({ name: e.target.value })}
        placeholder="Name"
      />
      {errors.includes('name') && <p>Name is required</p>}

      <input
        type="email"
        value={data.email}
        onChange={(e) => updateData({ email: e.target.value })}
        placeholder="Email"
      />
      {errors.includes('email') && <p>Email is required</p>}

      <button type="button" onClick={reset}>Reset</button>
      <button type="button" onClick={validate}>Validate</button>
    </form>
  )
}
```

## Optimized Components

### OptimizedDataDisplay

Memoized data display component with loading and error states.

```typescript
import { OptimizedDataDisplay } from '@/components/performance/OptimizedComponents'

function UsersList() {
  return (
    <OptimizedDataDisplay
      data={users}
      title="Users"
      loading={loading}
      error={error}
      emptyMessage="No users found"
      renderItem={(user) => (
        <div key={user.id} className="user-item">
          <span>{user.name}</span>
          <span>{user.email}</span>
        </div>
      )}
    />
  )
}
```

### OptimizedList

Virtualized list component for large datasets.

```typescript
import { OptimizedList } from '@/components/performance/OptimizedComponents'

function LargeList() {
  return (
    <OptimizedList
      items={largeDataset}
      loading={loading}
      error={error}
      containerHeight={400}
      itemHeight={60}
      renderItem={(item) => (
        <div key={item.id} className="list-item">
          {item.name}
        </div>
      )}
    />
  )
}
```

### OptimizedTable

Optimized table component with state persistence.

```typescript
import { OptimizedTable } from '@/components/performance/OptimizedComponents'

function DataTable() {
  const columns = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'email', header: 'Email' },
  ]

  return (
    <OptimizedTable
      data={data}
      columns={columns}
      loading={loading}
      error={error}
      storageKey="users-table"
    />
  )
}
```

## Performance Monitoring

### PerformanceObserver

Monitors web vitals and performance metrics.

```typescript
import { PerformanceObserver } from '@/lib/performance';

// Start monitoring
const observer = PerformanceObserver.getInstance();
observer.startMonitoring();

// Get current metrics
const metrics = observer.getMetrics();
console.log('Performance metrics:', metrics);

// Stop monitoring
observer.stopMonitoring();
```

### MemoryManager

Manages memory usage and triggers cleanup when needed.

```typescript
import { MemoryManager } from '@/lib/performance';

// Register cleanup callback
MemoryManager.registerCleanup(() => {
  // Clear component caches
  cache.memory.clear();
});

// Check memory usage
const memoryUsage = MemoryManager.getMemoryUsage();
console.log('Memory usage:', memoryUsage);

// Set memory threshold (default: 80%)
MemoryManager.setMemoryThreshold(0.7); // 70%
```

### PerformanceReporter

Collects and reports performance metrics.

```typescript
import { PerformanceReporter } from '@/lib/performance';

// Add performance report
PerformanceReporter.addReport({
  loadTime: 1200,
  firstContentfulPaint: 800,
  largestContentfulPaint: 1500,
  firstInputDelay: 50,
  cumulativeLayoutShift: 0.1,
  memoryUsage: 50000000,
  memoryLimit: 100000000,
  cacheHitRate: 0.85,
  cacheSize: 100,
  renderCount: 15,
  renderTime: 25,
});

// Get average metrics
const averageMetrics = PerformanceReporter.getAverageMetrics();

// Export reports
const report = PerformanceReporter.exportReports();
```

## Bundle Optimization

### BundleAnalyzer

Tracks bundle size and composition.

```typescript
import { BundleAnalyzer } from '@/lib/performance';

// Track chunk size
BundleAnalyzer.trackChunk('vendor', 500000);
BundleAnalyzer.trackChunk('app', 200000);

// Track module size
BundleAnalyzer.trackModule('react', 100000);
BundleAnalyzer.trackModule('lodash', 50000);

// Get bundle statistics
const stats = BundleAnalyzer.getBundleStats();
console.log('Bundle stats:', stats);

// Get largest chunks
const largestChunks = BundleAnalyzer.getLargestChunks(5);
console.log('Largest chunks:', largestChunks);
```

### CodeSplitter

Manages dynamic imports and code splitting.

```typescript
import { CodeSplitter } from '@/lib/performance';

// Load chunk with caching
await CodeSplitter.loadChunk(
  'heavy-component',
  () => import('@/components/HeavyComponent')
);

// Preload chunk
CodeSplitter.preloadChunk('lazy-module', () => import('@/modules/LazyModule'));

// Get loading status
const status = CodeSplitter.getLoadingStatus();
console.log('Loaded chunks:', status.loaded);
console.log('Loading chunks:', status.loading);
```

## Memory Management

### Automatic Cleanup

The system automatically manages memory usage:

1. **Memory monitoring** - Checks memory usage every 30 seconds
2. **Threshold-based cleanup** - Triggers cleanup when memory usage exceeds threshold
3. **Cache eviction** - Removes oldest cache entries when cache is full
4. **Component cleanup** - Unmounts unused components and clears their state

### Manual Cleanup

```typescript
import { MemoryManager, cache } from '@/lib/performance';

// Trigger manual cleanup
MemoryManager.checkMemoryUsage();

// Clear specific caches
cache.memory.clear();
cache.session.clear();
cache.persistent.clear();

// Clear all caches
cache.clearAll();
```

## Usage Examples

### Complete Example: Optimized Data Fetching

```typescript
import React from 'react'
import { useTauriData, CACHE_TTL } from '@/hooks/usePerformance'
import { OptimizedDataDisplay, OptimizedSkeleton } from '@/components/performance/OptimizedComponents'
import { usePerformanceMonitor } from '@/hooks/usePerformance'

function SuppliersPage() {
  usePerformanceMonitor('SuppliersPage')

  const { data: suppliers, loading, error, refetch } = useTauriData(
    'get_suppliers',
    { includeInactive: false },
    {
      ttl: CACHE_TTL.MEDIUM,
      refetchOnMount: true,
      onError: (error) => {
        console.error('Failed to fetch suppliers:', error)
        toast.error('Failed to load suppliers')
      }
    }
  )

  if (loading) {
    return <OptimizedSkeleton count={5} height="h-16" />
  }

  return (
    <OptimizedDataDisplay
      data={suppliers || []}
      title="Suppliers"
      error={error?.message}
      emptyMessage="No suppliers found"
      renderItem={(supplier) => (
        <div key={supplier.id} className="supplier-item">
          <h3>{supplier.name}</h3>
          <p>{supplier.email}</p>
          <p>{supplier.phone}</p>
        </div>
      )}
    />
  )
}
```

### Complete Example: Optimized Form with Validation

```typescript
import React from 'react'
import { useOptimizedForm } from '@/hooks/usePerformance'
import { OptimizedButton, OptimizedCard } from '@/components/performance/OptimizedComponents'
import { usePerformanceMonitor } from '@/hooks/usePerformance'

function UserForm({ onSubmit, initialData }) {
  usePerformanceMonitor('UserForm')

  const { data, errors, isValidating, updateData, reset, validate } = useOptimizedForm(
    initialData || { name: '', email: '', role: '' },
    {
      debounceMs: 300,
      validateOnChange: true,
      validateFn: (data) => {
        const errors = []
        if (!data.name.trim()) errors.push('Name is required')
        if (!data.email.trim()) errors.push('Email is required')
        if (!data.email.includes('@')) errors.push('Invalid email format')
        if (!data.role) errors.push('Role is required')
        return errors.length > 0 ? errors : null
      }
    }
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    const validationErrors = await validate()
    if (!validationErrors) {
      await onSubmit(data)
    }
  }

  return (
    <OptimizedCard title="User Form">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label>Name</label>
          <input
            type="text"
            value={data.name}
            onChange={(e) => updateData({ name: e.target.value })}
            className="w-full p-2 border rounded"
          />
          {errors.includes('Name is required') && (
            <p className="text-red-500 text-sm">Name is required</p>
          )}
        </div>

        <div>
          <label>Email</label>
          <input
            type="email"
            value={data.email}
            onChange={(e) => updateData({ email: e.target.value })}
            className="w-full p-2 border rounded"
          />
          {errors.includes('Email is required') && (
            <p className="text-red-500 text-sm">Email is required</p>
          )}
          {errors.includes('Invalid email format') && (
            <p className="text-red-500 text-sm">Invalid email format</p>
          )}
        </div>

        <div>
          <label>Role</label>
          <select
            value={data.role}
            onChange={(e) => updateData({ role: e.target.value })}
            className="w-full p-2 border rounded"
          >
            <option value="">Select role</option>
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </select>
          {errors.includes('Role is required') && (
            <p className="text-red-500 text-sm">Role is required</p>
          )}
        </div>

        <div className="flex space-x-2">
          <OptimizedButton type="submit" loading={isValidating}>
            {isValidating ? 'Validating...' : 'Submit'}
          </OptimizedButton>
          <OptimizedButton type="button" onClick={reset} variant="outline">
            Reset
          </OptimizedButton>
        </div>
      </form>
    </OptimizedCard>
  )
}
```

## Best Practices

### 1. Cache Strategy

- Use **memory cache** for frequently accessed data
- Use **session cache** for user preferences and temporary data
- Use **persistent cache** for rarely changing data
- Use **smart cache** for automatic fallback

### 2. Performance Monitoring

- Monitor component render counts
- Track memory usage
- Monitor cache hit rates
- Use performance transitions for heavy operations

### 3. Bundle Optimization

- Split code into logical chunks
- Lazy load heavy components
- Preload critical chunks
- Monitor bundle sizes

### 4. Memory Management

- Register cleanup callbacks
- Clear caches when memory usage is high
- Unmount unused components
- Avoid memory leaks in event listeners

### 5. Component Optimization

- Use memoized components for expensive renders
- Implement proper loading states
- Handle errors gracefully
- Use debounced updates for forms

## Testing

### Performance Test Component

Use the `PerformanceTest` component to test all features:

```typescript
import PerformanceTest from '@/components/performance/PerformanceTest'

function TestPage() {
  return <PerformanceTest />
}
```

### Manual Testing

```typescript
// Test cache performance
const start = performance.now();
for (let i = 0; i < 1000; i++) {
  cache.memory.set(`test-${i}`, { data: i });
}
const end = performance.now();
console.log(`Cache write: ${end - start}ms`);

// Test memory usage
const memoryUsage = MemoryManager.getMemoryUsage();
console.log('Memory usage:', memoryUsage);

// Test bundle analysis
const bundleStats = BundleAnalyzer.getBundleStats();
console.log('Bundle stats:', bundleStats);
```

## Configuration

### Cache Configuration

```typescript
// Global cache configuration
const cacheConfig = {
  ttl: CACHE_TTL.MEDIUM, // Default TTL
  maxSize: 1000, // Maximum cache size
  namespace: 'import-manager', // Storage namespace
};

// Initialize with custom config
const customCache = new CacheManager(cacheConfig);
```

### Performance Monitoring Configuration

```typescript
// Initialize performance monitoring
import { initializePerformanceMonitoring } from '@/lib/performance';

// Call in your app initialization
initializePerformanceMonitoring();
```

### Memory Management Configuration

```typescript
// Set memory threshold
MemoryManager.setMemoryThreshold(0.7); // 70%

// Register cleanup callbacks
MemoryManager.registerCleanup(() => {
  // Custom cleanup logic
});
```

### Bundle Analysis Configuration

```typescript
// Track custom chunks and modules
BundleAnalyzer.trackChunk('custom-chunk', size);
BundleAnalyzer.trackModule('custom-module', size);
```

## Conclusion

This performance optimization and caching system provides comprehensive tools for building high-performance React applications. By following the best practices and using the provided hooks and components, you can significantly improve your application's performance and user experience.

For more information, see the individual component documentation and the `PerformanceTest` component for interactive examples.
