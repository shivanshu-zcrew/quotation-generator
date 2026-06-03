import React, { useState, useEffect } from 'react';
import { authAPI } from '../services/api';

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
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [shake,        setShake]        = useState(false);

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
    try {
      // Delegate entirely to the parent (which calls store.handleLogin -> _loadCompanyData -> navigate)
      const result = await onLogin(email, password);
      if (result && result.success === false) {
        setError(result.error || 'Invalid credentials. Please try again.');
      }
    } catch (err) {
      setError(err?.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.page}>

      {/* ── Geometric background ── */}
      <div style={S.bgGrid} aria-hidden />
      <div style={S.bgGlow} aria-hidden />

      {/* ── Card ── */}
      <div className={`login-card ${shake ? 'login-shake' : ''}`} style={S.card}>

        {/* Logo / Wordmark */}
        <div style={S.logoSection}>
          <div style={S.logoIcon}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#00d4aa" fillOpacity="0.15"/>
              <path d="M10 16L14 12L22 20L18 24L10 16Z" fill="#00d4aa" stroke="#00d4aa" strokeWidth="1.5"/>
              <path d="M14 12L16 10L24 18L22 20L14 12Z" fill="#00d4aa" fillOpacity="0.5" stroke="#00d4aa" strokeWidth="1.5"/>
            </svg>
          </div>
          <div style={S.wordmark}>
            <span style={S.wordmarkText}>QuotationOS</span>
          </div>
        </div>

        {/* Heading */}
        <div style={S.heading}>
        <h1 style={S.h1}>
     Sign in 
    
  </h1>
  <p style={S.sub}>Access your quotation dashboard</p>
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
            <label style={S.label}>Email address</label>
            <input
              className="login-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              disabled={loading}
              autoFocus
              style={{
                ...S.input,
                borderColor: error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)',
              }}
              onFocus={(e) => { 
                e.target.style.borderColor = '#00d4aa'; 
                e.target.style.boxShadow = '0 0 0 3px rgba(0,212,170,0.12)'; 
              }}
              onBlur={(e) => { 
                e.target.style.borderColor = error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'; 
                e.target.style.boxShadow = 'none'; 
              }}
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
                onFocus={(e) => { 
                  e.target.style.borderColor = '#00d4aa'; 
                  e.target.style.boxShadow = '0 0 0 3px rgba(0,212,170,0.12)'; 
                }}
                onBlur={(e) => { 
                  e.target.style.borderColor = error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'; 
                  e.target.style.boxShadow = 'none'; 
                }}
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPassword((p) => !p)}
                style={S.pwToggle}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Forgot password link */}
           

          {/* Submit */}
          <button
            type="submit"
            className="login-btn"
            disabled={loading}
            style={{
              ...S.submitBtn,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? (
              <span style={S.btnInner}>
                <span style={S.spinnerRing} />
                Signing in...
              </span>
            ) : (
              <span style={S.btnInner}>
                Sign in
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </span>
            )}
          </button>

        </form>

        {/* Footer */}
        <div style={S.footer}>
          <p style={S.copyright}>
            © {new Date().getFullYear()} Mega Repairing Machinery Equipment LLC
          </p>
           
        </div>
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

  bgGrid: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px',
    pointerEvents: 'none',
  },
  bgGlow: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(ellipse 600px 400px at 50% 40%, rgba(0,212,170,0.08) 0%, transparent 70%)',
    pointerEvents: 'none',
  },

  card: {
    width: '100%',
    maxWidth: '440px',
    backgroundColor: '#0e1621',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '1.5rem',
    padding: '2.5rem 2rem 2rem',
    boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
    position: 'relative',
    zIndex: 10,
  },

  logoSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '2rem',
  },
  logoIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  wordmarkText: {
    fontSize: '1rem',
    fontWeight: '700',
    color: '#f1f5f9',
    letterSpacing: '-0.02em',
  },
  wordmarkBadge: {
    fontSize: '0.65rem',
    fontWeight: '500',
    color: '#00d4aa',
    backgroundColor: 'rgba(0,212,170,0.12)',
    padding: '0.2rem 0.4rem',
    borderRadius: '0.25rem',
    letterSpacing: '0.02em',
  },

  heading: { 
    marginBottom: '2rem',
  },
  h1: {
    fontSize: '1.75rem',
    fontWeight: '800',
    color: '#f1f5f9',
    margin: '0 0 0.5rem',
    letterSpacing: '-0.03em',
    lineHeight: 1.2,
  },
  sub: {
    fontSize: '0.85rem',
    color: '#64748b',
    margin: 0,
    fontWeight: '400',
  },

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
    marginBottom: '1.5rem',
  },
  errorDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: '#ef4444',
    flexShrink: 0,
    animation: 'loginPulse 1.2s ease infinite',
  },

  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  label: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#94a3b8',
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

  pwToggle: {
    position: 'absolute',
    right: '0.75rem',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#475569',
    padding: '0.25rem',
    display: 'flex',
    alignItems: 'center',
  },

  forgotRow: {
    textAlign: 'right',
    marginTop: '-0.25rem',
  },
  forgotLink: {
    fontSize: '0.75rem',
    color: '#64748b',
    textDecoration: 'none',
    transition: 'color 0.2s',
    ':hover': {
      color: '#00d4aa',
    },
  },

  submitBtn: {
    width: '100%',
    padding: '0.85rem',
    border: 'none',
    borderRadius: '0.65rem',
    fontSize: '0.9rem',
    fontWeight: '700',
    color: '#080d14',
    marginTop: '0.25rem',
    letterSpacing: '0.01em',
    background: 'linear-gradient(135deg, #00d4aa 0%, #00b894 100%)',
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

  footer: {
    marginTop: '2.5rem',
    textAlign: 'center',
  },
  copyright: {
    fontSize: '0.7rem',
    color: '#1e293b',
    margin: '0 0 0.75rem 0',
    letterSpacing: '0.02em',
  },
  footerLinks: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  footerLink: {
    fontSize: '0.7rem',
    color: '#334155',
    textDecoration: 'none',
    transition: 'color 0.2s',
    ':hover': {
      color: '#64748b',
    },
  },
  footerDivider: {
    fontSize: '0.7rem',
    color: '#1e293b',
  },
};

// Add hover styles dynamically
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  a:hover { color: #00d4aa !important; }
  .login-btn:hover:not(:disabled) { background: linear-gradient(135deg, #00e0b5 0%, #00c9a0 100%) !important; }
`;
document.head.appendChild(styleSheet);