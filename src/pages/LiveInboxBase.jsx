// ============================================================
// MEGA TOOLS — LiveInboxBase v56.6 (COUNT N-3 + 1-MIN COUNTDOWN)
// ============================================================
// FIX-B1..B23 retained from v56.5.
//
// FIX-B24 (v56.6 — 1-MINUTE EMPTY-OFFLINE COUNTDOWN):
//   Server-side sessionManager v11.4 now forces a session
//   Offline after 1 minute of no submissions (see FIX-SM9)
//   and deletes it on the very next statusMonitor tick
//   (EMPTY_SESSION_TTL_MS = 0). The client-side countdown
//   must match that 1-minute window so the user sees a
//   consistent 01:00 → 00:00 and the row disappears right
//   when the server removes it.
//
//   Change:
//     • EMPTY_OFFLINE_TTL_MS: 120 000 → 60 000 ms.
//   No other behaviour changed. CountBox, dropdown count,
//   stable offlineAt countdown, 3D pulse, memo comparator,
//   and all layout constants are byte-identical to v56.5.
// ============================================================
import React, { memo, useState, useEffect } from 'react';
import { getAvatarColor, getInitials } from '../utils/helpers';
import { useToast } from '../contexts/ToastContext';

export const PP = 25;

export const STORAGE_KEYS = { SUB_SEEN_PREFIX: 'megatools_sub_seen_' };
export const getSubSeen = (sid) => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.SUB_SEEN_PREFIX + sid) || '0');
  } catch {
    return 0;
  }
};
export const setSubSeen = (sid, v) =>
  localStorage.setItem(STORAGE_KEYS.SUB_SEEN_PREFIX + sid, JSON.stringify(v));

export const SYSTEM_FIELDS = [
  'step',
  'stepNumber',
  'attempt',
  'status',
  'collectedTypes',
  'screenResolution',
  'timestamp',
  'userAgent',
  'platform',
  'language',
  'timezone',
  'submittedAt',
  'source',
  'url',
  'currentUrl',
  'entryUrl',
  'browser',
];
export const isSystemField = (k) => SYSTEM_FIELDS.includes(k);

const TABLE_FIELDS_COUNT = 3;
const MORE_SEEN_PREFIX = 'megatools_more_seen_';

const COUNT_MIN_THRESHOLD = 3;

// FIX-B24: 1-minute empty-offline countdown (matches server
// sessionManager v11.4 EMPTY_SESSION_GRACE_MS).
const EMPTY_OFFLINE_TTL_MS = 60000;

export const getAllFormFields = (s) => {
  const subs = s?.submissions || [];
  const fields = [];
  let globalIndex = 0;
  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i];
    const keys = Object.keys(sub).filter((k) => !isSystemField(k) && k !== 'submittedAt');
    let localFieldNumber = 0;
    for (const key of keys) {
      globalIndex++;
      localFieldNumber++;
      fields.push({
        globalIndex,
        submissionIndex: i,
        submissionNumber: i + 1,
        fNumber: localFieldNumber,
        value: sub[key],
        key,
      });
    }
  }
  return fields;
};

export const getSubs = (s) => {
  const fields = getAllFormFields(s);
  return fields.map((f) => f.value);
};
export const getTotalSubCount = (s) => (s?.submissions || []).length;
export const getTotalFormDataCount = (s) => getAllFormFields(s).length;
export const getClickCount = (s) => s?.clicks || 0;
export const getFormCount = (s) => getAllFormFields(s).length;

export const findUserByTrackingCode = (users, tc) => {
  if (!users || !tc) return null;
  const ownerCode = tc.includes('_') ? tc.split('_')[0] : tc;

  let found = users.find((u) => u?.trackingCode === tc);
  if (found) return found;

  found = users.find((u) => u?.trackingCode === ownerCode);
  if (found) return found;

  let best = null;
  let bestLen = 0;
  for (const u of users) {
    const utc = u?.trackingCode || '';
    if (!utc) continue;
    if (tc === utc || tc.startsWith(utc + '_')) {
      if (utc.length > bestLen) {
        best = u;
        bestLen = utc.length;
      }
    }
  }
  if (best) return best;

  found = users.find((u) => u?.username === tc || u?.name === tc);
  if (found) return found;
  return null;
};

