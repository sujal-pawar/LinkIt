import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  /** Rendered instead of the children if any of them throws while rendering/mounting. */
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * Keeps a failing decorative piece (e.g. a WebGL background on a device or
 * browser without WebGL) from taking the whole app down with it. Without a
 * boundary, React unmounts the entire tree on an uncaught render error and the
 * user sees a blank page instead of a working create/join form.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[ErrorBoundary] falling back:", error.message, info.componentStack);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
