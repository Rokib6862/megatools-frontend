// ============================================================
// MEGA TOOLS — LinksHubPage v4.4
// Add URLs — Quick + Message একসাথে
// REMOVED: Page header (title + tracking code) — not needed
// ============================================================
import React, { useState } from 'react';
import QuickLinksPage from './QuickLinksPage';
import MessageLinksPage from './MessageLinksPage';

export default function LinksHubPage() {
  const [activeTab, setActiveTab] = useState('quick');

  const tabBtn = (key, color) => {
    const active = activeTab === key;
    return {
      flex: 1,
      padding: '10px 14px',
      fontSize: 13,
      fontWeight: 700,
      borderRadius: 8,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      background: active ? color : 'var(--bg-secondary)',
      color: active ? '#fff' : 'var(--text-muted)',
      border: active ? 'none' : '1px solid var(--card-border)',
    };
  };

  return (
    <div style={{ padding: '12px 16px' }}>
      {/* TABS — Quick + Message only */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <button onClick={() => setActiveTab('quick')} style={tabBtn('quick', '#6366f1')}>
          ⚡ Quick External Action Link List
        </button>
        <button onClick={() => setActiveTab('message')} style={tabBtn('message', '#ec4899')}>
          💬 Message External Action Link List
        </button>
      </div>

      {/* CONTENT */}
      {activeTab === 'quick' && <QuickLinksPage />}
      {activeTab === 'message' && <MessageLinksPage />}
    </div>
  );
}
