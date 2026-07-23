import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  attempt: number;
}

/**
 * Keeps an editor render failure recoverable. React otherwise removes the
 * failed subtree and the user is left with a blank application shell.
 */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  public state: AppErrorBoundaryState = {
    hasError: false,
    error: null,
    attempt: 0,
  };

  public static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled application render error", error, info);
  }

  private handleRetry = (): void => {
    this.setState((current) => ({
      hasError: false,
      error: null,
      attempt: current.attempt + 1,
    }));
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleGoHome = (): void => {
    window.location.assign("/");
  };

  public render(): ReactNode {
    if (!this.state.hasError) {
      return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
    }

    return (
      <main
        role="alert"
        style={{
          minHeight: "100%",
          display: "grid",
          placeItems: "center",
          padding: "32px",
          boxSizing: "border-box",
          background: "#f7f7f5",
          color: "#171717",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <section
          style={{
            width: "min(100%, 520px)",
            padding: "28px",
            border: "1px solid #d8d8d2",
            borderRadius: "8px",
            background: "#ffffff",
            boxShadow: "0 12px 32px rgba(20, 20, 16, 0.12)",
          }}
        >
          <h1 style={{ margin: "0 0 10px", fontSize: "24px" }}>
            The editor needs to recover
          </h1>
          <p style={{ margin: "0 0 20px", lineHeight: 1.5 }}>
            This action did not complete, but the application is still available.
            Retry the editor or reload the page to restore a clean canvas.
          </p>
          {import.meta.env.DEV && this.state.error ? (
            <pre
              style={{
                maxHeight: "160px",
                overflow: "auto",
                padding: "12px",
                background: "#f1f1ec",
                borderRadius: "6px",
                whiteSpace: "pre-wrap",
                fontSize: "12px",
              }}
            >
              {this.state.error.message}
            </pre>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <button type="button" onClick={this.handleRetry}>
              Retry editor
            </button>
            <button type="button" onClick={this.handleReload}>
              Reload page
            </button>
            <button type="button" onClick={this.handleGoHome}>
              Return home
            </button>
          </div>
        </section>
      </main>
    );
  }
}

export default AppErrorBoundary;
