import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import './styles/index.css';

// ============================================================
// ERROR BOUNDARY
// ============================================================

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[App] Error:', error, errorInfo);
  }

  handleReload() {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', background: '#0d1117', color: '#c9d1d9',
          fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
          textAlign: 'center', padding: 20,
        }}>
          <div>
            <h1 style={{ fontSize: 48, color: '#f85149', marginBottom: 10 }}>!</h1>
            <h2 style={{ color: '#e6edf3', marginBottom: 10 }}>Something went wrong</h2>
            <p style={{ color: '#8b949e', marginBottom: 20, fontSize: 13 }}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={this.handleReload}
              style={{
                padding: '10px 24px', background: '#238636', color: '#fff',
                border: 'none', borderRadius: 6, cursor: 'pointer',
                fontSize: 14, fontWeight: 600,
              }}
            >
              Reload Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================
// MOUNT
// ============================================================

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error('[App] Root element not found!');
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>
  );
}