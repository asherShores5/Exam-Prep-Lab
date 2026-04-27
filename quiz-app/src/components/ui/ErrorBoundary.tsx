import React from 'react';
import { Card, CardContent } from './card';
import { Button } from './button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(error, errorInfo.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Card className="m-4">
          <CardContent className="p-6 space-y-4">
            <h3 className="text-lg font-semibold text-red-400">
              {this.props.fallbackTitle ?? 'Something went wrong'}
            </h3>
            {this.state.error && (
              <p className="text-sm text-gray-400">{this.state.error.message}</p>
            )}
            <Button onClick={this.handleReset}>Try Again</Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
