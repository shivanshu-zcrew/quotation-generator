import React, { useState } from 'react';

export default function LoginScreen({ onLogin, onNavigate }) {
  const [loginType, setLoginType] = useState('user'); // 'user' or 'admin'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Demo credentials based on login type
  const getDemoCredentials = () => {
    if (loginType === 'admin') {
      return {
        email: 'admin@example.com',
        password: 'admin123',
        hint: 'Admin: admin@example.com / admin123'
      };
    } else {
      return {
        email: 'user@example.com',
        password: 'user123',
        hint: 'User: user@example.com / user123'
      };
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Basic validation
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      setLoading(false);
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    const result = await onLogin(email, password);
    
    if (!result.success) {
      setError(result.error);
      setLoading(false);
    }
    // On success, the App component will redirect based on user role
  };

  const fillDemoCredentials = () => {
    const demo = getDemoCredentials();
    setEmail(demo.email);
    setPassword(demo.password);
  };

  return (
    <div style={styles.container}>
      {/* Background decorative elements */}
      <div style={styles.bgCircle1}></div>
      <div style={styles.bgCircle2}></div>
      
      <div style={styles.card}>
        {/* Logo/Icon */}
        <div style={styles.logoContainer}>
          <svg 
            style={styles.logo}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
            />
          </svg>
        </div>

        <h1 style={styles.title}>Welcome Back</h1>
        <p style={styles.subtitle}>Sign in to continue to Quotation Generator</p>
        
        {/* Login Type Tabs */}
        <div style={styles.tabContainer}>
          <button
            style={{
              ...styles.tab,
              ...(loginType === 'user' && styles.activeTab),
              ...(loginType === 'user' && styles.userActiveTab)
            }}
            onClick={() => {
              setLoginType('user');
              setEmail('');
              setPassword('');
              setError('');
            }}
          >
            <svg style={styles.tabIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Login as USER
          </button>
          <button
            style={{
              ...styles.tab,
              ...(loginType === 'admin' && styles.activeTab),
              ...(loginType === 'admin' && styles.adminActiveTab)
            }}
            onClick={() => {
              setLoginType('admin');
              setEmail('');
              setPassword('');
              setError('');
            }}
          >
            <svg style={styles.tabIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Login as ADMIN
          </button>
        </div>

        {/* Role-specific header */}
        <div style={{
          ...styles.roleHeader,
          backgroundColor: loginType === 'admin' ? '#667eea20' : '#10b98120',
          color: loginType === 'admin' ? '#667eea' : '#10b981'
        }}>
          {loginType === 'admin' ? (
            <>
              <span style={styles.roleIcon}>👑</span>
              <span>Administrator Access</span>
            </>
          ) : (
            <>
              <span style={styles.roleIcon}>👤</span>
              <span>Standard User Access</span>
            </>
          )}
        </div>
        
        {error && (
          <div style={styles.errorContainer}>
            <svg style={styles.errorIcon} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
        )}
        
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>
              <svg style={styles.inputIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              placeholder={`Enter ${loginType} email`}
              required
              disabled={loading}
              autoFocus
            />
          </div>
          
          <div style={styles.inputGroup}>
            <label style={styles.label}>
              <svg style={styles.inputIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Password
            </label>
            <div style={styles.passwordContainer}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.passwordInput}
                placeholder={`Enter ${loginType} password`}
                required
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={styles.passwordToggle}
              >
                {showPassword ? (
                  <svg style={styles.toggleIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                ) : (
                  <svg style={styles.toggleIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          
          {/* <div style={styles.options}>
            <label style={styles.checkboxLabel}>
              <input type="checkbox" style={styles.checkbox} />
              <span>Remember me</span>
            </label>
            <button 
              type="button"
              style={styles.forgotPassword}
              onClick={() => alert('Please contact admin to reset password')}
            >
              Forgot Password?
            </button>
          </div> */}
          
          <button 
            type="submit" 
            style={{
              ...styles.button,
              backgroundColor: loginType === 'admin' ? '#667eea' : '#10b981',
              ...(loading && styles.buttonDisabled)
            }}
            disabled={loading}
          >
            {loading ? (
              <span style={styles.loadingContainer}>
                <svg style={styles.spinner} fill="none" viewBox="0 0 24 24">
                  <circle style={styles.spinnerCircle} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path style={styles.spinnerPath} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Signing in as {loginType === 'admin' ? 'Admin' : 'User'}...
              </span>
            ) : `Sign in as ${loginType === 'admin' ? 'Administrator' : 'User'}`}
          </button>
        </form>
        
        {/* Demo Credentials Button */}
        {/* <button 
          onClick={fillDemoCredentials}
          style={styles.demoButton}
        >
          <svg style={styles.demoIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Use Demo {loginType === 'admin' ? 'Admin' : 'User'} Credentials
        </button> */}
        
        {/* <div style={styles.divider}>
          <span style={styles.dividerLine}></span>
          <span style={styles.dividerText}>New to Quotation Generator?</span>
          <span style={styles.dividerLine}></span>
        </div> */}
        
        {/* <button 
          onClick={() => onNavigate('register')}
          style={styles.registerButton}
        >
          Create an account
        </button> */}

        {/* Demo credentials hint */}
        {/* <div style={styles.demoHint}>
          <p style={styles.demoTitle}>Demo Credentials:</p>
          <p style={{
            ...styles.demoText,
            fontWeight: loginType === 'admin' ? 'bold' : 'normal',
            color: loginType === 'admin' ? '#667eea' : '#10b981'
          }}>
            Admin: admin@example.com / admin123
          </p>
          <p style={{
            ...styles.demoText,
            fontWeight: loginType === 'user' ? 'bold' : 'normal',
            color: loginType === 'user' ? '#10b981' : '#667eea'
          }}>
            User: user@example.com / user123
          </p>
        </div> */}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <p style={styles.footerText}>© 2024 Quotation Generator. All rights reserved.</p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px',
    position: 'relative',
    overflow: 'hidden'
  },
  bgCircle1: {
    position: 'absolute',
    top: '-10%',
    right: '-10%',
    width: '500px',
    height: '500px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.1)',
    zIndex: 1
  },
  bgCircle2: {
    position: 'absolute',
    bottom: '-10%',
    left: '-10%',
    width: '500px',
    height: '500px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.1)',
    zIndex: 1
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '20px',
    padding: '40px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    width: '100%',
    maxWidth: '450px',
    position: 'relative',
    zIndex: 10,
    animation: 'slideUp 0.5s ease-out'
  },
  logoContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '24px'
  },
  logo: {
    width: '60px',
    height: '60px',
    color: '#667eea'
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: '8px',
    textAlign: 'center'
  },
  subtitle: {
    fontSize: '16px',
    color: '#666',
    marginBottom: '24px',
    textAlign: 'center'
  },
  tabContainer: {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px',
    borderRadius: '10px',
    backgroundColor: '#f3f4f6',
    padding: '4px'
  },
  tab: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: '#6b7280',
    transition: 'all 0.3s'
  },
  activeTab: {
    backgroundColor: 'white',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  userActiveTab: {
    color: '#10b981',
    borderBottom: '2px solid #10b981'
  },
  adminActiveTab: {
    color: '#667eea',
    borderBottom: '2px solid #667eea'
  },
  tabIcon: {
    width: '18px',
    height: '18px'
  },
  roleHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '20px',
    fontSize: '14px',
    fontWeight: '600'
  },
  roleIcon: {
    fontSize: '18px'
  },
  errorContainer: {
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '20px',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    border: '1px solid #fecaca'
  },
  errorIcon: {
    width: '20px',
    height: '20px',
    flexShrink: 0
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  inputIcon: {
    width: '16px',
    height: '16px',
    color: '#667eea'
  },
  input: {
    padding: '12px 16px',
    border: '2px solid #e5e7eb',
    borderRadius: '10px',
    fontSize: '16px',
    transition: 'all 0.3s',
    outline: 'none',
    width: '100%'
  },
  passwordContainer: {
    position: 'relative',
    width: '100%'
  },
  passwordInput: {
    padding: '12px 16px',
    paddingRight: '45px',
    border: '2px solid #e5e7eb',
    borderRadius: '10px',
    fontSize: '16px',
    transition: 'all 0.3s',
    outline: 'none',
    width: '100%'
  },
  passwordToggle: {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#9ca3af',
    padding: '4px'
  },
  toggleIcon: {
    width: '20px',
    height: '20px'
  },
  options: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '14px'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#4b5563',
    cursor: 'pointer'
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer'
  },
  forgotPassword: {
    color: '#667eea',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  },
  button: {
    padding: '14px',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s',
    marginTop: '8px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
  },
  buttonDisabled: {
    opacity: 0.7,
    cursor: 'not-allowed'
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px'
  },
  spinner: {
    width: '20px',
    height: '20px',
    animation: 'spin 1s linear infinite'
  },
  spinnerCircle: {
    opacity: 0.25
  },
  spinnerPath: {
    opacity: 0.75
  },
  demoButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    padding: '10px',
    marginTop: '12px',
    backgroundColor: '#f3f4f6',
    border: '1px dashed #9ca3af',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#4b5563',
    cursor: 'pointer',
    transition: 'all 0.3s'
  },
  demoIcon: {
    width: '18px',
    height: '18px'
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: '24px 0',
    gap: '10px'
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    backgroundColor: '#e5e7eb'
  },
  dividerText: {
    color: '#6b7280',
    fontSize: '14px'
  },
  registerButton: {
    padding: '12px',
    backgroundColor: 'white',
    color: '#667eea',
    border: '2px solid #667eea',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s',
    width: '100%'
  },
  demoHint: {
    marginTop: '24px',
    padding: '12px',
    backgroundColor: '#f3f4f6',
    borderRadius: '8px',
    textAlign: 'center'
  },
  demoTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '8px'
  },
  demoText: {
    fontSize: '12px',
    color: '#6b7280',
    margin: '2px 0'
  },
  footer: {
    marginTop: '20px',
    textAlign: 'center',
    position: 'relative',
    zIndex: 10
  },
  footerText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: '14px'
  }
};

// Add keyframes for animations
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  
  input:focus {
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
  
  button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 12px rgba(0,0,0,0.1);
  }
  
  .demoButton:hover {
    background-color: #e5e7eb;
    border-color: #667eea;
  }
  
  .registerButton:hover {
    background-color: #667eea;
    color: white;
  }
`;
document.head.appendChild(styleSheet);