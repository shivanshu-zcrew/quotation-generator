import React, { useState } from 'react';

export default function RegisterScreen({ onRegister, onNavigate }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreeTerms: false
  });
  
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    
    setFormData(prev => ({
      ...prev,
      [name]: newValue
    }));

    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }

    // Check password strength
    if (name === 'password') {
      calculatePasswordStrength(value);
    }
  };

  const calculatePasswordStrength = (password) => {
    let strength = 0;
    
    if (password.length >= 8) strength += 25;
    if (password.match(/[a-z]+/)) strength += 25;
    if (password.match(/[A-Z]+/)) strength += 25;
    if (password.match(/[0-9]+/)) strength += 25;
    if (password.match(/[$@#&!]+/)) strength += 25;
    
    // Cap at 100
    setPasswordStrength(Math.min(strength, 100));
  };

  const validateForm = () => {
    const newErrors = {};

    // Name validation
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    // Email validation
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    } else if (!/(?=.*[a-z])/.test(formData.password)) {
      newErrors.password = 'Password must contain at least one lowercase letter';
    } else if (!/(?=.*[A-Z])/.test(formData.password)) {
      newErrors.password = 'Password must contain at least one uppercase letter';
    } else if (!/(?=.*[0-9])/.test(formData.password)) {
      newErrors.password = 'Password must contain at least one number';
    }

    // Confirm password validation
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    // Terms agreement
    if (!formData.agreeTerms) {
      newErrors.agreeTerms = 'You must agree to the terms and conditions';
    }

    return newErrors;
  };

  const getPasswordStrengthColor = () => {
    if (passwordStrength < 50) return '#dc2626';
    if (passwordStrength < 75) return '#f59e0b';
    return '#10b981';
  };

  const getPasswordStrengthText = () => {
    if (passwordStrength < 50) return 'Weak';
    if (passwordStrength < 75) return 'Medium';
    return 'Strong';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const newErrors = validateForm();
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);

    const result = await onRegister({
      name: formData.name,
      email: formData.email,
      password: formData.password
    });
    
    if (!result.success) {
      setErrors({ form: result.error });
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Background decorative elements */}
      <div style={styles.bgCircle1}></div>
      <div style={styles.bgCircle2}></div>
      <div style={styles.bgCircle3}></div>
      
      <div style={styles.card}>
        {/* Back to login button */}
        <button 
          onClick={() => onNavigate('login')}
          style={styles.backButton}
        >
          <svg style={styles.backIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Login
        </button>

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
              d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" 
            />
          </svg>
        </div>

        <h1 style={styles.title}>Create Account</h1>
        <p style={styles.subtitle}>Join us to start creating quotations</p>
        
        {errors.form && (
          <div style={styles.errorContainer}>
            <svg style={styles.errorIcon} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span>{errors.form}</span>
          </div>
        )}
        
        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Name Field */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>
              <svg style={styles.inputIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Full Name
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              style={{
                ...styles.input,
                ...(errors.name && styles.inputError)
              }}
              placeholder="Enter your full name"
              disabled={loading}
            />
            {errors.name && <span style={styles.fieldError}>{errors.name}</span>}
          </div>
          
          {/* Email Field */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>
              <svg style={styles.inputIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Email Address
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              style={{
                ...styles.input,
                ...(errors.email && styles.inputError)
              }}
              placeholder="Enter your email"
              disabled={loading}
            />
            {errors.email && <span style={styles.fieldError}>{errors.email}</span>}
          </div>
          
          {/* Password Field */}
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
                name="password"
                value={formData.password}
                onChange={handleChange}
                style={{
                  ...styles.passwordInput,
                  ...(errors.password && styles.inputError)
                }}
                placeholder="Create a password"
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
            
            {/* Password Strength Meter */}
            {formData.password && (
              <div style={styles.strengthMeter}>
                <div style={styles.strengthBarContainer}>
                  <div 
                    style={{
                      ...styles.strengthBar,
                      width: `${passwordStrength}%`,
                      backgroundColor: getPasswordStrengthColor()
                    }}
                  ></div>
                </div>
                <span style={{...styles.strengthText, color: getPasswordStrengthColor()}}>
                  {getPasswordStrengthText()}
                </span>
              </div>
            )}
            
            {errors.password && <span style={styles.fieldError}>{errors.password}</span>}
            
            {/* Password Requirements */}
            <div style={styles.requirements}>
              <p style={styles.requirementsTitle}>Password must contain:</p>
              <ul style={styles.requirementsList}>
                <li style={formData.password.length >= 6 ? styles.requirementMet : styles.requirement}>
                  <svg style={styles.requirementIcon} fill="currentColor" viewBox="0 0 20 20">
                    {formData.password.length >= 6 ? (
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    ) : (
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    )}
                  </svg>
                  At least 6 characters
                </li>
                <li style={/[a-z]/.test(formData.password) ? styles.requirementMet : styles.requirement}>
                  <svg style={styles.requirementIcon} fill="currentColor" viewBox="0 0 20 20">
                    {/[a-z]/.test(formData.password) ? (
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    ) : (
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    )}
                  </svg>
                  One lowercase letter
                </li>
                <li style={/[A-Z]/.test(formData.password) ? styles.requirementMet : styles.requirement}>
                  <svg style={styles.requirementIcon} fill="currentColor" viewBox="0 0 20 20">
                    {/[A-Z]/.test(formData.password) ? (
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    ) : (
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    )}
                  </svg>
                  One uppercase letter
                </li>
                <li style={/[0-9]/.test(formData.password) ? styles.requirementMet : styles.requirement}>
                  <svg style={styles.requirementIcon} fill="currentColor" viewBox="0 0 20 20">
                    {/[0-9]/.test(formData.password) ? (
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    ) : (
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    )}
                  </svg>
                  One number
                </li>
              </ul>
            </div>
          </div>
          
          {/* Confirm Password Field */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>
              <svg style={styles.inputIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Confirm Password
            </label>
            <div style={styles.passwordContainer}>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                style={{
                  ...styles.passwordInput,
                  ...(errors.confirmPassword && styles.inputError)
                }}
                placeholder="Confirm your password"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                style={styles.passwordToggle}
              >
                {showConfirmPassword ? (
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
            {errors.confirmPassword && <span style={styles.fieldError}>{errors.confirmPassword}</span>}
          </div>
          
          {/* Terms and Conditions */}
          <div style={styles.termsContainer}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                name="agreeTerms"
                checked={formData.agreeTerms}
                onChange={handleChange}
                style={styles.checkbox}
                disabled={loading}
              />
              <span style={styles.termsText}>
                I agree to the{' '}
                <button 
                  type="button"
                  style={styles.termsLink}
                  onClick={() => alert('Terms and conditions would open here')}
                >
                  Terms of Service
                </button>
                {' '}and{' '}
                <button 
                  type="button"
                  style={styles.termsLink}
                  onClick={() => alert('Privacy policy would open here')}
                >
                  Privacy Policy
                </button>
              </span>
            </label>
            {errors.agreeTerms && <span style={styles.fieldError}>{errors.agreeTerms}</span>}
          </div>
          
          <button 
            type="submit" 
            style={{
              ...styles.button,
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
                Creating Account...
              </span>
            ) : 'Create Account'}
          </button>
        </form>
        
        <div style={styles.divider}>
          <span style={styles.dividerLine}></span>
          <span style={styles.dividerText}>Already have an account?</span>
          <span style={styles.dividerLine}></span>
        </div>
        
        <button 
          onClick={() => onNavigate('login')}
          style={styles.loginButton}
        >
          Sign In Instead
        </button>
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
  bgCircle3: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '800px',
    height: '800px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.05)',
    zIndex: 1
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '20px',
    padding: '40px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    width: '100%',
    maxWidth: '500px',
    position: 'relative',
    zIndex: 10,
    animation: 'slideUp 0.5s ease-out',
    maxHeight: '90vh',
    overflowY: 'auto'
  },
  backButton: {
    position: 'absolute',
    top: '20px',
    left: '20px',
    background: 'none',
    border: 'none',
    color: '#667eea',
    fontSize: '14px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px',
    borderRadius: '6px',
    transition: 'all 0.3s'
  },
  backIcon: {
    width: '16px',
    height: '16px'
  },
  logoContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '16px'
  },
  logo: {
    width: '50px',
    height: '50px',
    color: '#667eea'
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: '4px',
    textAlign: 'center'
  },
  subtitle: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '24px',
    textAlign: 'center'
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
    gap: '16px'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#374151',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  inputIcon: {
    width: '14px',
    height: '14px',
    color: '#667eea'
  },
  input: {
    padding: '10px 14px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    transition: 'all 0.3s',
    outline: 'none',
    width: '100%'
  },
  inputError: {
    borderColor: '#dc2626'
  },
  fieldError: {
    color: '#dc2626',
    fontSize: '12px',
    marginTop: '2px'
  },
  passwordContainer: {
    position: 'relative',
    width: '100%'
  },
  passwordInput: {
    padding: '10px 14px',
    paddingRight: '40px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    transition: 'all 0.3s',
    outline: 'none',
    width: '100%'
  },
  passwordToggle: {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#9ca3af',
    padding: '4px'
  },
  toggleIcon: {
    width: '18px',
    height: '18px'
  },
  strengthMeter: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '4px'
  },
  strengthBarContainer: {
    flex: 1,
    height: '4px',
    backgroundColor: '#e5e7eb',
    borderRadius: '2px',
    overflow: 'hidden'
  },
  strengthBar: {
    height: '100%',
    transition: 'width 0.3s ease'
  },
  strengthText: {
    fontSize: '11px',
    fontWeight: '600',
    minWidth: '45px'
  },
  requirements: {
    marginTop: '8px',
    padding: '10px',
    backgroundColor: '#f9fafb',
    borderRadius: '6px'
  },
  requirementsTitle: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: '6px'
  },
  requirementsList: {
    listStyle: 'none',
    padding: 0,
    margin: 0
  },
  requirement: {
    fontSize: '11px',
    color: '#9ca3af',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginBottom: '2px'
  },
  requirementMet: {
    fontSize: '11px',
    color: '#10b981',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginBottom: '2px'
  },
  requirementIcon: {
    width: '12px',
    height: '12px'
  },
  termsContainer: {
    marginTop: '4px'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer'
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer'
  },
  termsText: {
    fontSize: '13px',
    color: '#4b5563'
  },
  termsLink: {
    color: '#667eea',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    textDecoration: 'underline',
    padding: 0
  },
  button: {
    padding: '12px',
    backgroundColor: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s',
    marginTop: '8px',
    boxShadow: '0 4px 6px rgba(102, 126, 234, 0.4)'
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
    width: '18px',
    height: '18px',
    animation: 'spin 1s linear infinite'
  },
  spinnerCircle: {
    opacity: 0.25
  },
  spinnerPath: {
    opacity: 0.75
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: '20px 0 12px',
    gap: '10px'
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    backgroundColor: '#e5e7eb'
  },
  dividerText: {
    color: '#6b7280',
    fontSize: '13px'
  },
  loginButton: {
    padding: '10px',
    backgroundColor: 'white',
    color: '#667eea',
    border: '2px solid #667eea',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s',
    width: '100%'
  },
  footer: {
    marginTop: '20px',
    textAlign: 'center',
    position: 'relative',
    zIndex: 10
  },
  footerText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: '13px'
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
    box-shadow: 0 6px 12px rgba(102, 126, 234, 0.4);
  }
  
  .backButton:hover {
    background-color: #f3f4f6;
  }
  
  .loginButton:hover {
    background-color: #667eea;
    color: white;
  }
  
  ::-webkit-scrollbar {
    width: 8px;
  }
  
  ::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 10px;
  }
  
  ::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 10px;
  }
  
  ::-webkit-scrollbar-thumb:hover {
    background: #555;
  }
`;
document.head.appendChild(styleSheet);