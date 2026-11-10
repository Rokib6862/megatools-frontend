import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { isValidEmail, isValidBDPhone } from '../utils/helpers';

// ============================================================
// MEGA TOOLS — LOGIN PAGE v1.9 (FRIENDLY ERRORS + REMEMBER EMAIL)
// ============================================================
// FIX-LP1..LP12 retained.
//
// FIX-LP13 (v1.9 — FRIENDLY AUTH ERROR MESSAGES):
//   Root cause of "login fails silently / shows only 'Login failed'":
//     • handleLogin() displayed `err.message || 'Login failed'`.
//       On a browser network/CORS error, err.message is either an
//       opaque Axios string ("Network Error") or empty — neither
//       actionable for the user.
//     • Same problem on referral signup.
//   Fix:
//     • New helper formatAuthError(err) maps the shape of the
//       error to a clear, user-facing sentence:
//         – HTTP 400/401/403/429 → use server message verbatim
//         – Network / CORS / ERR_NETWORK → "Cannot reach server.
//           Please check your connection and try again."
//         – Timeout → "Server is taking too long. Please try again."
//         – Fallback → "Login failed. Please try again."
//     • handleLogin and handleReferralSignup both route their
//       catch through formatAuthError.
//   No layout, validation, referral-token, owner-hint, or
//   "remember email" behaviour changed — this file is byte-
//   identical to v1.8 everywhere except the two catch blocks
//   and the new helper.
// ============================================================

const MAX_NAME_WORDS = 12;
const REMEMBER_EMAIL_KEY = 'megatools_last_email_v1';

function readRememberedEmail() {
  try {
    if (typeof localStorage === 'undefined') return '';
    const v = localStorage.getItem(REMEMBER_EMAIL_KEY);
    return typeof v === 'string' ? v : '';
  } catch (_) {
    return '';
  }
}

function writeRememberedEmail(email) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!email || typeof email !== 'string') return;
    localStorage.setItem(REMEMBER_EMAIL_KEY, email.trim());
  } catch (_) {}
}

// FIX-LP13: friendly auth error helper.
function formatAuthError(err, fallback = 'Login failed. Please try again.') {
  try {
    if (!err) return fallback;

    // If the request reached the server, use the server's message.
    const status = err.response?.status;
    const serverMsg = err.response?.data?.message;
    if (serverMsg && typeof serverMsg === 'string' && serverMsg.trim()) {
      return serverMsg.trim();
    }

    if (status === 429) {
      return 'Too many attempts. Please wait a minute and try again.';
    }
    if (status === 403) {
      return 'Your account cannot log in right now. Please contact support.';
    }
    if (status === 401) {
      return 'Session invalid. Please try again.';
    }
    if (status === 400) {
      return 'Please check your email and password.';
    }
    if (status >= 500) {
      return 'Server is temporarily unavailable. Please try again in a moment.';
    }

    // Network/CORS/timeout errors — no response object.
    const code = err.code || '';
    const name = err.name || '';
    if (code === 'ERR_NETWORK' || code === 'ECONNABORTED' || name === 'NetworkError') {
      return 'Cannot reach server. Please check your connection and try again.';
    }
    if (
      code === 'ECONNABORTED' ||
      name === 'TimeoutError' ||
      (err.message || '').toLowerCase().includes('timeout')
    ) {
      return 'Server is taking too long. Please try again.';
    }
    if ((err.message || '').toLowerCase().includes('network')) {
      return 'Cannot reach server. Please check your connection and try again.';
    }

    return fallback;
  } catch (_) {
    return fallback;
  }
}

const countWords = (str) => {
  const s = String(str || '').trim();
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
};

const FieldError = ({ msg }) =>
  msg ? (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        color: '#f87171',
        fontSize: 10.5,
        marginTop: 2,
        fontWeight: 500,
      }}
    >
      <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
      {msg}
    </span>
  ) : null;