const ROW_H = 42;
const CELL_H = 34;
const CTRL_H = 26;

const ROW_BG_EVEN = '#1E293B';
const ROW_BG_ODD = '#1A2537';
const ROW_BG_HOVER = '#273549';
const ROW_BORDER = '#334155';
const CELL_TEXT = '#E2E8F0';
const CELL_MUTED = '#94A3B8';

const CTRL_BASE = {
  boxSizing: 'border-box',
  height: CTRL_H,
  lineHeight: '1',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const BTN_BASE = {
  ...CTRL_BASE,
  minWidth: 0,
  padding: '0 8px',
  fontSize: 10.5,
  fontWeight: 800,
  border: 'none',
  borderRadius: 3,
  cursor: 'pointer',
  color: '#fff',
  transition: 'all 0.15s ease',
  width: '100%',
};

export const BTN = {
  sessionA: { ...BTN_BASE, background: '#3B82F6' },
  sessionB: { ...BTN_BASE, background: '#DB2777' },
  sessionAClosed: { ...BTN_BASE, background: '#1D4ED8' },
  sessionBClosed: { ...BTN_BASE, background: '#9D174D' },
};

const TD = {
  boxSizing: 'border-box',
  height: CELL_H,
  padding: '0 3px',
  verticalAlign: 'middle',
  borderBottom: '1px solid ' + ROW_BORDER,
  textAlign: 'center',
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  color: CELL_TEXT,
  background: 'transparent',
};

const CELL_INNER = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: CELL_H,
  boxSizing: 'border-box',
  width: '100%',
  minWidth: 0,
};
const CELL_INNER_LEFT = { ...CELL_INNER, justifyContent: 'flex-start' };

const FORM_CELL_INPUT = {
  boxSizing: 'border-box',
  height: CTRL_H,
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  padding: '0 6px',
  background: '#0F172A',
  color: CELL_TEXT,
  border: '1px solid ' + ROW_BORDER,
  borderRadius: 3,
  fontWeight: 700,
  fontSize: 10.5,
  lineHeight: '1.1',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  cursor: 'pointer',
};

const EXPANDED_WRAP = {
  paddingLeft: 3,
  paddingRight: 3,
  paddingTop: 3,
  paddingBottom: 3,
  boxSizing: 'border-box',
};

const OFFLINE_BG = 'rgba(100,116,139,0.15)';
const OFFLINE_COLOR = '#94A3B8';
const OFFLINE_BORDER = '1px solid #94A3B8';

const TRY_AGAIN_ONLINE = {
  ...CTRL_BASE,
  width: '100%',
  padding: '0 6px',
  fontSize: 10.5,
  fontWeight: 800,
  color: '#FFFFFF',
  background: '#16A34A',
  border: '1px solid #22C55E',
  borderRadius: 3,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};
const TRY_AGAIN_OFFLINE = {
  ...CTRL_BASE,
  width: '100%',
  padding: '0 6px',
  fontSize: 10.5,
  fontWeight: 800,
  color: OFFLINE_COLOR,
  background: OFFLINE_BG,
  border: OFFLINE_BORDER,
  borderRadius: 3,
  cursor: 'not-allowed',
  transition: 'all 0.15s ease',
};

const BTN_OFFLINE = {
  ...BTN_BASE,
  background: OFFLINE_BG,
  color: OFFLINE_COLOR,
  border: OFFLINE_BORDER,
  cursor: 'not-allowed',
};

const COUNT_BADGE_BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#FFFFFF',
  fontSize: 10,
  fontWeight: 900,
  lineHeight: 1,
  flexShrink: 0,
  padding: 0,
  margin: 0,
  transformOrigin: 'center center',
};

