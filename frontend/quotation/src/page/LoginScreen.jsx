import React, { useState, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────
// Role definitions
// ─────────────────────────────────────────────────────────────
const ROLES = [
  {
    key:         'user',
    label:       'Creator',
    sublabel:    'Create & manage quotations',
    icon:        '✦',
    accent:      '#00d4aa',
    accentDim:   'rgba(0,212,170,0.12)',
    accentBorder:'rgba(0,212,170,0.35)',
  },
  {
    key:         'ops_manager',
    label:       'Operations',
    sublabel:    'Review & forward quotations',
    icon:        '◈',
    accent:      '#f59e0b',
    accentDim:   'rgba(245,158,11,0.12)',
    accentBorder:'rgba(245,158,11,0.35)',
  },
  {
    key:         'admin',
    label:       'Admin',
    sublabel:    'Final approval & oversight',
    icon:        '◆',
    accent:      '#818cf8',
    accentBorder:'rgba(129,140,248,0.35)',
    accentDim:   'rgba(129,140,248,0.12)',
  },
];

// ─────────────────────────────────────────────────────────────
// Inject font + keyframes once
// ─────────────────────────────────────────────────────────────
const styleEl = document.createElement('style');
styleEl.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap');

  @keyframes loginFadeUp {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  @keyframes loginSpin {
    to { transform: rotate(360deg); }
  }
  @keyframes loginPulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.4; }
  }
  @keyframes loginShake {
    0%, 100% { transform: translateX(0); }
    20%       { transform: translateX(-6px); }
    40%       { transform: translateX(6px); }
    60%       { transform: translateX(-4px); }
    80%       { transform: translateX(4px); }
  }

  .login-card   { animation: loginFadeUp 0.45s cubic-bezier(.16,1,.3,1) both; }
  .login-shake  { animation: loginShake 0.4s ease; }

  .role-card {
    transition: border-color 0.2s, background 0.2s, transform 0.15s;
    cursor: pointer;
  }
  .role-card:hover { transform: translateY(-2px); }

  .login-input {
    transition: border-color 0.2s, box-shadow 0.2s;
    background: transparent;
  }
  .login-input:focus {
    outline: none;
  }

  .login-btn {
    transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
  }
  .login-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  }
  .login-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .pw-toggle { transition: color 0.15s; }
  .pw-toggle:hover { color: #e2e8f0 !important; }
`;
if (!document.head.querySelector('[data-login-styles]')) {
  styleEl.setAttribute('data-login-styles', '1');
  document.head.appendChild(styleEl);
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export default function LoginScreen({ onLogin, onNavigate }) {
  const [roleKey,      setRoleKey]      = useState('user');
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [shake,        setShake]        = useState(false);

  const role = ROLES.find((r) => r.key === roleKey);

  // Clear fields when role switches
  useEffect(() => {
    setEmail('');
    setPassword('');
    setError('');
  }, [roleKey]);

  // Trigger shake on error
  useEffect(() => {
    if (error) {
      setShake(true);
      const t = setTimeout(() => setShake(false), 450);
      return () => clearTimeout(t);
    }
  }, [error]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please fill in both fields.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Enter a valid email address.');
      return;
    }

    setLoading(true);
    const result = await onLogin(email, password);
    if (!result.success) {
      setError(result.error || 'Invalid credentials.');
      setLoading(false);
    }
    // On success App.jsx handles redirect
  };

  return (
    <div style={S.page}>

      {/* ── Geometric background ── */}
      <div style={S.bgGrid} aria-hidden />
      <div style={{ ...S.bgGlow, background: `radial-gradient(ellipse 600px 400px at 60% 40%, ${role.accentDim} 0%, transparent 70%)` }} aria-hidden />

      {/* ── Card ── */}
      <div className={`login-card ${shake ? 'login-shake' : ''}`} style={S.card}>

        {/* Wordmark */}
        <div style={S.wordmark}>
          <span style={{ ...S.wordmarkDot, backgroundColor: role.accent }} />
          <span style={S.wordmarkText}>QuotationOS</span>
        </div>

        {/* Heading */}
        <div style={S.heading}>
          <h1 style={S.h1}>Sign in</h1>
          <p style={S.sub}>Choose your role and enter your credentials</p>
        </div>

        {/* Role selector */}
        <div style={S.roleGrid}>
          {ROLES.map((r) => {
            const active = r.key === roleKey;
            return (
              <div
                key={r.key}
                className="role-card"
                onClick={() => setRoleKey(r.key)}
                style={{
                  ...S.roleCard,
                  borderColor:     active ? r.accentBorder : 'rgba(255,255,255,0.08)',
                  backgroundColor: active ? r.accentDim    : 'rgba(255,255,255,0.03)',
                  boxShadow:       active ? `0 0 0 1px ${r.accentBorder}` : 'none',
                }}
              >
                <span style={{ ...S.roleIcon, color: active ? r.accent : '#475569' }}>
                  {r.icon}
                </span>
                <span style={{ ...S.roleLabel, color: active ? '#f1f5f9' : '#64748b' }}>
                  {r.label}
                </span>
                <span style={{ ...S.roleSub, color: active ? '#94a3b8' : '#334155' }}>
                  {r.sublabel}
                </span>
                {active && (
                  <span style={{ ...S.roleActiveDot, backgroundColor: r.accent }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div style={S.divider}>
          <span style={S.dividerLine} />
          <span style={{ ...S.dividerLabel, color: role.accent }}>
            {role.label} login
          </span>
          <span style={S.dividerLine} />
        </div>

        {/* Error */}
        {error && (
          <div style={S.errorBox}>
            <span style={S.errorDot} />
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={S.form}>

          {/* Email */}
          <div style={S.fieldGroup}>
            <label style={S.label}>Email</label>
            <input
              className="login-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              disabled={loading}
              autoFocus
              style={{
                ...S.input,
                borderColor: error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)',
              }}
              onFocus={(e) => { e.target.style.borderColor = role.accentBorder; e.target.style.boxShadow = `0 0 0 3px ${role.accentDim}`; }}
              onBlur={(e)  => { e.target.style.borderColor = error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>

          {/* Password */}
          <div style={S.fieldGroup}>
            <label style={S.label}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                className="login-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                style={{
                  ...S.input,
                  paddingRight: '3rem',
                  borderColor: error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)',
                  fontFamily: showPassword ? "'DM Mono', monospace" : 'inherit',
                  letterSpacing: showPassword ? '0.05em' : '0.15em',
                }}
                onFocus={(e) => { e.target.style.borderColor = role.accentBorder; e.target.style.boxShadow = `0 0 0 3px ${role.accentDim}`; }}
                onBlur={(e)  => { e.target.style.borderColor = error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPassword((p) => !p)}
                style={S.pwToggle}
                tabIndex={-1}
              >
                {showPassword ? (
                  // Eye-off
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/>
                  </svg>
                ) : (
                  // Eye
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="login-btn"
            disabled={loading}
            style={{
              ...S.submitBtn,
              backgroundColor: role.accent,
              opacity: loading ? 0.7 : 1,
              cursor:  loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? (
              <span style={S.btnInner}>
                <span style={S.spinnerRing} />
                Signing in…
              </span>
            ) : (
              <span style={S.btnInner}>
                Continue as {role.label}
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </span>
            )}
          </button>

        </form>

        {/* Footer */}
        <p style={S.cardFooter}>
          © {new Date().getFullYear()} Mega Repairing Machinery Equipment LLC
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#080d14',
    fontFamily: "'Syne', 'Segoe UI', sans-serif",
    padding: '1.5rem',
    position: 'relative',
    overflow: 'hidden',
  },

  // Background
  bgGrid: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px',
    pointerEvents: 'none',
  },
  bgGlow: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    transition: 'background 0.5s ease',
  },

  // Card
  card: {
    width: '100%',
    maxWidth: '460px',
    backgroundColor: '#0e1621',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '1.25rem',
    padding: '2.5rem 2.25rem 2rem',
    boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
    position: 'relative',
    zIndex: 10,
  },

  // Wordmark
  wordmark: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '2rem',
  },
  wordmarkDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block',
    transition: 'background-color 0.3s',
  },
  wordmarkText: {
    fontSize: '0.78rem',
    fontWeight: '700',
    color: '#475569',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },

  // Heading
  heading: { marginBottom: '1.75rem' },
  h1: {
    fontSize: '1.8rem',
    fontWeight: '800',
    color: '#f1f5f9',
    margin: '0 0 0.35rem',
    letterSpacing: '-0.03em',
    lineHeight: 1.1,
  },
  sub: {
    fontSize: '0.85rem',
    color: '#475569',
    margin: 0,
    fontWeight: '400',
  },

  // Role grid
  roleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.6rem',
    marginBottom: '1.5rem',
  },
  roleCard: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.9rem 0.5rem 0.75rem',
    border: '1px solid',
    borderRadius: '0.75rem',
    userSelect: 'none',
  },
  roleIcon: {
    fontSize: '1.3rem',
    lineHeight: 1,
    transition: 'color 0.2s',
  },
  roleLabel: {
    fontSize: '0.8rem',
    fontWeight: '700',
    letterSpacing: '0.01em',
    transition: 'color 0.2s',
  },
  roleSub: {
    fontSize: '0.64rem',
    textAlign: 'center',
    lineHeight: 1.3,
    transition: 'color 0.2s',
  },
  roleActiveDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: '50%',
  },

  // Divider
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1.25rem',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  dividerLabel: {
    fontSize: '0.72rem',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    whiteSpace: 'nowrap',
    transition: 'color 0.3s',
  },

  // Error
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    padding: '0.7rem 0.9rem',
    backgroundColor: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: '0.5rem',
    color: '#fca5a5',
    fontSize: '0.82rem',
    fontWeight: '500',
    marginBottom: '1.1rem',
  },
  errorDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: '#ef4444',
    flexShrink: 0,
    animation: 'loginPulse 1.2s ease infinite',
  },

  // Form
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  label: {
    fontSize: '0.78rem',
    fontWeight: '600',
    color: '#64748b',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  input: {
    width: '100%',
    padding: '0.75rem 1rem',
    border: '1px solid',
    borderRadius: '0.6rem',
    fontSize: '0.9rem',
    color: '#e2e8f0',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },

  // Password toggle
  pwToggle: {
    position: 'absolute',
    right: '0.75rem',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#334155',
    padding: '0.25rem',
    display: 'flex',
    alignItems: 'center',
  },

  // Submit
  submitBtn: {
    width: '100%',
    padding: '0.85rem',
    border: 'none',
    borderRadius: '0.65rem',
    fontSize: '0.9rem',
    fontWeight: '700',
    color: '#080d14',
    marginTop: '0.5rem',
    letterSpacing: '0.01em',
  },
  btnInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
  },
  spinnerRing: {
    display: 'inline-block',
    width: '16px',
    height: '16px',
    border: '2px solid rgba(0,0,0,0.2)',
    borderTopColor: 'rgba(0,0,0,0.7)',
    borderRadius: '50%',
    animation: 'loginSpin 0.7s linear infinite',
    flexShrink: 0,
  },

  // Card footer
  cardFooter: {
    marginTop: '2rem',
    textAlign: 'center',
    fontSize: '0.7rem',
    color: '#1e293b',
    letterSpacing: '0.03em',
  },
};