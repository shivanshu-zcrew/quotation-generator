import React, { useState } from "react";
import { authAPI } from "../services/api";

export function PasswordResetModal({
    open,
    user,
    onClose,
    onSuccess,
    loading,
  }) {
    const [resetMethod, setResetMethod] = useState('direct'); // 'direct', 'email', or 'temp'
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [errors, setErrors] = useState({});
    const [actionLoading, setActionLoading] = useState(false);
    const [tempPassword, setTempPassword] = useState('');
    const [copied, setCopied] = useState(false);
   
    if (!open || !user) return null;
   
    const validatePasswordForm = () => {
      const e = {};
      if (!newPassword) e.password = 'Password is required';
      else if (newPassword.length < 6) e.password = 'Minimum 6 characters';
      
      if (!confirmPassword) e.confirm = 'Please confirm password';
      else if (newPassword !== confirmPassword) e.confirm = 'Passwords do not match';
      
      return e;
    };
   
    const handleSetPassword = async () => {
        const e = validatePasswordForm();
        if (Object.keys(e).length) {
          setErrors(e);
          return;
        }
      
        setActionLoading(true);
        try {
          const response = await authAPI.setUserPassword(user._id, {
            newPassword: newPassword,
          });
          
           if (response.data?.message || response.data?.user) {
            onSuccess(`Password set for ${user.name}`);
            handleClose();
          } else {
            throw new Error('Unexpected response format');
          }
        } catch (error) {
          setErrors({
            submit: error.response?.data?.message || error.message || 'Failed to set password',
          });
        } finally {
          setActionLoading(false);
        }
      };
   
    const handleSendResetEmail = async () => {
      setActionLoading(true);
      try {
        const response = await authAPI.sendPasswordResetEmail(user._id);
        onSuccess(`Password reset link sent to ${user.email}`);
        handleClose();
      } catch (error) {
        setErrors({
          submit: error.response?.data?.message || 'Failed to send reset email',
        });
      } finally {
        setActionLoading(false);
      }
    };
   
    const handleGenerateTempPassword = async () => {
      setActionLoading(true);
      try {
        const response = await authAPI.generateTemporaryPassword(user._id);
        setTempPassword(response.data.tempPassword);
        onSuccess(`Temporary password generated for ${user.name}`);
      } catch (error) {
        setErrors({
          submit: error.response?.data?.message || 'Failed to generate temporary password',
        });
      } finally {
        setActionLoading(false);
      }
    };
   
    const copyToClipboard = () => {
      navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
   
    const handleClose = () => {
      setResetMethod('direct');
      setNewPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setErrors({});
      setTempPassword('');
      setCopied(false);
      onClose();
    };
   
    return (
      <div style={styles.modalOverlay}>
        <div style={styles.modal}>
          {/* Header */}
          <div style={styles.modalHeader}>
            <div style={styles.modalHeaderLeft}>
              <div style={styles.modalIcon}>
                <svg width="20" height="20" fill="none" stroke="white" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <div>
                <h2 style={styles.modalTitle}>Reset Password</h2>
                <p style={styles.modalSubtitle}>For {user.name}</p>
              </div>
            </div>
            <button onClick={handleClose} style={styles.closeBtn} disabled={actionLoading}>
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
   
          {/* Error Banner */}
          {errors.submit && (
            <div style={styles.errorBanner}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {errors.submit}
            </div>
          )}
   
          {/* Body */}
          <div style={styles.body}>
            {/* Reset Method Selector */}
            <div style={styles.fieldWrapper}>
              <label style={styles.label}>Reset Method</label>
              <div style={styles.methodContainer}>
                {[
                  {
                    key: 'direct',
                    label: 'Set Password Directly',
                    icon: '🔒',
                    desc: 'Set a new password immediately'
                  },
                   
                ].map((method) => (
                  <button
                    key={method.key}
                    type="button"
                    onClick={() => {
                      setResetMethod(method.key);
                      setErrors({});
                      setTempPassword('');
                    }}
                    disabled={actionLoading || (tempPassword && method.key !== 'temp')}
                    style={{
                      ...styles.methodButton,
                      borderColor: resetMethod === method.key ? '#667eea' : '#e5e7eb',
                      backgroundColor: resetMethod === method.key ? '#667eea15' : 'white',
                      color: resetMethod === method.key ? '#667eea' : '#374151',
                      fontWeight: resetMethod === method.key ? '600' : '500',
                    }}
                  >
                    <span style={styles.methodIcon}>{method.icon}</span>
                    <div style={styles.methodContent}>
                      <div>{method.label}</div>
                      <div style={{
                        ...styles.methodDesc,
                        color: resetMethod === method.key ? '#667eea' : '#9ca3af',
                      }}>
                        {method.desc}
                      </div>
                    </div>
                    {resetMethod === method.key && <span style={styles.methodCheck}>✓</span>}
                  </button>
                ))}
              </div>
            </div>
   
            {/* Method 1: Direct Password Input */}
            {resetMethod === 'direct' && (
              <>
                <div style={styles.fieldWrapper}>
                  <label style={styles.label}>New Password</label>
                  <div style={styles.passwordContainer}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        if (errors.password) setErrors({ ...errors, password: '' });
                      }}
                      placeholder="Min. 6 characters"
                      style={{
                        ...styles.input,
                        ...(errors.password ? styles.inputError : {}),
                      }}
                      disabled={actionLoading}
                    />
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      style={styles.eyeBtn}
                      type="button"
                    >
                      {showPassword ? (
                        <svg width="16" height="16" fill="none" stroke="#9ca3af" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" fill="none" stroke="#9ca3af" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {errors.password && <span style={styles.errorMsg}>{errors.password}</span>}
                </div>
   
                <div style={styles.fieldWrapper}>
                  <label style={styles.label}>Confirm Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (errors.confirm) setErrors({ ...errors, confirm: '' });
                    }}
                    placeholder="Repeat password"
                    style={{
                      ...styles.input,
                      ...(errors.confirm ? styles.inputError : {}),
                    }}
                    disabled={actionLoading}
                  />
                  {errors.confirm && <span style={styles.errorMsg}>{errors.confirm}</span>}
                </div>
              </>
            )}
   
            {/* Method 3: Temporary Password Display */}
            {resetMethod === 'temp' && tempPassword && (
              <div style={styles.tempPasswordContainer}>
                <div style={styles.tempPasswordTitle}>
                  ✓ Temporary Password Generated
                </div>
                <div style={styles.tempPasswordBox}>
                  <span style={styles.tempPasswordValue}>{tempPassword}</span>
                  <button
                    onClick={copyToClipboard}
                    style={styles.copyBtn}
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <div style={styles.tempPasswordNote}>
                  Share this password with the user. They must change it on first login.
                </div>
              </div>
            )}
          </div>
   
          {/* Footer */}
          <div style={styles.footer}>
            <button onClick={handleClose} style={styles.cancelBtn} disabled={actionLoading}>
              Cancel
            </button>
            {resetMethod === 'direct' && (
              <button
                onClick={handleSetPassword}
                style={styles.submitBtn}
                disabled={actionLoading || !newPassword || !confirmPassword}
              >
                {actionLoading ? 'Setting...' : 'Set Password'}
              </button>
            )}
            {resetMethod === 'email' && (
              <button
                onClick={handleSendResetEmail}
                style={styles.submitBtn}
                disabled={actionLoading}
              >
                {actionLoading ? 'Sending...' : 'Send Reset Email'}
              </button>
            )}
            {resetMethod === 'temp' && (
              <button
                onClick={handleGenerateTempPassword}
                style={styles.submitBtn}
                disabled={actionLoading || tempPassword}
              >
                {actionLoading ? 'Generating...' : 'Generate Password'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

// ============================================================
// STYLES
// ============================================================

const styles = {
  // Modal Overlay
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    animation: 'fadeIn 0.2s ease-out',
  },
  
  // Modal Container
  modal: {
    backgroundColor: 'white',
    borderRadius: '16px',
    width: '90%',
    maxWidth: '480px',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    animation: 'slideUp 0.3s ease-out',
  },
  
  // Header
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '20px 24px',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#f8f9fa',
    borderRadius: '16px 16px 0 0',
  },
  
  modalHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  
  modalIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 6px -1px rgba(102, 126, 234, 0.2)',
  },
  
  modalTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '700',
    color: '#1f2937',
  },
  
  modalSubtitle: {
    margin: '4px 0 0',
    fontSize: '13px',
    color: '#6b7280',
  },
  
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '8px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9ca3af',
    transition: 'all 0.2s',
  },
  
  // Error Banner
  errorBanner: {
    margin: '16px 24px 0',
    padding: '12px 16px',
    backgroundColor: '#fee2e2',
    border: '1px solid #fecaca',
    borderRadius: '10px',
    color: '#dc2626',
    fontSize: '13px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  
  // Body
  body: {
    padding: '24px',
  },
  
  // Form Fields
  fieldWrapper: {
    marginBottom: '20px',
  },
  
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '8px',
  },
  
  methodContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  
  methodButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    border: '1.5px solid #e5e7eb',
    borderRadius: '12px',
    backgroundColor: 'white',
    fontSize: '14px',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    transition: 'all 0.2s',
  },
  
  methodIcon: {
    fontSize: '18px',
  },
  
  methodContent: {
    flex: 1,
  },
  
  methodDesc: {
    fontSize: '12px',
    marginTop: '2px',
  },
  
  methodCheck: {
    fontSize: '16px',
    fontWeight: 'bold',
  },
  
  passwordContainer: {
    position: 'relative',
  },
  
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1.5px solid #e5e7eb',
    borderRadius: '10px',
    fontSize: '14px',
    transition: 'all 0.2s',
    boxSizing: 'border-box',
    outline: 'none',
  },
  
  inputError: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  
  eyeBtn: {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  errorMsg: {
    display: 'block',
    fontSize: '11px',
    color: '#dc2626',
    marginTop: '6px',
  },
  
  // Temporary Password
  tempPasswordContainer: {
    padding: '12px',
    backgroundColor: '#ecfdf5',
    border: '1px solid #6ee7b7',
    borderRadius: '12px',
    marginTop: '12px',
  },
  
  tempPasswordTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#065f46',
    marginBottom: '8px',
  },
  
  tempPasswordBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px',
    backgroundColor: 'white',
    borderRadius: '8px',
    fontFamily: 'monospace',
    fontSize: '14px',
    fontWeight: '600',
    color: '#065f46',
  },
  
  tempPasswordValue: {
    flex: 1,
    wordBreak: 'break-all',
  },
  
  copyBtn: {
    background: '#065f46',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  
  tempPasswordNote: {
    fontSize: '11px',
    color: '#065f46',
    marginTop: '8px',
  },
  
  // Footer
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    padding: '16px 24px',
    borderTop: '1px solid #f0f0f0',
    backgroundColor: '#f8f9fa',
    borderRadius: '0 0 16px 16px',
  },
  
  cancelBtn: {
    padding: '8px 16px',
    backgroundColor: 'white',
    color: '#6b7280',
    border: '1.5px solid #e5e7eb',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  
  submitBtn: {
    padding: '8px 20px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 2px 4px rgba(102, 126, 234, 0.2)',
  },
};

// Add keyframe animations to document
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
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
    
    button:hover {
      transform: translateY(-1px);
    }
    
    button:active {
      transform: translateY(0);
    }
    
    input:focus {
      border-color: #667eea !important;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
  `;
  document.head.appendChild(styleSheet);
}