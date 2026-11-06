import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';

const ToastContext = createContext(null);

let toastId = 0;

const ICONS = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

const COLORS = {
  success: { bg: '#10b981', glow: 'rgba(16,185,129,0.3)' },
  error: { bg: '#ef4444', glow: 'rgba(239,68,68,0.3)' },
  warning: { bg: '#f59e0b', glow: 'rgba(245,158,11,0.3)' },
  info: { bg: '#3b82f6', glow: 'rgba(59,130,246,0.3)' },
};

// ============================================================
// PROVIDER
// ============================================================

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success', duration = 3000) => {
    const id = ++toastId;
    setToasts(prev => [...prev.slice(-4), { id, message, type, duration }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const toast = {
    success: (msg, dur) => addToast(msg, 'success', dur),
    error: (msg, dur) => addToast(msg, 'error', dur || 5000),
    warning: (msg, dur) => addToast(msg, 'warning', dur),
    info: (msg, dur) => addToast(msg, 'info', dur),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
        display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
      }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            style={{
              pointerEvents: 'auto',
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 20px', borderRadius: 10,
              fontSize: 13, fontWeight: 600, color: '#fff',
              background: COLORS[t.type].bg,
              boxShadow: `0 8px 24px ${COLORS[t.type].glow}`,
              animation: 'toastSlideIn 0.3s ease forwards',
              cursor: 'pointer', maxWidth: 380,
            }}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{ICONS[t.type]}</span>
            <span style={{ flex: 1 }}>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ============================================================
// HOOK
// ============================================================

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}