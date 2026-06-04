import React, { useState } from "react";
import { authAPI } from "../services/api";
import { X, Eye, EyeOff, Key, Copy, Check, AlertCircle } from 'lucide-react';

export function PasswordResetModal({
    open,
    user,
    onClose,
    onSuccess,
    loading,
  }) {
    const [resetMethod, setResetMethod] = useState('direct');
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
                <Key size={20} color="white" />
              </div>
              <div>
                <h2 style={styles.modalTitle}>Reset Password</h2>
                <p style={styles.modalSubtitle}>For {user.name}</p>
              </div>
            </div>
            <button onClick={handleClose} style={styles.closeBtn} disabled={actionLoading}>
              <X size={20} />
            </button>
          </div>
   
          {/* Error Banner */}
          {errors.submit && (
            <div style={styles.errorBanner}>
              <AlertCircle size={16} />
              {errors.submit}
            </div>
          )}
   
          {/* Body */}
          <div style={styles.body}>
            {/* Reset Method Selector */}
            <div style={styles.fieldWrapper}>
              <label style={styles.label}>Reset Method</label>
              <div style={styles.methodContainer}>
                <button
                  type="button"
                  onClick={() => {
                    setResetMethod('direct');
                    setErrors({});
                    setTempPassword('');
                  }}
                  disabled={actionLoading}
                  style={{
                    ...styles.methodButton,
                    borderColor: resetMethod === 'direct' ? '#667eea' : '#e5e7eb',
                    backgroundColor: resetMethod === 'direct' ? '#667eea15' : 'white',
                    color: resetMethod === 'direct' ? '#667eea' : '#374151',
                    fontWeight: resetMethod === 'direct' ? '600' : '500',
                  }}
                >
                  <span style={styles.methodIcon}>🔒</span>
                  <div style={styles.methodContent}>
                    <div>Set Password Directly</div>
                    <div style={{
                      ...styles.methodDesc,
                      color: resetMethod === 'direct' ? '#667eea' : '#9ca3af',
                    }}>
                      Set a new password immediately
                    </div>
                  </div>
                  {resetMethod === 'direct' && <span style={styles.methodCheck}>✓</span>}
                </button>
              </div>
            </div>
   
            {/* Direct Password Input */}
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
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
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
   
            {/* Temporary Password Display */}
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
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? ' Copied' : ' Copy'}
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
          </div>
        </div>
      </div>
    );
  }

// ============================================================
// STYLES - Updated with rgb(15, 23, 42) as primary color
// ============================================================

const PRIMARY_COLOR = 'rgb(15, 23, 42)';
const PRIMARY_DARK = '#0a0f1a';
const ACCENT_COLOR = '#667eea';

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
  },
  
  // Header - Updated with PRIMARY_COLOR
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '20px 24px',
    borderBottom: `1px solid ${PRIMARY_DARK}`,
    backgroundColor: PRIMARY_COLOR,
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
    background: `linear-gradient(135deg, ${ACCENT_COLOR} 0%, #764ba2 100%)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 6px -1px rgba(102, 126, 234, 0.2)',
  },
  
  modalTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '700',
    color: 'white',
  },
  
  modalSubtitle: {
    margin: '4px 0 0',
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  
  closeBtn: {
    background: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    borderRadius: '8px',
    padding: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#94a3b8',
    transition: 'all 0.2s',
  },
  
  // Error Banner
  errorBanner: {
    margin: '16px 24px 0',
    padding: '12px 16px',
    backgroundColor: '#fef2f2',
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
    padding: '10px 40px 10px 12px',
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
    color: '#9ca3af',
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
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
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
    borderTop: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    borderRadius: '0 0 16px 16px',
  },
  
  cancelBtn: {
    padding: '8px 16px',
    backgroundColor: 'white',
    color: '#64748b',
    border: '1.5px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  
  submitBtn: {
    padding: '8px 20px',
    background: `linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${PRIMARY_DARK} 100%)`,
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: `0 2px 4px rgba(15, 23, 42, 0.2)`,
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
    
    button:hover:not(:disabled) {
      transform: translateY(-1px);
      opacity: 0.9;
    }
    
    button:active:not(:disabled) {
      transform: translateY(0);
    }
    
    input:focus {
      border-color: ${ACCENT_COLOR} !important;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    
    .modal-overlay {
      animation: fadeIn 0.2s ease-out;
    }
    
    .modal-container {
      animation: slideUp 0.3s ease-out;
    }
  `;
  document.head.appendChild(styleSheet);
}