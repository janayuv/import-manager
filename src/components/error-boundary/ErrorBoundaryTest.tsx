import { AlertTriangle, Bug, Database, FileText, Network, Zap } from 'lucide-react'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

import { ErrorBoundary, ErrorContexts, ModuleErrorBoundary, useErrorHandler } from './index'

// Component that throws a synchronous error
const SyncErrorComponent = ({ shouldError }: { shouldError: boolean }) => {
  if (shouldError) {
    throw new Error('This is a synchronous error for testing error boundaries')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bug className="h-5 w-5" />
          Synchronous Error Test
        </CardTitle>
        <CardDescription>This component will throw a synchronous error when triggered</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          Click the button below to trigger a synchronous error and test the ErrorBoundary component.
        </p>
      </CardContent>
    </Card>
  )
}

// Component that throws an asynchronous error
const AsyncErrorComponent = () => {
  const { handleError } = useErrorHandler({
    fallbackMessage: 'Async operation failed',
  })

  const triggerAsyncError = () => {
    // Simulate an async error
    setTimeout(() => {
      handleError(
        new Error('This is an asynchronous error for testing'),
        ErrorContexts.dataFetch('AsyncErrorComponent')
      )
    }, 100)
  }

  const triggerUnhandledRejection = () => {
    // This will be caught by AsyncErrorBoundary
    Promise.reject(new Error('Unhandled promise rejection for testing'))
  }

  const triggerNetworkError = () => {
    // Simulate a network error
    fetch('/api/nonexistent-endpoint')
      .then((response) => response.json())
      .catch((error) => {
        handleError(error, ErrorContexts.dataFetch('AsyncErrorComponent'))
      })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Asynchronous Error Test
        </CardTitle>
        <CardDescription>Test various types of asynchronous errors</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={triggerAsyncError}
            variant="outline"
            size="sm"
          >
            <Database className="mr-2 h-4 w-4" />
            Trigger Async Error
          </Button>
          <Button
            onClick={triggerUnhandledRejection}
            variant="outline"
            size="sm"
          >
            <Network className="mr-2 h-4 w-4" />
            Trigger Unhandled Rejection
          </Button>
          <Button
            onClick={triggerNetworkError}
            variant="outline"
            size="sm"
          >
            <FileText className="mr-2 h-4 w-4" />
            Trigger Network Error
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          These buttons will trigger different types of asynchronous errors to test the AsyncErrorBoundary.
        </p>
      </CardContent>
    </Card>
  )
}

// Component that simulates a module error
const ModuleErrorComponent = ({ shouldError }: { shouldError: boolean }) => {
  if (shouldError) {
    throw new Error('This is a module-level error for testing ModuleErrorBoundary')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Module Error Test
        </CardTitle>
        <CardDescription>This simulates a module-level error</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          This component will throw a module-level error when triggered, testing the ModuleErrorBoundary.
        </p>
      </CardContent>
    </Card>
  )
}

// Main test component
export const ErrorBoundaryTest = () => {
  const [syncError, setSyncError] = useState(false)
  const [moduleError, setModuleError] = useState(false)

  return (
    <div className="container mx-auto space-y-6 py-8">
      <div className="text-center">
        <h1 className="mb-2 text-3xl font-bold">Error Boundary Test Suite</h1>
        <p className="text-muted-foreground">Test the comprehensive error handling system</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Test 1: Synchronous Error Boundary */}
        <ErrorBoundary
          componentName="SyncErrorTest"
          showDetails={true}
        >
          <SyncErrorComponent shouldError={syncError} />
          <div className="mt-4">
            <Button
              onClick={() => setSyncError(true)}
              variant="destructive"
              size="sm"
            >
              <Bug className="mr-2 h-4 w-4" />
              Trigger Sync Error
            </Button>
          </div>
        </ErrorBoundary>

        {/* Test 2: Asynchronous Error Boundary */}
        <AsyncErrorComponent />

        {/* Test 3: Module Error Boundary */}
        <ModuleErrorBoundary
          moduleName="TestModule"
          showDetails={true}
          allowRetry={true}
          allowNavigation={true}
        >
          <ModuleErrorComponent shouldError={moduleError} />
          <div className="mt-4">
            <Button
              onClick={() => setModuleError(true)}
              variant="destructive"
              size="sm"
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Trigger Module Error
            </Button>
          </div>
        </ModuleErrorBoundary>

        {/* Test 4: Error Handler Hook */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bug className="h-5 w-5" />
              Error Handler Hook Test
            </CardTitle>
            <CardDescription>Test the useErrorHandler hook functionality</CardDescription>
          </CardHeader>
          <CardContent>
            <ErrorHandlerTest />
          </CardContent>
        </Card>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Test Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-2 font-semibold">Synchronous Error Test</h4>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>• Click "Trigger Sync Error" to test ErrorBoundary</li>
                <li>• Tests componentDidCatch functionality</li>
                <li>• Shows error recovery options</li>
              </ul>
            </div>
            <div>
              <h4 className="mb-2 font-semibold">Asynchronous Error Test</h4>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>• Click any async error button to test AsyncErrorBoundary</li>
                <li>• Tests unhandled promise rejection handling</li>
                <li>• Tests network error handling</li>
              </ul>
            </div>
            <div>
              <h4 className="mb-2 font-semibold">Module Error Test</h4>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>• Click "Trigger Module Error" to test ModuleErrorBoundary</li>
                <li>• Tests module-specific error handling</li>
                <li>• Shows module-specific recovery options</li>
              </ul>
            </div>
            <div>
              <h4 className="mb-2 font-semibold">Error Handler Hook Test</h4>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>• Tests useErrorHandler hook functionality</li>
                <li>• Tests error context and logging</li>
                <li>• Tests toast notifications</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Component to test the useErrorHandler hook
const ErrorHandlerTest = () => {
  const { handleError, handleAsyncError, wrapAsyncFunction } = useErrorHandler({
    fallbackMessage: 'Test error occurred',
    showToast: true,
    logToConsole: true,
  })

  const testSyncError = () => {
    try {
      throw new Error('Test synchronous error from hook')
    } catch (error) {
      handleError(error, ErrorContexts.validation('ErrorHandlerTest'))
    }
  }

  const testAsyncError = async () => {
    const result = await handleAsyncError(async () => {
      // Simulate an async operation that fails
      await new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Test async error from hook')), 100)
      })
    }, ErrorContexts.dataFetch('ErrorHandlerTest'))

    if (result) {
      console.log('Async operation succeeded:', result)
    }
  }

  const testWrappedFunction = async () => {
    const wrappedFn = wrapAsyncFunction(async (message: string) => {
      // Simulate an async operation that fails
      await new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message)), 100)
      })
    }, ErrorContexts.formSubmit('ErrorHandlerTest'))

    const result = await wrappedFn('Test wrapped function error')
    if (result) {
      console.log('Wrapped function succeeded:', result)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={testSyncError}
          variant="outline"
          size="sm"
        >
          <Bug className="mr-2 h-4 w-4" />
          Test Sync Error
        </Button>
        <Button
          onClick={testAsyncError}
          variant="outline"
          size="sm"
        >
          <Zap className="mr-2 h-4 w-4" />
          Test Async Error
        </Button>
        <Button
          onClick={testWrappedFunction}
          variant="outline"
          size="sm"
        >
          <FileText className="mr-2 h-4 w-4" />
          Test Wrapped Function
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        These buttons test different aspects of the useErrorHandler hook, including error contexts, toast notifications,
        and console logging.
      </p>
    </div>
  )
}

export default ErrorBoundaryTest
