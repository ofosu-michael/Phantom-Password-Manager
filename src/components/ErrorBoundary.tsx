import { HugeiconsIcon } from "@hugeicons/react";
import { Alert01Icon, Refresh01Icon } from "@hugeicons/core-free-icons";
import React, { Component, ErrorInfo, ReactNode } from "react";
import { motion } from "motion/react";

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

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center h-full bg-black px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 text-center"
          >
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
              <HugeiconsIcon icon={Alert01Icon} className="w-6 h-6 text-red-500" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-white">Something went wrong</h3>
              <p className="text-xs text-zinc-400">
                {this.state.error?.message || "An unexpected error occurred."}
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 bg-zinc-800 text-white text-xs font-semibold rounded-xl hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
            >
              <HugeiconsIcon icon={Refresh01Icon} className="w-3.5 h-3.5" />
              Reload App
            </button>
          </motion.div>
        </div>
      );
    }

    return this.props.children;
  }
}
