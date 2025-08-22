# Error Boundary System

This directory contains a comprehensive error handling system for the Import Manager application, providing graceful error recovery and user-friendly error reporting.

## Components

### 1. ErrorBoundary

A class-based error boundary that catches React component errors and provides recovery options.

**Features:**

- Catches JavaScript errors in component tree
- Provides user-friendly error UI
- Offers recovery options (retry, reload, go home)
- Copy error details to clipboard
- Show/hide technical details
- Custom error logging

**Usage:**

```tsx
import { ErrorBoundary } from '@/components/error-boundary'
;<ErrorBoundary
  componentName="MyComponent"
  showDetails={process.env.NODE_ENV === 'development'}
  onError={(error, errorInfo) => {
    // Custom error handling
  }}
>
  <MyComponent />
</ErrorBoundary>
```

### 2. AsyncErrorBoundary

A functional error boundary that catches asynchronous errors and unhandled promise rejections.

**Features:**

- Catches unhandled promise rejections
- Catches unhandled errors
- Provides recovery options
- Prevents error spam with rate limiting
- Custom error logging

**Usage:**

```tsx
import { AsyncErrorBoundary } from '@/components/error-boundary'
;<AsyncErrorBoundary
  componentName="MyAsyncComponent"
  onError={(error) => {
    // Custom async error handling
  }}
>
  <MyAsyncComponent />
</AsyncErrorBoundary>
```

### 3. ModuleErrorBoundary

A specialized error boundary for individual modules/pages with module-specific error handling.

**Features:**

- Module-specific error messages
- Module-specific recovery options
- Navigation controls (go back)
- Module identification in error logs
- Customizable retry behavior

**Usage:**

```tsx
import { ModuleErrorBoundary } from '@/components/error-boundary'
;<ModuleErrorBoundary
  moduleName="Expenses"
  showDetails={process.env.NODE_ENV === 'development'}
  allowRetry={true}
  allowNavigation={true}
>
  <ExpensesPage />
</ModuleErrorBoundary>
```

## Hooks

### useErrorHandler

A custom hook that provides consistent error handling patterns throughout the application.

**Features:**

- Consistent error handling
- Error spam prevention
- Toast notifications
- Console logging
- Custom error contexts
- Async error wrapping

**Usage:**

```tsx
import { ErrorContexts, useErrorHandler } from '@/components/error-boundary'

const MyComponent = () => {
  const { handleError, handleAsyncError, wrapAsyncFunction } = useErrorHandler({
    fallbackMessage: 'Something went wrong',
    showToast: true,
    logToConsole: true,
  })

  // Handle synchronous errors
  const handleClick = () => {
    try {
      // Some operation that might fail
    } catch (error) {
      handleError(error, ErrorContexts.dataFetch('MyComponent'))
    }
  }

  // Handle asynchronous errors
  const loadData = async () => {
    const result = await handleAsyncError(async () => {
      const data = await fetch('/api/data')
      return data.json()
    }, ErrorContexts.dataFetch('MyComponent'))

    if (result) {
      // Handle success
    }
  }

  // Wrap async functions
  const wrappedFetch = wrapAsyncFunction(async (url: string) => {
    const response = await fetch(url)
    return response.json()
  }, ErrorContexts.dataFetch('MyComponent'))

  return <div>...</div>
}
```

## Error Contexts

Predefined error contexts for common operations:

```tsx
export const ErrorContexts = {
  dataFetch: (componentName: string) => ({ componentName, operation: 'Data Fetch' }),
  dataSave: (componentName: string) => ({ componentName, operation: 'Data Save' }),
  dataDelete: (componentName: string) => ({ componentName, operation: 'Data Delete' }),
  formSubmit: (componentName: string) => ({ componentName, operation: 'Form Submit' }),
  fileUpload: (componentName: string) => ({ componentName, operation: 'File Upload' }),
  fileDownload: (componentName: string) => ({ componentName, operation: 'File Download' }),
  navigation: (componentName: string) => ({ componentName, operation: 'Navigation' }),
  validation: (componentName: string) => ({ componentName, operation: 'Validation' }),
  authentication: (componentName: string) => ({ componentName, operation: 'Authentication' }),
  authorization: (componentName: string) => ({ componentName, operation: 'Authorization' }),
}
```

