import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { AlertTriangle, RefreshCw, Home, Bug, Copy, X } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error) => void
  resetKey?: string | number
  showDetails?: boolean
  componentName?: string
}

interface State {
  hasError: boolean
  error: Error | null
  showDetails: boolean
}

export function AsyncErrorBoundary({
  children,
  fallback,
  onError,
  resetKey,
  showDetails: defaultShowDetails = false,
  componentName,
}: Props) {
  const [state, setState] = useState<State>({
    hasError: false,
    error: null,
    showDetails: defaultShowDetails,
  })

  useEffect(() => {
    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('AsyncErrorBoundary caught unhandled rejection:', event.reason)

      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason))

      setState({
        hasError: true,
        error,
        showDetails: defaultShowDetails,
      })

      if (onError) {
        onError(error)
      }

      logError(error, 'Unhandled Promise Rejection')

      // Prevent the default browser behavior
      event.preventDefault()
    }

    // Handle unhandled errors
    const handleError = (event: ErrorEvent) => {
      console.error('AsyncErrorBoundary caught error:', event.error)

      const error = event.error || new Error(event.message)

      setState({
        hasError: true,
        error,
        showDetails: defaultShowDetails,
      })

      if (onError) {
        onError(error)
      }

      logError(error, 'Unhandled Error')

      // Prevent the default browser behavior
      event.preventDefault()
    }

    // Add event listeners
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    window.addEventListener('error', handleError)

    // Cleanup function
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.removeEventListener('error', handleError)
    }
  }, [onError, defaultShowDetails])

  // Reset error state when resetKey changes
  useEffect(() => {
    if (resetKey !== undefined) {
      setState({
        hasError: false,
        error: null,
        showDetails: defaultShowDetails,
      })
    }
  }, [resetKey, defaultShowDetails])

  const logError = (error: Error, source: string) => {
    const errorData = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      componentName: componentName || 'Unknown',
      url: window.location.href,
      userAgent: navigator.userAgent,
      source,
    }

    console.error('Async Error Details:', errorData)

    // In a production app, you might want to send this to an error reporting service
  }

  const handleReset = () => {
    setState({
      hasError: false,
      error: null,
      showDetails: defaultShowDetails,
    })

    toast.success('Async error boundary reset successfully')
  }

  const handleReload = () => {
    window.location.reload()
  }

  const handleGoHome = () => {
    window.location.href = '/'
  }

  const handleCopyError = () => {
    const errorText = `Async Error: ${state.error?.message}\n\nStack Trace:\n${state.error?.stack}`

    navigator.clipboard
      .writeText(errorText)
      .then(() => {
        toast.success('Error details copied to clipboard')
      })
      .catch(() => {
        toast.error('Failed to copy error details')
      })
  }

  const toggleDetails = () => {
    setState((prev) => ({ ...prev, showDetails: !prev.showDetails }))
  }

  if (state.hasError) {
    // Use custom fallback if provided
    if (fallback) {
      return fallback
    }

    return (
      <div className="bg-background min-h-screen p-4">
        <div className="container mx-auto max-w-2xl py-8">
          <Card className="border-destructive">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="bg-destructive/10 flex h-10 w-10 items-center justify-center rounded-full">
                  <AlertTriangle className="text-destructive h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-destructive">Async Operation Failed</CardTitle>
                  <CardDescription>
                    {componentName ? (
                      <>Error in {componentName} async operation</>
                    ) : (
                      'An unexpected async error occurred'
                    )}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Async Error Details</AlertTitle>
                <AlertDescription>
                  {state.error?.message || 'Unknown async error occurred'}
                </AlertDescription>
              </Alert>

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleReset} variant="outline" size="sm">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Try Again
                </Button>
                <Button onClick={handleReload} variant="outline" size="sm">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reload Page
                </Button>
                <Button onClick={handleGoHome} variant="outline" size="sm">
                  <Home className="mr-2 h-4 w-4" />
                  Go Home
                </Button>
                <Button onClick={handleCopyError} variant="outline" size="sm">
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Error
                </Button>
              </div>

              <div className="space-y-2">
                <Button
                  onClick={toggleDetails}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Bug className="h-4 w-4" />
                    {state.showDetails ? 'Hide' : 'Show'} Technical Details
                  </span>
                  <X
                    className={`h-4 w-4 transition-transform ${state.showDetails ? 'rotate-45' : ''}`}
                  />
                </Button>

                {state.showDetails && (
                  <div className="bg-muted/50 space-y-3 rounded-md border p-3">
                    <div>
                      <Badge variant="secondary" className="mb-2">
                        Error Message
                      </Badge>
                      <pre className="text-muted-foreground text-sm">{state.error?.message}</pre>
                    </div>

                    <Separator />

                    <div>
                      <Badge variant="secondary" className="mb-2">
                        Stack Trace
                      </Badge>
                      <pre className="text-muted-foreground max-h-32 overflow-auto text-xs">
                        {state.error?.stack}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