export default function LoginPage() {
  const { username: paramUsername } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { login, signup } = useAuth();

  const [referralToken, setReferralToken] = useState('');
  const [viewport, setViewport] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 1200,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = params.get('ref');
    if (ref) {
      setReferralToken(ref.toUpperCase());
      setShowSignup(true);
    }
  }, [location.search]);

  // FIX-LP12: warm-ping effect removed entirely.

  // FIX-LP12: remember email — hydrate once from localStorage
  const [email, setEmail] = useState(() => readRememberedEmail());
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginFieldErrors, setLoginFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const [showSignup, setShowSignup] = useState(false);
  const [signupData, setSignupData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [signupErrors, setSignupErrors] = useState({});
  const [signupGeneralError, setSignupGeneralError] = useState('');

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState(false);

  const [ownerHint, setOwnerHint] = useState('');
  useEffect(() => {
    if (!paramUsername) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get('/auth/check-owner/' + encodeURIComponent(paramUsername));
        if (!cancelled && r?.data?.exists) {
          setOwnerHint(`Signing in as ${r.data.ownerName || paramUsername}`);
        }
      } catch (_) {}
    })();
    return () => {
      cancelled = true;
    };
  }, [paramUsername]);

  // FIX-LP10: enforce 12-word limit on name input
  const handleNameChange = (value) => {
    const trimmed = String(value || '');
    const words = trimmed.trim().split(/\s+/).filter(Boolean);
    if (words.length > MAX_NAME_WORDS) {
      const clipped = words.slice(0, MAX_NAME_WORDS).join(' ');
      setSignupData((prev) => ({ ...prev, name: clipped }));
    } else {
      setSignupData((prev) => ({ ...prev, name: trimmed }));
    }
    setSignupErrors((prev) => ({ ...prev, name: '' }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoginError('');
    const errs = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) errs.email = 'Email is required';
    else if (!isValidEmail(trimmedEmail)) errs.email = 'Please enter a valid email';
    if (!password) errs.password = 'Password is required';
    setLoginFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setLoading(true);
    try {
      await login(trimmedEmail, password);
      // FIX-LP12: remember successful email for next visit
      writeRememberedEmail(trimmedEmail);
      navigate('/');
    } catch (err) {
      // FIX-LP13: friendly error message.
      setLoginError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReferralSignup = async () => {
    if (loading) return;
    const errors = {};
    if (!signupData.name.trim()) errors.name = 'Full name is required';
    else if (countWords(signupData.name) > MAX_NAME_WORDS)
      errors.name = `Name must be 12 words or fewer`;
    if (!signupData.email.trim()) errors.email = 'Email is required';
    else if (!isValidEmail(signupData.email.trim())) errors.email = 'Invalid email';
    if (!signupData.phone.trim()) errors.phone = 'Phone is required';
    else if (!isValidBDPhone(signupData.phone.trim())) errors.phone = 'Enter valid BD number';
    if (!signupData.password) errors.password = 'Password is required';
    else if (signupData.password.length < 6) errors.password = 'At least 6 characters';
    if (!signupData.confirmPassword) errors.confirmPassword = 'Confirm your password';
    else if (signupData.password !== signupData.confirmPassword)
      errors.confirmPassword = 'Passwords do not match';

    setSignupErrors(errors);
    if (Object.keys(errors).length > 0) {
      setSignupGeneralError('Please fix the errors above');
      return;
    }

    setSignupGeneralError('');
    setLoading(true);
    try {
      const trimmedEmail = signupData.email.trim();
      await signup({
        ...signupData,
        email: trimmedEmail,
        phone: signupData.phone.trim(),
        name: signupData.name.trim(),
        referralToken: referralToken,
      });
      await login(trimmedEmail, signupData.password);
      // FIX-LP12: remember email after successful referral signup too
      writeRememberedEmail(trimmedEmail);
      navigate('/');
    } catch (err) {
      // FIX-LP13: friendly error message.
      setSignupGeneralError(formatAuthError(err, 'Signup failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotMsg('');
    setForgotError(false);
    setForgotSuccess(false);
    const t = forgotEmail.trim();
    if (!t || !isValidEmail(t)) {
      setForgotMsg('Valid email required');
      setForgotError(true);
      return;
    }
    setForgotLoading(true);
    try {
      const r = await api.post('/auth/forgot-password', { email: t });
      setForgotSuccess(true);
      setForgotMsg(r.data.message || 'Password reset successfully!');
    } catch (err) {
      setForgotError(true);
      setForgotMsg(formatAuthError(err, 'Could not send reset email. Please try again.'));
    } finally {
      setForgotLoading(false);
    }
  };

  const resetForgot = () => {
    setShowForgot(false);
    setForgotMsg('');
    setForgotSuccess(false);
    setForgotError(false);
  };

  const w = viewport.w;
  const h = viewport.h;
  const isTiny = w < 380 || h < 640;
  const isMobile = w < 500;
  const isShort = h < 720;

  const compact = isMobile || isShort || isTiny;

  const cardWidth = w < 360 ? '100%' : w < 500 ? '94%' : '440px';
  const cardPad = compact ? '16px 14px' : '28px 26px';
  const cardRadius = compact ? 12 : 18;
  const titleSize = isTiny ? 16 : isMobile ? 18 : 22;
  const subSize = isTiny ? 10 : isMobile ? 11 : 12;
  const inpPad = isTiny ? '8px 10px' : compact ? '9px 11px' : '11px 13px';
  const inpFont = isTiny ? 12 : compact ? 12.5 : 13.5;
  const gapSize = isTiny ? 6 : compact ? 8 : 12;
  const btnPad = isTiny ? '9px' : compact ? '10px' : '11px';
  const btnFont = isTiny ? 12 : compact ? 13 : 14;

  const reqRowGap = isTiny ? 2 : compact ? 3 : 5;
  const reqLabelSize = isTiny ? 9 : compact ? 10 : 11;
  const reqHintSize = isTiny ? 8.5 : compact ? 9.5 : 10.5;

  const S = {
    page: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100vh',
      minHeight: '100vh',
      maxHeight: '100vh',
      background: '#0F172A',
      padding: compact ? 8 : 16,
      position: 'relative',
      overflow: 'hidden',
      boxSizing: 'border-box',
    },
    card: {
      background: 'rgba(255,255,255,0.03)',
      backdropFilter: 'blur(40px)',
      border: '2px solid rgba(10,240,236,0.5)',
      borderRadius: cardRadius,
      padding: cardPad,
      width: cardWidth,
      maxWidth: '100%',
      maxHeight: '100%',
      overflow: 'hidden',
      boxShadow: '0 0 30px rgba(10,240,236,0.25), 0 8px 40px rgba(0,0,0,0.6)',
      position: 'relative',
      zIndex: 1,
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
    },
    title: {
      fontSize: titleSize,
      fontWeight: 700,
      color: '#fff',
      textAlign: 'center',
      marginBottom: compact ? 2 : 4,
      lineHeight: 1.2,
    },
    sub: {
      fontSize: subSize,
      color: 'rgba(255,255,255,0.45)',
      textAlign: 'center',
      marginBottom: compact ? 8 : 14,
      lineHeight: 1.3,
    },
    hint: {
      fontSize: 10.5,
      color: '#38bdf8',
      textAlign: 'center',
      marginBottom: compact ? 6 : 10,
      fontWeight: 600,
    },
    err: {
      padding: '6px 10px',
      background: 'rgba(248,113,113,0.08)',
      color: '#f87171',
      borderRadius: 6,
      fontSize: compact ? 10.5 : 11.5,
      marginBottom: compact ? 8 : 12,
      textAlign: 'center',
      border: '1px solid rgba(248,113,113,0.15)',
    },
    ok: {
      padding: '10px 14px',
      background: 'rgba(16,185,129,0.1)',
      color: '#4ade80',
      borderRadius: 8,
      fontSize: 12,
      marginBottom: 12,
      textAlign: 'center',
      border: '1px solid rgba(16,185,129,0.25)',
      lineHeight: 1.5,
    },
    inp: {
      width: '100%',
      padding: inpPad,
      fontSize: inpFont,
      background: 'rgba(255,255,255,0.04)',
      color: '#fff',
      border: '1px solid rgba(10,240,236,0.3)',
      borderRadius: 6,
      outline: 'none',
      boxSizing: 'border-box',
    },
    inpErr: {
      width: '100%',
      padding: inpPad,
      fontSize: inpFont,
      background: 'rgba(255,255,255,0.04)',
      color: '#fff',
      border: '1px solid #f85149',
      borderRadius: 6,
      outline: 'none',
      boxSizing: 'border-box',
      boxShadow: '0 0 0 2px rgba(248,81,73,0.18)',
    },
    btn: {
      width: '100%',
      padding: btnPad,
      fontSize: btnFont,
      fontWeight: 700,
      background: 'rgba(10,240,236,0.1)',
      color: '#0AF0EC',
      border: '2px solid rgba(10,240,236,0.7)',
      borderRadius: 6,
      cursor: 'pointer',
      boxShadow: '0 0 20px rgba(10,240,236,0.3)',
      marginTop: 4,
    },
  };

  if (showForgot)
    return (
      <div style={S.page}>
        <div style={S.card}>
          {forgotSuccess ? (
            <>
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: compact ? 34 : 42 }}>📧</span>
              </div>
              <h2 style={S.title}>Check Your Email</h2>
              <p style={{ ...S.sub, marginBottom: 10 }}>A new password has been sent to:</p>
              <p
                style={{
                  color: '#4ade80',
                  fontWeight: 600,
                  fontSize: compact ? 11.5 : 13,
                  textAlign: 'center',
                  marginBottom: 12,
                  wordBreak: 'break-all',
                }}
              >
                {forgotEmail.trim()}
              </p>
              {forgotMsg && <div style={S.ok}>{forgotMsg}</div>}
              <button onClick={resetForgot} style={S.btn}>
                ← Back to Login
              </button>
            </>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: compact ? 10 : 16 }}>
                <span style={{ fontSize: compact ? 30 : 38 }}>🔑</span>
              </div>
              <h2 style={S.title}>Forgot Password</h2>
              <p style={S.sub}>Enter your email for a new password</p>
              {forgotMsg && <div style={forgotError ? S.err : S.ok}>{forgotMsg}</div>}
              <form
                onSubmit={handleForgotPassword}
                style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 12 }}
              >
                <input
                  placeholder="Enter your email"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => {
                    setForgotEmail(e.target.value);
                    setForgotMsg('');
                    setForgotError(false);
                    setForgotSuccess(false);
                  }}
                  style={S.inp}
                />
                <button type="submit" disabled={forgotLoading} style={S.btn}>
                  {forgotLoading ? 'Sending...' : '📧 Send New Password'}
                </button>
              </form>
              <p
                style={{
                  textAlign: 'center',
                  marginTop: compact ? 12 : 18,
                  fontSize: compact ? 10.5 : 12,
                  color: 'rgba(255,255,255,0.4)',
                }}
              >
                <span
                  onClick={resetForgot}
                  style={{
                    color: '#0AF0EC',
                    cursor: 'pointer',
                    fontWeight: 800,
                    textDecoration: 'underline',
                  }}
                >
                  ← Back to Login
                </span>
              </p>
            </>
          )}
        </div>
      </div>
    );

  if (showSignup) {
    const nameWordCount = countWords(signupData.name);
    const nameOverLimit = nameWordCount > MAX_NAME_WORDS;
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={{ textAlign: 'center', marginBottom: compact ? 4 : 8 }}>
            <img
              src="https://res.cloudinary.com/shakilv875/image/upload/v1784334960/hjhjmh_bshbbh.png"
              alt=""
              style={{
                width: isTiny ? 32 : compact ? 40 : 52,
                height: isTiny ? 32 : compact ? 40 : 52,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '1.5px solid rgba(255,255,255,0.9)',
              }}
            />
          </div>
          <h2 style={S.title}>🔗 Referral Signup</h2>
          <p style={S.sub}>Create your verified account</p>

          {!referralToken && (
            <div
              style={{
                background: 'rgba(248,113,113,0.08)',
                border: '1px solid rgba(248,113,113,0.3)',
                borderRadius: 8,
                padding: '6px 10px',
                marginBottom: compact ? 6 : 12,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: compact ? 10 : 11, color: '#f87171', fontWeight: 600 }}>
                ⚠️ Valid referral link required
              </div>
            </div>
          )}

          <div
            style={{
              background: 'rgba(10,240,236,0.05)',
              border: '1px solid rgba(10,240,236,0.2)',
              borderRadius: 8,
              padding: isTiny ? '6px 8px' : compact ? '8px 10px' : '10px 12px',
              marginBottom: compact ? 8 : 14,
            }}
          >
            <div
              style={{
                fontSize: isTiny ? 9 : compact ? 10 : 11,
                fontWeight: 700,
                color: '#0AF0EC',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: isTiny ? 4 : 6,
              }}
            >
              📋 What you need to sign up
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: reqRowGap,
                color: 'rgba(255,255,255,0.82)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  fontSize: reqLabelSize,
                  lineHeight: 1.4,
                }}
              >
                <span style={{ color: '#4ade80', fontWeight: 800, flexShrink: 0 }}>✓</span>
                <span
                  style={{
                    fontWeight: 700,
                    color: '#e2e8f0',
                    minWidth: isTiny ? 60 : compact ? 70 : 82,
                    flexShrink: 0,
                  }}
                >
                  Full Name
                </span>
                <span style={{ fontSize: reqHintSize, color: 'rgba(255,255,255,0.55)' }}>
                  — Your display name (max 12 words)
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  fontSize: reqLabelSize,
                  lineHeight: 1.4,
                }}
              >
                <span style={{ color: '#4ade80', fontWeight: 800, flexShrink: 0 }}>✓</span>
                <span
                  style={{
                    fontWeight: 700,
                    color: '#e2e8f0',
                    minWidth: isTiny ? 60 : compact ? 70 : 82,
                    flexShrink: 0,
                  }}
                >
                  Email
                </span>
                <span style={{ fontSize: reqHintSize, color: 'rgba(255,255,255,0.55)' }}>
                  — Valid email address
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  fontSize: reqLabelSize,
                  lineHeight: 1.4,
                }}
              >
                <span style={{ color: '#4ade80', fontWeight: 800, flexShrink: 0 }}>✓</span>
                <span
                  style={{
                    fontWeight: 700,
                    color: '#e2e8f0',
                    minWidth: isTiny ? 60 : compact ? 70 : 82,
                    flexShrink: 0,
                  }}
                >
                  Phone
                </span>
                <span style={{ fontSize: reqHintSize, color: 'rgba(255,255,255,0.55)' }}>
                  — 11-digit BD number
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  fontSize: reqLabelSize,
                  lineHeight: 1.4,
                }}
              >
                <span style={{ color: '#4ade80', fontWeight: 800, flexShrink: 0 }}>✓</span>
                <span
                  style={{
                    fontWeight: 700,
                    color: '#e2e8f0',
                    minWidth: isTiny ? 60 : compact ? 70 : 82,
                    flexShrink: 0,
                  }}
                >
                  Password
                </span>
                <span style={{ fontSize: reqHintSize, color: 'rgba(255,255,255,0.55)' }}>
                  — At least 6 characters
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  fontSize: reqLabelSize,
                  lineHeight: 1.4,
                }}
              >
                <span style={{ color: '#818cf8', fontWeight: 800, flexShrink: 0 }}>🔗</span>
                <span
                  style={{
                    fontWeight: 700,
                    color: '#a5b4fc',
                    minWidth: isTiny ? 60 : compact ? 70 : 82,
                    flexShrink: 0,
                  }}
                >
                  Referral
                </span>
                <span style={{ fontSize: reqHintSize, color: 'rgba(165,180,252,0.7)' }}>
                  — Auto-detected from your link ✓
                </span>
              </div>
            </div>
          </div>

          {signupGeneralError && <div style={S.err}>{signupGeneralError}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: gapSize }}>
            <div>
              <input
                placeholder="Full Name * (max 12 words)"
                type="text"
                value={signupData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                style={signupErrors.name ? S.inpErr : S.inp}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 3,
                  fontSize: 10,
                }}
              >
                <span style={{ color: signupErrors.name ? '#f87171' : 'transparent' }}>
                  {signupErrors.name || ' '}
                </span>
                <span
                  style={{
                    color: nameOverLimit
                      ? '#f87171'
                      : nameWordCount >= 10
                        ? '#f59e0b'
                        : 'rgba(255,255,255,0.4)',
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {nameWordCount} / {MAX_NAME_WORDS} words
                </span>
              </div>
            </div>

            {[
              { p: 'Email *', k: 'email' },
              { p: 'Phone * (01XXXXXXXXX)', k: 'phone' },
              { p: 'Password * (min 6 chars)', k: 'password', t: 'password' },
              { p: 'Confirm Password *', k: 'confirmPassword', t: 'password' },
            ].map((f) => (
              <div key={f.k}>
                <input
                  placeholder={f.p}
                  type={f.t || 'text'}
                  value={signupData[f.k]}
                  onChange={(e) => {
                    setSignupData({ ...signupData, [f.k]: e.target.value });
                    setSignupErrors({ ...signupErrors, [f.k]: '' });
                  }}
                  style={signupErrors[f.k] ? S.inpErr : S.inp}
                />
                <FieldError msg={signupErrors[f.k]} />
              </div>
            ))}
            <button
              onClick={handleReferralSignup}
              disabled={loading || !referralToken}
              style={{
                ...S.btn,
                background: referralToken ? 'rgba(99,102,241,0.2)' : 'rgba(100,116,139,0.1)',
                color: referralToken ? '#818cf8' : '#64748b',
                border: referralToken
                  ? '1px solid rgba(99,102,241,0.4)'
                  : '1px solid rgba(100,116,139,0.2)',
                boxShadow: 'none',
              }}
            >
              {loading ? 'Creating...' : '✓ Create Account'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={{ textAlign: 'center', marginBottom: compact ? 10 : 16 }}>
          <img
            src="https://res.cloudinary.com/shakilv875/image/upload/v1784334960/hjhjmh_bshbbh.png"
            alt=""
            style={{
              width: isTiny ? 36 : compact ? 44 : 56,
              height: isTiny ? 36 : compact ? 44 : 56,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '1.5px solid rgba(255,255,255,0.9)',
            }}
          />
        </div>
        <h2 style={S.title}>Welcome back</h2>
        <p style={S.sub}>Sign in to your dashboard</p>
        {ownerHint && <div style={S.hint}>{ownerHint}</div>}
        {loginError && <div style={S.err}>{loginError}</div>}
        <form
          onSubmit={handleLogin}
          style={{ display: 'flex', flexDirection: 'column', gap: gapSize }}
          noValidate
        >
          <div>
            <input
              placeholder="Email"
              value={email}
              autoComplete="username"
              onChange={(e) => {
                setEmail(e.target.value);
                setLoginError('');
                setLoginFieldErrors({ ...loginFieldErrors, email: '' });
              }}
              style={loginFieldErrors.email ? S.inpErr : S.inp}
            />
            <FieldError msg={loginFieldErrors.email} />
          </div>
          <div>
            <input
              placeholder="Password"
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => {
                setPassword(e.target.value);
                setLoginError('');
                setLoginFieldErrors({ ...loginFieldErrors, password: '' });
              }}
              style={loginFieldErrors.password ? S.inpErr : S.inp}
            />
            <FieldError msg={loginFieldErrors.password} />
          </div>
          <button type="submit" disabled={loading} style={S.btn}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p style={{ textAlign: 'right', margin: '6px 0 0' }}>
          <span
            onClick={() => {
              setShowForgot(true);
              setForgotEmail(email);
            }}
            style={{
              color: '#fbbf24',
              cursor: 'pointer',
              fontSize: compact ? 10.5 : 12,
              fontWeight: 800,
              textDecoration: 'underline',
            }}
          >
            Forgot Password?
          </span>
        </p>
      </div>
    </div>
  );
}