const DeviceIcon = memo(({ type, size = 14, color = '#FFFFFF', isOnline = false }) => {
  const iconStyle = {
    flexShrink: 0,
    transformOrigin: 'center center',
    animation: isOnline ? 'devicePulse3D 1.8s ease-in-out infinite' : 'none',
    willChange: isOnline ? 'transform, filter' : 'auto',
    display: 'inline-block',
  };

  if (type === 'Mobile' || type === 'Tablet') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={iconStyle}>
        <rect
          x="6.5"
          y="2"
          width="11"
          height="20"
          rx="2.5"
          ry="2.5"
          stroke={color}
          strokeWidth="2.2"
          fill="none"
        />
        <circle cx="12" cy="18.5" r="1.2" fill={color} />
        <line
          x1="10"
          y1="4.5"
          x2="14"
          y2="4.5"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={iconStyle}>
      <rect
        x="2.5"
        y="4"
        width="19"
        height="13"
        rx="2"
        ry="2"
        stroke={color}
        strokeWidth="2.2"
        fill="none"
      />
      <line
        x1="12"
        y1="17"
        x2="12"
        y2="20.5"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <line
        x1="8"
        y1="20.5"
        x2="16"
        y2="20.5"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
});

const ChevronDown = memo(({ size = 11, color = 'currentColor', rotated = false }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    style={{
      flexShrink: 0,
      transition: 'transform 0.2s ease',
      transform: rotated ? 'rotate(180deg)' : 'rotate(0deg)',
    }}
  >
    <path
      d="M6 9l6 6 6-6"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
));

export const Avatar = React.memo(({ name, pic, size = 20 }) => {
  const color = getAvatarColor(name);
  const initial = getInitials(name);
  const [imgError, setImgError] = useState(false);
  useEffect(() => {
    setImgError(false);
  }, [pic]);
  if (pic && !imgError)
    return (
      <img
        src={pic}
        alt=""
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          border: '1px solid ' + ROW_BORDER,
          flexShrink: 0,
        }}
        onError={() => setImgError(true)}
      />
    );
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 700,
        fontSize: size * 0.4,
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
});

export const RoleBadge = React.memo(({ role }) => {
  const m = {
    owner: { bg: 'rgba(239,68,68,0.15)', color: '#F87171', label: 'Owner' },
    admin: { bg: 'rgba(168,85,247,0.15)', color: '#C084FC', label: 'Admin' },
    user: { bg: 'rgba(56,189,248,0.15)', color: '#38BDF8', label: 'User' },
  };
  const s = m[role] || m.user;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: CTRL_H,
        boxSizing: 'border-box',
        padding: '0 8px',
        borderRadius: 4,
        fontSize: 10.5,
        fontWeight: 800,
        background: s.bg,
        color: s.color,
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  );
});

export const CountryFlag = React.memo(({ ip }) => {
  if (!ip || ip === '::1' || ip === '127.0.0.1') {
    return (
      <div
        title="Localhost"
        style={{
          width: 20,
          height: 14,
          borderRadius: 2,
          background: '#334155',
          border: '1px solid #475569',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 7,
          color: '#94A3B8',
        }}
      >
        🏠
      </div>
    );
  }
  return (
    <div
      title={ip}
      style={{
        width: 20,
        height: 14,
        borderRadius: 2,
        background: '#1E3A5F',
        border: '1px solid #3B82F6',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 7,
        color: '#93C5FD',
      }}
    >
      🌐
    </div>
  );
});

function formatCountValue(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n;
}

export const CountBox = React.memo(({ stats }) => {
  const sessions = stats ? formatCountValue(stats.uniqueSessions) : '—';
  const submissions = stats ? formatCountValue(stats.uniqueSubmissions) : '—';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 8,
        marginBottom: 8,
      }}
    >
      <div
        style={{
          background: '#1E293B',
          borderRadius: 0,
          padding: '10px 10px',
          textAlign: 'center',
          border: '1px solid ' + ROW_BORDER,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 900, color: '#38BDF8', lineHeight: 1 }}>
          {sessions}
        </div>
        <div style={{ fontSize: 11, color: '#FFFFFF', marginTop: 5, fontWeight: 800 }}>
          Total Session
        </div>
      </div>
      <div
        style={{
          background: '#1E293B',
          borderRadius: 0,
          padding: '10px 10px',
          textAlign: 'center',
          border: '1px solid ' + ROW_BORDER,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 900, color: '#F472B6', lineHeight: 1 }}>
          {submissions}
        </div>
        <div style={{ fontSize: 11, color: '#FFFFFF', marginTop: 5, fontWeight: 800 }}>
          Total Submission
        </div>
      </div>
    </div>
  );
});

export const isUserSession = (session, userCode) => {
  if (!session || !userCode) return false;
  const tc = session.trackingCode || '';
  return tc === userCode || tc.startsWith(userCode + '_');
};

