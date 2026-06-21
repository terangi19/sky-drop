"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class AwhinaErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Awhina component error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="rounded-2xl border border-sky-500/20 bg-zinc-950/50 p-4 light:border-sky-600/20 light:bg-white/95">
            <p className="text-sm text-gray-400 light:text-gray-600">
              Āwhina assistant is temporarily unavailable.
            </p>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
