import React from 'react';
import { reportClientError } from './errorLogger.js';

export default class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    reportClientError(error, {
      errorType: 'React render error',
      componentStack: info?.componentStack || ''
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
          <section className="mx-auto max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-xl">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="mt-3 text-sm text-slate-300">The error has been recorded. Reload the page to try again.</p>
            <button
              className="mt-6 rounded-lg bg-cyan-400 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-300"
              onClick={() => window.location.reload()}
              type="button"
            >
              Reload page
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
