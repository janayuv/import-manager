import {
  AlertTriangle,
  ArrowLeft,
  Bug,
  Copy,
  RefreshCw,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface Props {
  children: ReactNode;
  moduleName: string;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKey?: string | number;
  showDetails?: boolean;
  allowRetry?: boolean;
  allowNavigation?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ModuleErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `ModuleErrorBoundary caught an error in ${this.props.moduleName}:`,
      error,
      errorInfo
    );

    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log error for debugging
    this.logError(error, errorInfo);
  }

  private logError = (error: Error, errorInfo: ErrorInfo) => {
    const errorData = {
      moduleName: this.props.moduleName,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    };

    console.error('Module Error Details:', errorData);
  };

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });

    toast.success(`${this.props.moduleName} module reset successfully`);
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoBack = () => {
    window.history.back();
  };

  private handleCopyError = () => {
    const errorText = `${this.props.moduleName} Module Error: ${this.state.error?.message}\n\nStack Trace:\n${this.state.error?.stack}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack}`;

    navigator.clipboard
      .writeText(errorText)
      .then(() => {
        toast.success('Error details copied to clipboard');
      })
      .catch(() => {
        toast.error('Failed to copy error details');
      });
  };

  private toggleDetails = () => {
    this.setState(prev => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="container mx-auto py-8">
          <Card className="border-destructive mx-auto max-w-2xl">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="bg-destructive/10 flex h-10 w-10 items-center justify-center rounded-full">
                  <AlertTriangle className="text-destructive h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-destructive">
                    {this.props.moduleName} Module Error
                  </CardTitle>
                  <CardDescription>
                    An error occurred while loading the {this.props.moduleName}{' '}
                    module
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error Details</AlertTitle>
                <AlertDescription>
                  {this.state.error?.message || 'Unknown error occurred'}
                </AlertDescription>
              </Alert>

              <div className="flex flex-wrap gap-2">
                {this.props.allowRetry !== false && (
                  <Button
                    onClick={this.handleReset}
                    variant="outline"
                    size="sm"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry Module
                  </Button>
                )}
                <Button onClick={this.handleReload} variant="outline" size="sm">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reload Page
                </Button>
                {this.props.allowNavigation !== false && (
                  <Button
                    onClick={this.handleGoBack}
                    variant="outline"
                    size="sm"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Go Back
                  </Button>
                )}
                <Button
                  onClick={this.handleCopyError}
                  variant="outline"
                  size="sm"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Error
                </Button>
              </div>

              {this.props.showDetails && (
                <div className="space-y-2">
                  <Button
                    onClick={this.toggleDetails}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <Bug className="h-4 w-4" />
                      {this.state.showDetails ? 'Hide' : 'Show'} Technical
                      Details
                    </span>
                    <X
                      className={`h-4 w-4 transition-transform ${this.state.showDetails ? 'rotate-45' : ''}`}
                    />
                  </Button>

                  {this.state.showDetails && (
                    <div className="bg-muted/50 space-y-3 rounded-md border p-3">
                      <div>
                        <Badge variant="secondary" className="mb-2">
                          Module
                        </Badge>
                        <pre className="text-muted-foreground text-sm">
                          {this.props.moduleName}
                        </pre>
                      </div>

                      <Separator />

                      <div>
                        <Badge variant="secondary" className="mb-2">
                          Error Message
                        </Badge>
                        <pre className="text-muted-foreground text-sm">
                          {this.state.error?.message}
                        </pre>
                      </div>

                      <Separator />

                      <div>
                        <Badge variant="secondary" className="mb-2">
                          Stack Trace
                        </Badge>
                        <pre className="text-muted-foreground max-h-32 overflow-auto text-xs">
                          {this.state.error?.stack}
                        </pre>
                      </div>

                      <Separator />

                      <div>
                        <Badge variant="secondary" className="mb-2">
                          Component Stack
                        </Badge>
                        <pre className="text-muted-foreground max-h-32 overflow-auto text-xs">
                          {this.state.errorInfo?.componentStack}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
