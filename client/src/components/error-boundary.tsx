import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex-1 flex items-center justify-center p-8" data-testid="error-boundary-fallback">
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-destructive/10">
              <AlertTriangle className="w-7 h-7 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Something went wrong</h2>
              <p className="text-sm text-muted-foreground mt-1">
                An unexpected error occurred. Try refreshing the page or click retry below.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={this.handleRetry} data-testid="button-error-retry">
                <RefreshCw className="w-4 h-4 mr-1.5" />
                Retry
              </Button>
              <Button variant="outline" onClick={() => window.location.reload()} data-testid="button-error-reload">
                Reload Page
              </Button>
            </div>
            {this.state.error && (
              <details className="text-xs text-muted-foreground mt-2 w-full">
                <summary className="cursor-pointer">Technical details</summary>
                <pre className="mt-2 p-2 bg-muted rounded text-left overflow-auto max-h-32">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
