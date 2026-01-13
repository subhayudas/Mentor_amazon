import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
    errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.setState({ error, errorInfo });
    }

    handleReset = () => {
        this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    };

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-screen flex items-center justify-center p-4 bg-background">
                    <Card className="max-w-lg w-full">
                        <CardHeader className="text-center">
                            <div className="flex justify-center mb-4">
                                <AlertTriangle className="w-12 h-12 text-destructive" />
                            </div>
                            <CardTitle className="text-xl">Something went wrong</CardTitle>
                            <CardDescription>
                                An unexpected error occurred. We apologize for the inconvenience.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {process.env.NODE_ENV === 'development' && this.state.error && (
                                <div className="p-4 bg-muted rounded-lg overflow-auto max-h-48">
                                    <p className="text-sm font-mono text-destructive">
                                        {this.state.error.message}
                                    </p>
                                    {this.state.errorInfo?.componentStack && (
                                        <pre className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">
                                            {this.state.errorInfo.componentStack}
                                        </pre>
                                    )}
                                </div>
                            )}
                            <div className="flex gap-3 justify-center">
                                <Button variant="outline" onClick={this.handleReset}>
                                    Try Again
                                </Button>
                                <Button onClick={this.handleReload}>
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Reload Page
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            );
        }

        return this.props.children;
    }
}
