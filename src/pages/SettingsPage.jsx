import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

// ============================================================
// MEGA TOOLS — SettingsPage v1.3 (MOUNT FETCH + FORM HYDRATE)
// ============================================================
// FIX-SET1 (v1.2 — 3-TIER) retained.
//
// FIX-SET2 (v1.3 — MOUNT FETCH + FORM HYDRATE):
//   Root cause of "Settings form shows stale / empty values":
//     • The form was initialized from `user` once at mount.
//     • If AuthContext.user was still hydrating (or if another
//       tab had updated the profile), the form never re-synced
//       with the server. Saving would then overwrite fresh
//       data with the stale snapshot the tab still held.
//
//   This version:
//     • Initializes the form from `user` (already instant via
//       AuthContext v2.0 cache) — first paint is correct.
//     • Adds a silent `GET /auth/me` on mount that re-hydrates
//       the form from the canonical server payload. No spinner,
//       no layout shift — the fields simply reflect the truth
//       within one round-trip.
//     • Adds a `useEffect` on `user?._id + user?.updated_at` so
//       any subsequent /auth/me refresh (login, visibility
//       change, profile save elsewhere) re-syncs the form.
//     • Uses a `dirtyRef` guard: if the user has started typing
//       (dirty), a background refresh does NOT clobber their
//       in-progress edits.
//   No validation, save, or password logic changed.
// ============================================================

const VerifiedBadge = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="#38BDF8" style={{ flexShrink: 0 }}>
    <path
      fillRule="evenodd"
      d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
      clipRule="evenodd"
    />
  </svg>
);

const isVerified = (user) => user && user.status === 'active' && user.referralToken;
const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isValidBDPhone = (v) => /^01[0-9]{9}$/.test(v);

const FieldError = ({ msg }) =>
  msg ? (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        color: '#f85149',
        fontSize: 11,
        marginTop: 4,
        fontWeight: 500,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
      {msg}
    </span>
  ) : null;

