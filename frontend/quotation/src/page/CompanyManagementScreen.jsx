import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Plus, Edit2, Trash2, ToggleLeft, ToggleRight, X, Save, Loader, Building2, Search, AlertCircle } from 'lucide-react';
import { companyAPI } from '../services/api';

const CURRENCIES = ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR'];

const emptyForm = {
  code: '', name: '', phone: '', email: '', website: '',
  vatNumber: '', crNumber: '', taxRate: 5,
  baseCurrency: 'AED', zohoOrganizationId: '',
  address: { street: '', city: '', country: 'UAE', poBox: '' },
  bankDetails: { bankName: '', accountName: '', accountNumber: '', iban: '', swift: '' },
};

function Snack({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  const bg = type === 'success' ? '#10b981' : '#ef4444';
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, background: bg, color: '#fff', padding: '12px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14, zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,.2)', display: 'flex', alignItems: 'center', gap: 10 }}>
      {msg}
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', lineHeight: 1 }}><X size={14} /></button>
    </div>
  );
}

function CompanyModal({ company, onClose, onSaved }) {
  const isEdit = !!company?._id;
  const [form, setForm] = useState(isEdit ? {
    code: company.code || '', name: company.name || '',
    phone: company.phone || '', email: company.email || '', website: company.website || '',
    vatNumber: company.vatNumber || '', crNumber: company.crNumber || '',
    taxRate: company.taxRate ?? 5, baseCurrency: company.baseCurrency || 'AED',
    zohoOrganizationId: company.zohoOrganizationId || '',
    address: { street: company.address?.street || '', city: company.address?.city || '', country: company.address?.country || 'UAE', poBox: company.address?.poBox || '' },
    bankDetails: { bankName: company.bankDetails?.bankName || '', accountName: company.bankDetails?.accountName || '', accountNumber: company.bankDetails?.accountNumber || '', iban: company.bankDetails?.iban || '', swift: company.bankDetails?.swift || '' },
  } : emptyForm);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const set = (field, value) => setForm(p => ({ ...p, [field]: value }));
  const setNested = (group, field, value) => setForm(p => ({ ...p, [group]: { ...p[group], [field]: value } }));

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Company name is required';
    if (!form.code.trim()) e.code = 'Company code is required';
    if (!form.zohoOrganizationId.trim()) e.zohoOrganizationId = 'Zoho Organisation ID is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEdit) await companyAPI.update(company._id, form);
      else await companyAPI.create(form);
      onSaved();
    } catch (err) {
      setErrors({ submit: err?.response?.data?.message || 'Failed to save company' });
    } finally {
      setSaving(false);
    }
  };

  const inp = (label, field, placeholder, required) => (
    <div>
      <label style={s.label}>{label}{required && ' *'}</label>
      <input value={form[field]} onChange={e => set(field, e.target.value)} placeholder={placeholder}
        style={{ ...s.input, borderColor: errors[field] ? '#ef4444' : '#e2e8f0' }} />
      {errors[field] && <p style={s.err}>{errors[field]}</p>}
    </div>
  );

  const nestedInp = (label, group, field, placeholder) => (
    <div>
      <label style={s.label}>{label}</label>
      <input value={form[group][field]} onChange={e => setNested(group, field, e.target.value)} placeholder={placeholder} style={s.input} />
    </div>
  );

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>{isEdit ? 'Edit Company' : 'Add New Company'}</h2>
          <button onClick={onClose} style={s.closeBtn}><X size={18} /></button>
        </div>

        <div style={s.modalBody}>
          {errors.submit && <div style={s.submitErr}><AlertCircle size={15} /> {errors.submit}</div>}

          <Section title="Basic Information">
            <div style={s.grid2}>
              {inp('Company Name', 'name', 'e.g. Mega Repairing LLC', true)}
              {inp('Company Code', 'code', 'e.g. MRME', true)}
            </div>
            <div style={s.grid2}>
              {inp('Email', 'email', 'info@company.com')}
              {inp('Phone', 'phone', '+971 4 000 0000')}
            </div>
            <div style={s.grid2}>
              {inp('Website', 'website', 'https://company.com')}
              <div>
                <label style={s.label}>Base Currency *</label>
                <select value={form.baseCurrency} onChange={e => set('baseCurrency', e.target.value)} style={s.input}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={s.grid2}>
              {inp('VAT / TRN Number', 'vatNumber', 'e.g. 100123456700003')}
              {inp('CR / Trade License No.', 'crNumber', 'e.g. CN-1234567')}
            </div>
            <div style={s.grid2}>
              <div>
                <label style={s.label}>Default Tax Rate (%)</label>
                <input type="number" min="0" max="100" value={form.taxRate} onChange={e => set('taxRate', Number(e.target.value))} style={s.input} />
              </div>
              {inp('Zoho Organisation ID', 'zohoOrganizationId', 'e.g. 916255903', true)}
            </div>
          </Section>

          <Section title="Address">
            <div style={s.grid2}>
              {nestedInp('Street', 'address', 'street', 'Street address')}
              {nestedInp('City', 'address', 'city', 'City')}
            </div>
            <div style={s.grid2}>
              {nestedInp('Country', 'address', 'country', 'Country')}
              {nestedInp('P.O. Box', 'address', 'poBox', 'P.O. Box')}
            </div>
          </Section>

          <Section title="Bank Details">
            <div style={s.grid2}>
              {nestedInp('Bank Name', 'bankDetails', 'bankName', 'e.g. Emirates NBD')}
              {nestedInp('Account Name', 'bankDetails', 'accountName', 'Account holder name')}
            </div>
            <div style={s.grid2}>
              {nestedInp('Account Number', 'bankDetails', 'accountNumber', 'Account number')}
              {nestedInp('IBAN', 'bankDetails', 'iban', 'e.g. AE070331234567890123456')}
            </div>
            {nestedInp('SWIFT / BIC Code', 'bankDetails', 'swift', 'e.g. EBILAEAD')}
          </Section>
        </div>

        <div style={s.modalFooter}>
          <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={s.saveBtn}>
            {saving ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : <><Save size={15} /> {isEdit ? 'Save Changes' : 'Create Company'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0C405A', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, paddingBottom: 6, borderBottom: '2px solid #e0f0f8' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div style={s.overlay} onClick={onCancel}>
      <div style={{ ...s.modal, maxWidth: 420, padding: 32 }} onClick={e => e.stopPropagation()}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <AlertCircle size={40} color="#ef4444" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 15, color: '#374151', fontWeight: 500 }}>{message}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={onCancel} style={s.cancelBtn}>Cancel</button>
          <button onClick={onConfirm} style={{ ...s.saveBtn, background: '#ef4444' }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

export default function CompanyManagementScreen({ onBack }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [modal, setModal] = useState(null); // null | { type: 'add'|'edit'|'delete', company? }
  const [snack, setSnack] = useState(null);
  const [toggling, setToggling] = useState(null);

  const showSnack = useCallback((msg, type = 'success') => setSnack({ msg, type }), []);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await companyAPI.getAll();
      const all = res?.data?.companies || [];
      setCompanies(all);
    } catch {
      showSnack('Failed to load companies', 'error');
    } finally {
      setLoading(false);
    }
  }, [showSnack]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  const filtered = companies.filter(c => {
    const matchSearch = !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.code?.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || (filterStatus === 'active' ? c.isActive : !c.isActive);
    return matchSearch && matchStatus;
  });

  const handleToggle = async (company) => {
    setToggling(company._id);
    try {
      await companyAPI.toggleStatus(company._id);
      setCompanies(prev => prev.map(c => c._id === company._id ? { ...c, isActive: !c.isActive } : c));
      showSnack(`${company.name} ${company.isActive ? 'deactivated' : 'activated'} successfully`);
    } catch {
      showSnack('Failed to update status', 'error');
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async () => {
    const company = modal.company;
    try {
      await companyAPI.delete(company._id);
      setCompanies(prev => prev.filter(c => c._id !== company._id));
      showSnack(`${company.name} deleted successfully`);
    } catch (err) {
      showSnack(err?.response?.data?.message || 'Failed to delete company', 'error');
    } finally {
      setModal(null);
    }
  };

  const handleSaved = async () => {
    setModal(null);
    await fetchCompanies();
    showSnack(modal?.type === 'edit' ? 'Company updated successfully' : 'Company created successfully');
  };

  const activeCount = companies.filter(c => c.isActive).length;
  const inactiveCount = companies.length - activeCount;

  return (
    <div style={s.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={s.backBtn}><ArrowLeft size={18} /></button>
          <div>
            <h1 style={s.title}><Building2 size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} />Company Management</h1>
            <p style={s.subtitle}>Add, edit and manage all companies in the system</p>
          </div>
        </div>
        <button onClick={() => setModal({ type: 'add' })} style={s.addBtn}>
          <Plus size={16} /> Add Company
        </button>
      </div>

      {/* Stats */}
      <div style={s.statsRow}>
        {[
          { label: 'Total Companies', value: companies.length, color: '#0C405A' },
          { label: 'Active', value: activeCount, color: '#10b981' },
          { label: 'Inactive', value: inactiveCount, color: '#6b7280' },
        ].map(stat => (
          <div key={stat.label} style={s.statCard}>
            <div style={{ fontSize: 28, fontWeight: 800, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={s.filterRow}>
        <div style={s.searchWrap}>
          <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, code or email…" style={s.searchInput} />
        </div>
        <div style={s.tabs}>
          {['all', 'active', 'inactive'].map(f => (
            <button key={f} onClick={() => setFilterStatus(f)} style={{ ...s.tab, ...(filterStatus === f ? s.tabActive : {}) }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={s.tableWrap}>
        {loading ? (
          <div style={s.centered}><Loader size={28} color="#0C405A" style={{ animation: 'spin 1s linear infinite' }} /></div>
        ) : filtered.length === 0 ? (
          <div style={s.centered}>
            <Building2 size={40} color="#d1d5db" style={{ marginBottom: 8 }} />
            <p style={{ color: '#9ca3af', fontWeight: 500 }}>No companies found</p>
          </div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                {['Company', 'Code', 'Contact', 'Currency', 'Tax Rate', 'Status', 'Actions'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((company, i) => (
                <tr key={company._id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                  <td style={s.td}>
                    <div style={{ fontWeight: 600, color: '#111827', fontSize: 14 }}>{company.name}</div>
                    {company.email && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{company.email}</div>}
                  </td>
                  <td style={s.tdCenter}>
                    <span style={s.codeBadge}>{company.code}</span>
                  </td>
                  <td style={s.td}>
                    <div style={{ fontSize: 13, color: '#374151' }}>{company.phone || '—'}</div>
                    {company.address?.city && <div style={{ fontSize: 12, color: '#6b7280' }}>{company.address.city}{company.address.country ? `, ${company.address.country}` : ''}</div>}
                  </td>
                  <td style={s.tdCenter}>
                    <span style={s.currencyBadge}>{company.baseCurrency}</span>
                  </td>
                  <td style={s.tdCenter}>{company.taxRate ?? 5}%</td>
                  <td style={s.tdCenter}>
                    <span style={{ ...s.statusBadge, background: company.isActive ? '#d1fae5' : '#f3f4f6', color: company.isActive ? '#065f46' : '#6b7280' }}>
                      {company.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={s.tdCenter}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button title="Edit" onClick={() => setModal({ type: 'edit', company })} style={s.iconBtn('#3b82f6')}>
                        <Edit2 size={14} />
                      </button>
                      <button title={company.isActive ? 'Deactivate' : 'Activate'} onClick={() => handleToggle(company)} disabled={toggling === company._id} style={s.iconBtn(company.isActive ? '#f59e0b' : '#10b981')}>
                        {toggling === company._id ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : company.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      </button>
                      <button title="Delete" onClick={() => setModal({ type: 'delete', company })} style={s.iconBtn('#ef4444')}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {(modal?.type === 'add' || modal?.type === 'edit') && (
        <CompanyModal company={modal.company} onClose={() => setModal(null)} onSaved={handleSaved} />
      )}
      {modal?.type === 'delete' && (
        <ConfirmModal
          message={`Are you sure you want to delete "${modal.company.name}"? This action cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setModal(null)}
        />
      )}

      {snack && <Snack msg={snack.msg} type={snack.type} onClose={() => setSnack(null)} />}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────
const s = {
  page: { minHeight: '100vh', background: '#f0f9ff', padding: '1.5rem', fontFamily: 'system-ui,-apple-system,sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 22, fontWeight: 800, color: '#0C405A', margin: 0 },
  subtitle: { fontSize: 13, color: '#6b7280', margin: '2px 0 0' },
  backBtn: { background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#374151' },
  addBtn: { background: '#0C405A', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 },
  statsRow: { display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' },
  statCard: { background: '#fff', borderRadius: 12, padding: '16px 24px', boxShadow: '0 1px 4px rgba(0,0,0,.06)', flex: 1, minWidth: 120 },
  filterRow: { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  searchWrap: { position: 'relative', flex: 1, minWidth: 220 },
  searchInput: { width: '100%', padding: '9px 12px 9px 36px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  tabs: { display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 4 },
  tab: { border: 'none', background: 'none', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#6b7280' },
  tabActive: { background: '#fff', color: '#0C405A', fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,.08)' },
  tableWrap: { background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.06)', overflow: 'hidden' },
  centered: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, color: '#9ca3af' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: '#0C405A' },
  th: { padding: '12px 16px', color: '#fff', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left', whiteSpace: 'nowrap' },
  td: { padding: '12px 16px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' },
  tdCenter: { padding: '12px 16px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle', textAlign: 'center' },
  codeBadge: { background: '#eff6ff', color: '#1d4ed8', padding: '3px 10px', borderRadius: 6, fontWeight: 700, fontSize: 12 },
  currencyBadge: { background: '#f0fdf4', color: '#15803d', padding: '3px 10px', borderRadius: 6, fontWeight: 700, fontSize: 12 },
  statusBadge: { padding: '3px 10px', borderRadius: 20, fontWeight: 600, fontSize: 12 },
  iconBtn: (color) => ({ background: `${color}15`, color, border: 'none', borderRadius: 7, padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'background .15s' }),
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.2)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #f1f5f9' },
  modalTitle: { fontSize: 18, fontWeight: 700, color: '#0C405A', margin: 0 },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', display: 'flex', padding: 4 },
  modalBody: { padding: '24px', overflowY: 'auto', flex: 1 },
  modalFooter: { padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 10 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 },
  input: { width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  err: { color: '#ef4444', fontSize: 11, marginTop: 3 },
  submitErr: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 },
  cancelBtn: { background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  saveBtn: { background: '#0C405A', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 },
};