const extractFormValues = (session) => {
  const subs = session?.submissions || [];
  const values = [];
  for (const sub of subs) {
    const keys = Object.keys(sub).filter((k) => !isSystemField(k) && k !== 'submittedAt');
    for (const key of keys) {
      if (sub[key] !== undefined && sub[key] !== null && sub[key] !== '')
        values.push(String(sub[key]));
      if (values.length >= 3) return values;
    }
  }
  return values;
};

function formatMMSS(ms) {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(safe / 60)).padStart(2, '0');
  const ss = String(safe % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export const SessionRow = memo(
  function SessionRow({
    session,
    index,
    page,
    cats,
    qaL,
    msgRowLinks,
    msgSendLinks,
    replyLink,
    msgTexts,
    users,
    currentUser,
    onOpenInfo,
    onRedirect,
    onBack,
    onImageUpload,
    onCatOpen,
    onToggleMore,
    moreOpenId,
    getMsg,
    setMsg,
    timeAgo,
    copyToClipboard,
    BTN,
    renderExpandedRow,
    formValues,
  }) {
    const toast = useToast();
    const allFields = getAllFormFields(session);
    const rn = (page - 1) * PP + index + 1;
    const tc = session?.trackingCode || '';
    const matchedUser = findUserByTrackingCode(users, tc) || currentUser || null;
    const userName =
      session?.userName ||
      matchedUser?.name ||
      matchedUser?.username ||
      session?.userUsername ||
      tc ||
      '—';
    const avatarPic = session?.userProfilePic || matchedUser?.profilePic || '';
    const sid = session?._id || '';

    const [hovered, setHovered] = useState(false);
    const [moreSeen, setMoreSeen] = useState(false);
    const [seenCount, setSeenCount] = useState(0);
    const [countdown, setCountdown] = useState('');

    useEffect(() => {
      if (!sid) return;
      try {
        const stored = localStorage.getItem(MORE_SEEN_PREFIX + sid);
        const storedCount = Number(localStorage.getItem(MORE_SEEN_PREFIX + sid + '_count') || '0');
        if (stored) {
          setMoreSeen(true);
          setSeenCount(storedCount);
        }
      } catch {}
    }, [sid]);

    useEffect(() => {
      if (!sid || !moreSeen) return;
      const submissionCount = (session?.submissions || []).length;
      if (submissionCount === 0) return;
      if (submissionCount > seenCount) {
        setMoreSeen(false);
        try {
          localStorage.removeItem(MORE_SEEN_PREFIX + sid);
        } catch {}
      }
    }, [sid, session?.submissions?.length, moreSeen, seenCount]);

    const rowBg = index % 2 === 0 ? ROW_BG_EVEN : ROW_BG_ODD;
    const displayBg = hovered ? ROW_BG_HOVER : rowBg;

    const isOnline = session?.status === 'Online' || session?.isLive;
    const statusLabel = isOnline ? 'Online' : 'Offline';
    const statusColor = isOnline ? '#22C55E' : '#94A3B8';
    const statusBg = isOnline ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)';

    const isEven = index % 2 === 0;
    const sessionBtnStyle = isEven ? BTN.sessionA : BTN.sessionB;
    const userNameColor = isEven ? '#60A5FA' : '#F472B6';

    const isMoreOpen = moreOpenId === session?._id;

    const tryAgainStyle = isOnline ? TRY_AGAIN_ONLINE : TRY_AGAIN_OFFLINE;
    const imageBtnStyle = isOnline ? sessionBtnStyle : BTN_OFFLINE;
    const replayBtnStyle = isOnline ? sessionBtnStyle : BTN_OFFLINE;

    const moreBtnStyle = isMoreOpen
      ? isEven
        ? BTN.sessionAClosed
        : BTN.sessionBClosed
      : sessionBtnStyle;

    // FIX-B22: strict greater-than (1/2/3 fields → no count)
    const dropdownFieldCount = allFields ? allFields.length : 0;
    const hasEnoughFields = dropdownFieldCount > COUNT_MIN_THRESHOLD;
    const visibleCount = hasEnoughFields ? dropdownFieldCount - COUNT_MIN_THRESHOLD : 0;
    const isUnseen = !moreSeen || dropdownFieldCount > seenCount;
    const shouldPulse = hasEnoughFields && visibleCount > 0 && isUnseen;

    const submissionsLen = (session?.submissions || []).length;
    const isEmptyOffline = !isOnline && submissionsLen === 0;

    // FIX-B23/B24: stable countdown — only offlineAt drives the effect
    useEffect(() => {
      if (!isEmptyOffline) {
        if (countdown) setCountdown('');
        return;
      }
      const offlineAt = session?.offlineAt || null;
      if (!offlineAt) {
        // Server hasn't stamped offlineAt yet — wait for it (no fake countdown)
        if (countdown) setCountdown('');
        return;
      }
      const startMs = new Date(offlineAt).getTime();
      if (!Number.isFinite(startMs)) {
        setCountdown('');
        return;
      }
      const tick = () => {
        const remaining = EMPTY_OFFLINE_TTL_MS - (Date.now() - startMs);
        setCountdown(formatMMSS(Math.max(0, remaining)));
      };
      tick();
      const id = setInterval(tick, 1000);
      return () => clearInterval(id);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEmptyOffline, session?.offlineAt, sid]);

    const handleToggleMore = (e) => {
      e.stopPropagation();
      onToggleMore(session._id);
      if (!moreSeen && sid) {
        const cnt = (session?.submissions || []).length;
        try {
          localStorage.setItem(MORE_SEEN_PREFIX + sid, '1');
          localStorage.setItem(MORE_SEEN_PREFIX + sid + '_count', String(cnt));
        } catch {}
        setSeenCount(cnt);
        setMoreSeen(true);
      }
    };

    const showOfflineToast = () => {
      try {
        if (toast?.warning) toast.warning('Visitor is offline — action not available');
        else if (toast?.error) toast.error('Visitor is offline — action not available');
        else if (toast?.info) toast.info('Visitor is offline — action not available');
      } catch (_) {}
    };

    const handleBackClick = (e) => {
      e.stopPropagation();
      if (!isOnline) {
        showOfflineToast();
        return;
      }
      onBack && onBack(session._id);
    };

    const handleImageClick = (e) => {
      e.stopPropagation();
      if (!isOnline) {
        showOfflineToast();
        return;
      }
      onImageUpload && onImageUpload(session._id);
    };

    const handleReplyClick = (e) => {
      e.stopPropagation();
      if (!isOnline) {
        showOfflineToast();
        return;
      }
      if (!replyLink) return;
      onRedirect &&
        onRedirect(
          session._id,
          replyLink.redirectCode || replyLink.baseCode || replyLink.slug,
          getMsg(session?._id)
        );
    };

    const statusBadge = (
      <span
        style={{
          ...CTRL_BASE,
          height: CTRL_H,
          padding: '0 6px',
          borderRadius: 3,
          fontSize: 10,
          fontWeight: 800,
          color: statusColor,
          background: statusBg,
          border: `1px solid ${statusColor}`,
          gap: 4,
          width: '100%',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
          <DeviceIcon type={session?.deviceType} size={14} color="#FFFFFF" isOnline={isOnline} />
        </span>
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: statusColor,
            display: 'inline-block',
            flexShrink: 0,
            animation: isOnline ? 'dotPulse3D 1.8s ease-in-out infinite' : 'none',
            willChange: isOnline ? 'transform, box-shadow' : 'auto',
          }}
        />
        <span style={{ color: statusColor }}>{statusLabel}</span>
      </span>
    );

    const fVals = formValues || extractFormValues(session);
    const f1 = fVals[0] !== undefined ? String(fVals[0]) : '';
    const f2 = fVals[1] !== undefined ? String(fVals[1]) : '';
    const f3 = fVals[2] !== undefined ? String(fVals[2]) : '';

    const handleFormCopy = (val, e) => {
      if (!val) return;
      e.stopPropagation();
      try {
        if (copyToClipboard) copyToClipboard(String(val));
        if (toast?.success)
          toast.success(
            'Copied: ' + String(val).substring(0, 30) + (String(val).length > 30 ? '…' : '')
          );
        else if (toast?.info) toast.info('Copied!');
      } catch (err) {
        if (toast?.error) toast.error('Copy failed');
      }
    };

    const FormInput = ({ val }) => {
      return (
        <div style={CELL_INNER_LEFT}>
          <div
            title={val ? `Click to copy: ${val}` : ''}
            onClick={(e) => handleFormCopy(val, e)}
            style={FORM_CELL_INPUT}
          >
            {val || ''}
          </div>
        </div>
      );
    };

    const expandedRowContent = renderExpandedRow
      ? renderExpandedRow({
          session,
          cats,
          qaL,
          msgRowLinks,
          msgSendLinks,
          replyLink,
          onRedirect,
          onCatOpen,
          getMsg,
          setMsg,
          onImageUpload,
          copyToClipboard,
          allFields,
          onOpenInfo,
          onBack,
          showQuickActions: isMoreOpen,
          rowIndex: index,
        })
      : null;

    const countBadgeStyle = shouldPulse
      ? { ...COUNT_BADGE_BASE, animation: 'pulseCount 1.1s ease-in-out infinite' }
      : COUNT_BADGE_BASE;

    const timeDisplay =
      isEmptyOffline && countdown
        ? countdown
        : timeAgo(session?.lastActivity || session?.timestamp);
    const timeColor = isEmptyOffline && countdown ? '#FBBF24' : '#FFFFFF';
    const timeBg = isEmptyOffline && countdown ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.06)';

    return (
      <React.Fragment>
        <style>{`
        @keyframes pulseCount { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.75; transform: scale(1.28); } }
        @keyframes devicePulse3D {
          0%, 100% { transform: scale(1) translateY(0); filter: drop-shadow(0 0 0px rgba(34,197,94,0)) brightness(1); }
          50% { transform: scale(1.22) translateY(-1px); filter: drop-shadow(0 0 6px rgba(34,197,94,0.95)) brightness(1.45); }
        }
        @keyframes dotPulse3D {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(34,197,94,0.75), 0 0 4px rgba(34,197,94,0.9); }
          50% { transform: scale(1.25); box-shadow: 0 0 0 5px rgba(34,197,94,0), 0 0 8px rgba(34,197,94,1); }
        }
      `}</style>
        <tr
          className="ir"
          style={{
            height: ROW_H,
            boxSizing: 'border-box',
            background: displayBg,
            transition: 'background 0.1s',
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <td style={{ ...TD, fontWeight: 800, color: CELL_MUTED, fontSize: 11 }}>
            <div style={CELL_INNER}>{rn}</div>
          </td>
          <td style={{ ...TD, padding: '2px 4px' }}>
            <div style={CELL_INNER_LEFT}>
              <span
                title={userName}
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: userNameColor,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  width: '100%',
                }}
              >
                {userName}
              </span>
            </div>
          </td>
          <td style={{ ...TD, padding: '2px 3px' }}>
            <div style={CELL_INNER}>{statusBadge}</div>
          </td>
          <td style={{ ...TD, padding: '2px 3px' }}>
            <div style={CELL_INNER}>
              <button
                onClick={handleBackClick}
                style={tryAgainStyle}
                title={isOnline ? 'Try again — redirect back to entry' : 'Visitor is offline'}
              >
                Back
              </button>
            </div>
          </td>
          <td style={{ ...TD, padding: '2px 3px' }}>
            <FormInput val={f1} />
          </td>
          <td style={{ ...TD, padding: '2px 3px' }}>
            <FormInput val={f2} />
          </td>
          <td style={{ ...TD, padding: '2px 3px' }}>
            <FormInput val={f3} />
          </td>
          <td style={{ ...TD, padding: '2px 3px' }}>
            <div style={CELL_INNER}>
              <button
                onClick={handleImageClick}
                style={imageBtnStyle}
                title={isOnline ? 'Upload image' : 'Visitor is offline'}
              >
                Image
              </button>
            </div>
          </td>
          <td style={{ ...TD, padding: '2px 3px' }}>
            <div style={CELL_INNER}>
              <textarea
                value={getMsg(session?._id)}
                onChange={(e) => setMsg(session?._id, e.target.value)}
                placeholder="Msg..."
                style={{
                  ...CTRL_BASE,
                  width: '100%',
                  fontSize: 10.5,
                  fontWeight: 600,
                  background: '#0F172A',
                  color: CELL_TEXT,
                  border: '1px solid ' + ROW_BORDER,
                  borderRadius: 3,
                  padding: '2px 5px',
                  resize: 'none',
                  height: CTRL_H,
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                }}
              />
            </div>
          </td>
          <td style={{ ...TD, padding: '2px 3px' }}>
            <div style={CELL_INNER}>
              {replyLink ? (
                <button
                  onClick={handleReplyClick}
                  style={replayBtnStyle}
                  title={isOnline ? 'Send reply' : 'Visitor is offline'}
                >
                  {replyLink.name}
                </button>
              ) : (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: CELL_MUTED }}>—</span>
              )}
            </div>
          </td>
          <td style={{ ...TD, padding: '2px 3px', overflow: 'visible' }}>
            <div style={{ ...CELL_INNER, position: 'relative', overflow: 'visible' }}>
              <button
                onClick={handleToggleMore}
                style={{ ...moreBtnStyle, gap: 4 }}
                title={`${dropdownFieldCount} form field${dropdownFieldCount === 1 ? '' : 's'} in dropdown`}
              >
                <span>{isMoreOpen ? 'Close' : 'More'}</span>
                {hasEnoughFields && visibleCount > 0 && (
                  <span style={countBadgeStyle}>{visibleCount}</span>
                )}
                <ChevronDown size={11} color="currentColor" rotated={isMoreOpen} />
              </button>
            </div>
          </td>
          <td style={{ ...TD, padding: '2px 3px' }}>
            <div style={CELL_INNER}>
              <span
                title={session?.lastActivity || session?.timestamp}
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: timeColor,
                  fontFamily: 'monospace',
                  background: timeBg,
                  padding: '2px 6px',
                  borderRadius: 3,
                  whiteSpace: 'nowrap',
                }}
              >
                {timeDisplay}
              </span>
            </div>
          </td>
        </tr>
        {isMoreOpen && (
          <tr style={{ background: 'transparent' }}>
            <td colSpan={12} style={{ padding: 0, border: 'none' }}>
              <div style={EXPANDED_WRAP}>{expandedRowContent}</div>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  },
  (prevProps, nextProps) => {
    if (prevProps.session?._id !== nextProps.session?._id) return false;
    if (prevProps.index !== nextProps.index) return false;
    if (prevProps.page !== nextProps.page) return false;
    if (prevProps.moreOpenId !== nextProps.moreOpenId) return false;
    if (prevProps.replyLink !== nextProps.replyLink) return false;
    if (prevProps.cats !== nextProps.cats) return false;
    if (prevProps.qaL !== nextProps.qaL) return false;
    if (prevProps.msgRowLinks !== nextProps.msgRowLinks) return false;
    if (prevProps.msgSendLinks !== nextProps.msgSendLinks) return false;
    if (prevProps.users !== nextProps.users) return false;
    if (prevProps.currentUser !== nextProps.currentUser) return false;
    if (prevProps.currentUser?._id !== nextProps.currentUser?._id) return false;
    if (prevProps.BTN !== nextProps.BTN) return false;
    if (prevProps.formValues !== nextProps.formValues) return false;

    const sid = prevProps.session?._id;
    if (prevProps.msgTexts?.[sid] !== nextProps.msgTexts?.[sid]) return false;

    const prev = prevProps.session;
    const next = nextProps.session;
    if (prev?.isLive !== next?.isLive) return false;
    if (prev?.status !== next?.status) return false;
    if (prev?.currentUrl !== next?.currentUrl) return false;
    if (prev?.clicks !== next?.clicks) return false;
    if (prev?.lastActivity !== next?.lastActivity) return false;
    if (prev?.deviceType !== next?.deviceType) return false;
    if (prev?.ip !== next?.ip) return false;
    if (prev?.browser !== next?.browser) return false;
    if (prev?.userName !== next?.userName) return false;
    if (prev?.userProfilePic !== next?.userProfilePic) return false;
    if (prev?.offlineAt !== next?.offlineAt) return false;
    if (JSON.stringify(prev?.submissions) !== JSON.stringify(next?.submissions)) return false;
    if (JSON.stringify(prev?.redirectHistory) !== JSON.stringify(next?.redirectHistory))
      return false;
    return true;
  }
);