export default function SettingsPage() {
  const { user, checkAuth } = useAuth();

  // FIX-SET2: initial values from AuthContext (instant hydrate)
  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    fullName: user?.fullName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    facebook: user?.facebook || '',
  });
  const [profileErrors, setProfileErrors] = useState({});

  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' });
  const [passwordErrors, setPasswordErrors] = useState({});

  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('success');
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // FIX-SET2: dirty guard so background refresh doesn't clobber edits
  const dirtyRef = useRef(false);
  const initialHydrateDoneRef = useRef(false);

  useEffect(() => {
    const h = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // FIX-SET2: on mount, silent /auth/me to hydrate the form from
  // the canonical server payload — no spinner, no layout shift.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get('/auth/me');
        if (cancelled) return;
        const u = r.data || {};
        if (!dirtyRef.current) {
          setProfileForm({
            name: u.name || '',
            fullName: u.fullName || '',
            email: u.email || '',
            phone: u.phone || '',
            facebook: u.facebook || '',
          });
        }
        initialHydrateDoneRef.current = true;
      } catch (_) {
        // Non-fatal — form stays on the AuthContext-cached values.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // FIX-SET2: whenever AuthContext refreshes user (login, visibility
  // change, profile save, silent /me), re-sync the form unless the
  // user has started typing.
  useEffect(() => {
    if (!user) return;
    if (dirtyRef.current) return;
    setProfileForm({
      name: user.name || '',
      fullName: user.fullName || '',
      email: user.email || '',
      phone: user.phone || '',
      facebook: user.facebook || '',
    });
  }, [
    user?._id,
    user?.updated_at,
    user?.name,
    user?.fullName,
    user?.email,
    user?.phone,
    user?.facebook,
  ]);

  const markDirty = () => {
    dirtyRef.current = true;
  };

  const profileFieldStyle = (errKey) => ({
    width: '100%',
    padding: '10px 12px',
    fontSize: 13,
    background: 'var(--bg)',
    color: 'var(--text)',
    border: `1px solid ${profileErrors[errKey] ? '#f85149' : 'var(--card-border)'}`,
    borderRadius: 6,
    boxShadow: profileErrors[errKey] ? '0 0 0 3px rgba(248,81,73,0.18)' : 'none',
    outline: 'none',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  });

  const pwFieldStyle = (errKey) => ({
    width: '100%',
    padding: '10px 12px',
    fontSize: 13,
    background: 'var(--bg)',
    color: 'var(--text)',
    border: `1px solid ${passwordErrors[errKey] ? '#f85149' : 'var(--card-border)'}`,
    borderRadius: 6,
    boxShadow: passwordErrors[errKey] ? '0 0 0 3px rgba(248,81,73,0.18)' : 'none',
    outline: 'none',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  });

  const validateProfile = () => {
    const errs = {};
    if (!profileForm.fullName.trim()) errs.fullName = 'Full name is required';
    if (!profileForm.name.trim()) errs.name = 'Display name is required';
    if (!profileForm.email.trim()) errs.email = 'Email is required';
    else if (!isValidEmail(profileForm.email.trim())) errs.email = 'Enter a valid email';
    if (profileForm.phone.trim() && !isValidBDPhone(profileForm.phone.trim())) {
      errs.phone = 'Enter valid BD number (11 digits)';
    }
    if (profileForm.facebook.trim() && !/^https?:\/\//i.test(profileForm.facebook.trim())) {
      errs.facebook = 'Must start with http:// or https://';
    }
    return errs;
  };

  const updateProfile = async (e) => {
    e.preventDefault();
    setMsg('');
    const errs = validateProfile();
    setProfileErrors(errs);
    if (Object.keys(errs).length > 0) {
      setMsg('Please fix the highlighted fields');
      setMsgType('error');
      return;
    }
    setProfileLoading(true);
    try {
      await api.put('/auth/profile', profileForm);
      setMsg('Profile updated!');
      setMsgType('success');
      // Successful save — clear dirty so next refresh re-hydrates
      dirtyRef.current = false;
      await checkAuth();
    } catch (err) {
      setMsg(err.response?.data?.message || 'Error updating profile');
      setMsgType('error');
    } finally {
      setProfileLoading(false);
      setTimeout(() => setMsg(''), 3000);
    }
  };

  const validatePassword = () => {
    const errs = {};
    if (!passwordForm.newPassword) errs.newPassword = 'New password is required';
    else if (passwordForm.newPassword.length < 6) errs.newPassword = 'Min 6 characters';
    if (!passwordForm.confirmPassword) errs.confirmPassword = 'Please confirm your password';
    else if (passwordForm.newPassword !== passwordForm.confirmPassword)
      errs.confirmPassword = 'Passwords do not match';
    return errs;
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setMsg('');
    const errs = validatePassword();
    setPasswordErrors(errs);
    if (Object.keys(errs).length > 0) {
      setMsg('Please fix the highlighted fields');
      setMsgType('error');
      return;
    }
    setPasswordLoading(true);
    try {
      await api.put('/auth/password', { newPassword: passwordForm.newPassword });
      setMsg('Password changed!');
      setMsgType('success');
      setPasswordForm({ newPassword: '', confirmPassword: '' });
    } catch (err) {
      setMsg(err.response?.data?.message || 'Error');
      setMsgType('error');
    } finally {
      setPasswordLoading(false);
      setTimeout(() => setMsg(''), 4000);
    }
  };

  const copyCode = (code, label) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setMsg(label + ' copied!');
    setMsgType('success');
    setTimeout(() => setMsg(''), 1500);
  };

  const getRoleBadge = () => {
    if (user?.role === 'owner') return { bg: 'rgba(248,113,113,0.15)', color: '#f87171' };
    if (user?.role === 'admin') return { bg: 'rgba(168,85,247,0.15)', color: '#a855f7' };
    return { bg: 'rgba(56,189,248,0.15)', color: '#38bdf8' };
  };
  const rb = getRoleBadge();
  const verified = isVerified(user);
  const isSmall = windowWidth < 600;

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{ marginBottom: 14 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          Account & Settings {verified && <VerifiedBadge size={18} />}
        </h2>
        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
          Manage your profile, security, and identity
        </p>
      </div>

      {msg && (
        <div
          style={{
            background: msgType === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
            color: msgType === 'success' ? 'var(--success)' : 'var(--danger)',
            padding: '8px 14px',
            borderRadius: 6,
            marginBottom: 14,
            fontSize: 12,
            fontWeight: 500,
            border: `1px solid ${msgType === 'success' ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
          }}
        >
          {msg}
        </div>
      )}

      <div
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: 12,
          padding: '14px 22px',
          marginBottom: 14,
        }}
      >
        <h3
          style={{
            color: 'var(--text)',
            fontSize: 14,
            fontWeight: 700,
            marginBottom: 10,
            paddingBottom: 10,
            borderBottom: '1px solid var(--card-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          Account Identity{' '}
          {verified && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10,
                fontWeight: 700,
                color: '#38BDF8',
                background: 'rgba(56,189,248,0.12)',
                padding: '3px 10px',
                borderRadius: 6,
              }}
            >
              <VerifiedBadge size={12} /> Verified
            </span>
          )}
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 24px', alignItems: 'center' }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '4px 12px',
              borderRadius: 6,
              background: rb.bg,
              color: rb.color,
              textTransform: 'capitalize',
            }}
          >
            {user?.role || 'user'}
          </span>
          <span style={{ color: 'var(--card-border)', fontSize: 16 }}>|</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Referral Token:</span>
          <code
            onClick={() => copyCode(user?.referralToken || '—', 'Referral token')}
            style={{
              color: user?.referralToken ? '#a78bfa' : '#64748b',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'Consolas, monospace',
              cursor: 'pointer',
              background: user?.referralToken ? 'rgba(167,139,250,0.08)' : 'rgba(100,116,139,0.08)',
              padding: '3px 8px',
              borderRadius: 4,
            }}
          >
            {user?.referralToken || '—'}
          </code>
          <span style={{ color: 'var(--card-border)', fontSize: 16 }}>|</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tracking:</span>
          <code
            onClick={() => copyCode(user?.trackingCode, 'Tracking code')}
            style={{
              color: '#4ade80',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'Consolas, monospace',
              cursor: 'pointer',
              background: 'rgba(74,222,128,0.08)',
              padding: '3px 8px',
              borderRadius: 4,
            }}
          >
            {user?.trackingCode || '—'}
          </code>
          <span style={{ color: 'var(--card-border)', fontSize: 16 }}>|</span>
          <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
            {user?.fullName || user?.name || '—'}
            {verified && <VerifiedBadge size={14} />}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isSmall ? '1fr' : '1fr 1fr', gap: 14 }}>
        <div
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: 12,
            padding: '18px 22px',
          }}
        >
          <h3
            style={{
              color: 'var(--text)',
              fontSize: 14,
              fontWeight: 700,
              marginBottom: 14,
              paddingBottom: 10,
              borderBottom: '1px solid var(--card-border)',
            }}
          >
            Account Information
          </h3>
          <form onSubmit={updateProfile} noValidate>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Full Name
                </label>
                <input
                  value={profileForm.fullName}
                  onChange={(e) => {
                    markDirty();
                    setProfileForm({ ...profileForm, fullName: e.target.value });
                    setProfileErrors({ ...profileErrors, fullName: '' });
                  }}
                  style={profileFieldStyle('fullName')}
                />
                <FieldError msg={profileErrors.fullName} />
              </div>
              <div>
                <label
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Display Name
                </label>
                <input
                  value={profileForm.name}
                  onChange={(e) => {
                    markDirty();
                    setProfileForm({ ...profileForm, name: e.target.value });
                    setProfileErrors({ ...profileErrors, name: '' });
                  }}
                  style={profileFieldStyle('name')}
                />
                <FieldError msg={profileErrors.name} />
              </div>
              <div>
                <label
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => {
                    markDirty();
                    setProfileForm({ ...profileForm, email: e.target.value });
                    setProfileErrors({ ...profileErrors, email: '' });
                  }}
                  style={profileFieldStyle('email')}
                />
                <FieldError msg={profileErrors.email} />
              </div>
              <div>
                <label
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Phone
                </label>
                <input
                  value={profileForm.phone}
                  onChange={(e) => {
                    markDirty();
                    setProfileForm({ ...profileForm, phone: e.target.value });
                    setProfileErrors({ ...profileErrors, phone: '' });
                  }}
                  style={profileFieldStyle('phone')}
                />
                <FieldError msg={profileErrors.phone} />
              </div>
              <div>
                <label
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Facebook URL
                </label>
                <input
                  value={profileForm.facebook}
                  onChange={(e) => {
                    markDirty();
                    setProfileForm({ ...profileForm, facebook: e.target.value });
                    setProfileErrors({ ...profileErrors, facebook: '' });
                  }}
                  style={profileFieldStyle('facebook')}
                />
                <FieldError msg={profileErrors.facebook} />
              </div>
            </div>
            <button
              type="submit"
              disabled={profileLoading}
              style={{
                marginTop: 10,
                padding: '9px 20px',
                fontSize: 12,
                fontWeight: 700,
                background: 'var(--accent)',
                color: '#000',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {profileLoading ? 'Saving...' : 'Update Profile'}
            </button>
          </form>
        </div>

        <div
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: 12,
            padding: '18px 22px',
          }}
        >
          <h3
            style={{
              color: 'var(--text)',
              fontSize: 14,
              fontWeight: 700,
              marginBottom: 14,
              paddingBottom: 10,
              borderBottom: '1px solid var(--card-border)',
            }}
          >
            Security & Password
          </h3>
          <form onSubmit={changePassword} noValidate>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  New Password
                </label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => {
                    setPasswordForm({ ...passwordForm, newPassword: e.target.value });
                    setPasswordErrors({ ...passwordErrors, newPassword: '' });
                  }}
                  style={pwFieldStyle('newPassword')}
                />
                <FieldError msg={passwordErrors.newPassword} />
              </div>
              <div>
                <label
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => {
                    setPasswordForm({ ...passwordForm, confirmPassword: e.target.value });
                    setPasswordErrors({ ...passwordErrors, confirmPassword: '' });
                  }}
                  style={pwFieldStyle('confirmPassword')}
                />
                <FieldError msg={passwordErrors.confirmPassword} />
              </div>
            </div>
            <button
              type="submit"
              disabled={passwordLoading}
              style={{
                marginTop: 10,
                padding: '9px 20px',
                fontSize: 12,
                fontWeight: 700,
                background: '#fbbf24',
                color: '#000',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {passwordLoading ? 'Changing...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