## Integration Examples

### 1. App-Level Error Boundaries

```tsx
// src/App.tsx
import { AsyncErrorBoundary, ErrorBoundary } from '@/components/error-boundary'

function App() {
  return (
    <AsyncErrorBoundary componentName="App">
      <ErrorBoundary
        componentName="App"
        showDetails={process.env.NODE_ENV === 'development'}
      >
        <Router>
          <Routes>{/* Your routes */}</Routes>
        </Router>
      </ErrorBoundary>
    </AsyncErrorBoundary>
  )
}
```

### 2. Page-Level Error Boundaries

```tsx
// src/pages/expenses.tsx
import { ModuleErrorBoundary } from '@/components/error-boundary'

const ExpensesPage = () => {
  return (
    <ModuleErrorBoundary
      moduleName="Expenses"
      showDetails={process.env.NODE_ENV === 'development'}
    >
      {/* Page content */}
    </ModuleErrorBoundary>
  )
}
```

### 3. Component-Level Error Handling

```tsx
// src/components/expenses/expense-form.tsx
import { ErrorContexts, useErrorHandler } from '@/components/error-boundary'

const ExpenseForm = () => {
  const { handleAsyncError } = useErrorHandler({
    fallbackMessage: 'Failed to save expense',
  })

  const handleSubmit = async (data: ExpenseData) => {
    const result = await handleAsyncError(async () => {
      return await invoke('save_expense', { data })
    }, ErrorContexts.formSubmit('ExpenseForm'))

    if (result) {
      // Handle success
    }
  }

  return <form onSubmit={handleSubmit}>...</form>
}
```

## Error Recovery Strategies

### 1. Automatic Recovery

- Error boundaries can automatically reset and retry operations
- Async error boundaries can recover from temporary network issues
- Module error boundaries can reload specific modules

### 2. User-Initiated Recovery

- **Retry**: Attempt the operation again
- **Reload**: Refresh the entire page
- **Go Back**: Navigate to the previous page
- **Go Home**: Navigate to the dashboard
- **Copy Error**: Copy error details for support

### 3. Development vs Production

- **Development**: Show technical details, full error information
- **Production**: User-friendly messages, minimal technical details

## Best Practices

### 1. Error Boundary Placement

- Place `AsyncErrorBoundary` at the app level
- Place `ErrorBoundary` around major sections
- Place `ModuleErrorBoundary` around individual pages
- Use `useErrorHandler` in components for specific error handling

### 2. Error Context

- Always provide meaningful error contexts
- Use predefined contexts when possible
- Include component/module names for better debugging

### 3. User Experience

- Provide clear, actionable error messages
- Offer multiple recovery options
- Prevent error spam with rate limiting
- Show loading states during recovery

### 4. Error Logging

- Log errors with sufficient context
- Include timestamps and user information
- Prepare for integration with error reporting services
- Respect user privacy in error logs

## Future Enhancements

### 1. Error Reporting Integration

- Sentry integration for error tracking
- Custom error reporting service
- Error analytics and monitoring

### 2. Advanced Recovery

- Automatic retry with exponential backoff
- Circuit breaker pattern for failing operations
- Graceful degradation for non-critical features

### 3. User Feedback

- Error reporting form for users
- Error categorization and prioritization
- User-initiated error reports

## Testing Error Boundaries

### 1. Manual Testing

```tsx
// Force an error to test error boundary
const TestComponent = () => {
  const [shouldError, setShouldError] = useState(false)

  if (shouldError) {
    throw new Error('Test error for error boundary')
  }

  return <button onClick={() => setShouldError(true)}>Trigger Error</button>
}
```

### 2. Async Error Testing

```tsx
// Test async error boundary
const TestAsyncComponent = () => {
  const triggerAsyncError = () => {
    Promise.reject(new Error('Test async error'))
  }

  return <button onClick={triggerAsyncError}>Trigger Async Error</button>
}
```

This error boundary system provides comprehensive error handling for the Import Manager application, ensuring a robust and user-friendly experience even when errors occur.
