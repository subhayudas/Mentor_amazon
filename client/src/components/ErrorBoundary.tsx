import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import i18n from "@/lib/i18n";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

/**
 * Last-resort error surface above every provider. Copy comes from `i18n.t`
 * directly (no hooks in a class, and the LanguageProvider sits below us).
 * Focus moves to the heading on mount so keyboard and screen-reader users
 * land on the explanation, not on an empty page.
 */
export class ErrorBoundary extends Component<Props, State> {
  private headingRef: HTMLHeadingElement | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  componentDidUpdate(_: Props, prev: State) {
    if (this.state.hasError && !prev.hasError) this.headingRef?.focus();
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

      const t = i18n.t.bind(i18n);

      return (
        <main id="main" tabIndex={-1} className="flex min-h-screen items-center justify-center bg-background p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 text-center" role="alert">
            <span className="mx-auto grid size-10 place-items-center rounded-full bg-destructive-soft text-destructive">
              <AlertTriangle className="size-5" aria-hidden="true" />
            </span>
            <h1
              ref={(node) => {
                this.headingRef = node;
              }}
              tabIndex={-1}
              className="mt-4 text-h2-sm text-foreground [&:focus:not(:focus-visible)]:outline-none"
            >
              {t("common.somethingWentWrong")}
            </h1>
            <p className="mt-2 text-body-sm text-muted-foreground">{t("common.unexpectedError")}</p>
            {import.meta.env.DEV && this.state.error && (
              <div className="mt-4 max-h-48 overflow-auto rounded-md bg-muted p-4 text-start" dir="ltr">
                <p className="font-mono text-sm text-destructive">{this.state.error.message}</p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="mt-2 whitespace-pre-wrap text-caption text-muted-foreground">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button variant="outline" onClick={this.handleReset}>
                {t("common.tryAgain")}
              </Button>
              <Button variant="secondary" onClick={this.handleReload}>
                <RefreshCw aria-hidden="true" />
                {t("common.reloadPage")}
              </Button>
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
