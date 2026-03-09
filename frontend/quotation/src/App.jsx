import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useParams,
  useLocation,
} from 'react-router-dom';

import {
  customerAPI,
  itemAPI,
  quotationAPI,
  authAPI,
  adminAPI,
  getCurrentUser,
  isAuthenticated,
  setAuthData,
  clearAuthData,
} from './services/api';

import HomeScreen              from './page/HomeScreen';
import CustomersScreen         from './page/CustomersScreen';
import ItemsScreen             from './page/ItemsScreen';
import QuotationScreen         from './page/QuotationScreen';
import ViewQuotationScreen     from './page/ViewQuotationScreen';
import LoginScreen             from './page/LoginScreen';
import RegisterScreen          from './page/RegisterScreen';
import AdminDashboard          from './page/AdminDashboard';
import PendingQuotationsScreen from './page/PendingQuotationsScreen';
import UserManagementScreen    from './page/UserManagementScreen';

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────
const AppContext = createContext(null);
const useApp = () => useContext(AppContext);

// ─────────────────────────────────────────────────────────────────────────────
// Route guards
// ─────────────────────────────────────────────────────────────────────────────
function RequireAuth({ children }) {
  const location = useLocation();
  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

function RequireAdmin({ children }) {
  const location = useLocation();
  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (getCurrentUser()?.role !== 'admin') {
    return <Navigate to="/home" replace />;
  }
  return children;
}

function GuestOnly({ children }) {
  if (isAuthenticated()) {
    const dest = getCurrentUser()?.role === 'admin' ? '/admin' : '/home';
    return <Navigate to={dest} replace />;
  }
  return children;
}

function RootRedirect() {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  const dest = getCurrentUser()?.role === 'admin' ? '/admin' : '/home';
  return <Navigate to={dest} replace />;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOC: inject onBack={() => navigate(-1)} into any screen
// ─────────────────────────────────────────────────────────────────────────────
function withBack(Component) {
  return function Wrapped(props) {
    const navigate = useNavigate();
    return <Component {...props} onBack={() => navigate(-1)} />;
  };
}

const CustomersScreenWithBack         = withBack(CustomersScreen);
const ItemsScreenWithBack             = withBack(ItemsScreen);
const QuotationScreenWithBack         = withBack(QuotationScreen);
const PendingQuotationsScreenWithBack = withBack(PendingQuotationsScreen);
const UserManagementScreenWithBack    = withBack(UserManagementScreen);

// ─────────────────────────────────────────────────────────────────────────────
// onNavigate helper — maps legacy screen names → real paths
// ─────────────────────────────────────────────────────────────────────────────
const ROUTE_MAP = {
  home:                 '/home',
  admin:                '/admin',
  customers:            '/customers',
  items:                '/items',
  addQuotation:         '/quotation/new',
  'pending-quotations': '/admin/pending',
  users:                '/admin/users',
};

function useScreenNavigate() {
  const navigate = useNavigate();
  return (screen) => {
    if (screen.startsWith('viewQuotation/')) {
      navigate(`/quotation/${screen.split('/')[1]}`);
    } else {
      const path = ROUTE_MAP[screen];
      path ? navigate(path) : console.warn('Unknown screen:', screen);
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen wrappers
// ─────────────────────────────────────────────────────────────────────────────
function HomeScreenRoute() {
  const navigate   = useNavigate();
  const onNavigate = useScreenNavigate();
  // ✅ Pull loading + loadError + refresh so HomeScreen gets them
  const { user, customers, items, quotations, loading, loadError, refresh, deleteQuotation, handleLogout } = useApp();

  return (
    <HomeScreen
      user={user}
      customers={customers}
      items={items}
      quotations={quotations}
      onNavigate={onNavigate}
      onViewQuotation={(id) => navigate(`/quotation/${id}`)}
      onDeleteQuotation={deleteQuotation}
      onLogout={handleLogout}
      isLoading={loading}       // ✅ was missing — caused the "no quotations" flash
      loadError={loadError}     // ✅ was missing — error banner never showed
      onRefresh={refresh}       // ✅ was missing — refresh button did nothing
    />
  );
}

function AdminDashboardRoute() {
  const navigate   = useNavigate();
  const onNavigate = useScreenNavigate();
  const {
    quotations, customers, items, loading, loadError, refresh,
    approveQuotation, rejectQuotation, deleteQuotation, handleLogout,
  } = useApp();

  return (
    <AdminDashboard
      quotations={quotations}
      customers={customers}
      items={items}
      onNavigate={onNavigate}
      onViewQuotation={(id) => navigate(`/quotation/${id}`)}
      onApproveQuotation={approveQuotation}
      onRejectQuotation={rejectQuotation}
      onDeleteQuotation={deleteQuotation}
      onLogout={handleLogout}
      isLoading={loading}   // ✅ wired for AdminDashboard too
      loadError={loadError}
      onRefresh={refresh}
    />
  );
}

function ViewQuotationRoute() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { quotations, items, updateQuotation, deleteQuotation } = useApp();

  return (
    <ViewQuotationScreen
      quotationId={id}
      quotations={quotations}
      items={items}
      onUpdateQuotation={updateQuotation}
      onDeleteQuotation={async (qid) => {
        const ok = await deleteQuotation(qid);
        if (ok) navigate(-1);
      }}
      onBack={() => navigate(-1)}
    />
  );
}

function LoginRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { handleLogin } = useApp();
  const from = location.state?.from?.pathname;

  const login = async (email, password) => {
    const result = await handleLogin(email, password);
    if (result.success) {
      navigate(from || (result.role === 'admin' ? '/admin' : '/home'), { replace: true });
    }
    return result;
  };

  return <LoginScreen onLogin={login} onNavigate={(s) => navigate(`/${s}`)} />;
}

function RegisterRoute() {
  const navigate = useNavigate();
  const { handleRegister } = useApp();

  const register = async (data) => {
    const result = await handleRegister(data);
    if (result.success) navigate('/home', { replace: true });
    return result;
  };

  return <RegisterScreen onRegister={register} onNavigate={(s) => navigate(`/${s}`)} />;
}

function PendingRoute() {
  const navigate = useNavigate();
  const { quotations, approveQuotation, rejectQuotation } = useApp();

  return (
    <PendingQuotationsScreenWithBack
      quotations={quotations.filter(q => q.status === 'pending')}
      onApprove={approveQuotation}
      onReject={rejectQuotation}
      onViewQuotation={(id) => navigate(`/quotation/${id}`)}
    />
  );
}

function QuotationNewRoute() {
  const navigate   = useNavigate();
  const { user, customers, items, addQuotation } = useApp();

  const handleBack = () => navigate(user?.role === 'admin' ? '/admin' : '/home');

  const handleAddQuotation = async (quotationData) => {
    const success = await addQuotation(quotationData);
    if (success) navigate(user?.role === 'admin' ? '/admin' : '/home');
    return success;
  };

  return (
    <QuotationScreenWithBack
      user={user}
      customers={customers}
      items={items}
      onBack={handleBack}
      onAddQuotation={handleAddQuotation}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root — data provider
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [user,       setUser]       = useState(() => isAuthenticated() ? getCurrentUser() : null);
  const [customers,  setCustomers]  = useState([]);
  const [items,      setItems]      = useState([]);
  const [quotations, setQuotations] = useState([]);

  // ✅ Start as true — component tree mounts before useEffect fires,
  //    so the skeleton must be visible from the very first render.
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(null);

  // ✅ Extracted into useCallback so both useEffect and the refresh
  //    button call exactly the same function
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      await Promise.all([
        customerAPI.getAll()
          .then(r => setCustomers(Array.isArray(r.data) ? r.data : r.data?.data ?? []))
          .catch(err => { console.error('customers fetch failed', err); }),

        itemAPI.getAll()
          .then(r => setItems(Array.isArray(r.data) ? r.data : r.data?.data ?? []))
          .catch(err => { console.error('items fetch failed', err); }),

        (user.role === 'admin' ? quotationAPI.getAll() : quotationAPI.getMyQuotations())
          .then(r => setQuotations(Array.isArray(r.data) ? r.data : r.data?.data ?? []))
          .catch(err => { console.error('quotations fetch failed', err); }),
      ]);
    } catch (err) {
      setLoadError(err?.response?.data?.message || err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user?._id, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  // Run on mount and whenever the logged-in user changes
  useEffect(() => {
    if (user) {
      fetchData();
    } else {
      // Logged out — reset everything and stop the loading spinner
      setCustomers([]);
      setItems([]);
      setQuotations([]);
      setLoading(false);
      setLoadError(null);
    }
  }, [fetchData, user?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auth ──────────────────────────────────────────────────────────────────
  const handleLogin = async (email, password) => {
    try {
      const res = await authAPI.login({ email, password });
      setAuthData(res.data);
      setUser(res.data);
      return { success: true, role: res.data.role };
    } catch (err) {
      return { success: false, error: err.response?.data?.message || 'Invalid credentials' };
    }
  };

  const handleRegister = async (data) => {
    try {
      const res = await authAPI.register(data);
      setAuthData(res.data);
      setUser(res.data);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.message || 'Registration failed.' };
    }
  };

  const handleLogout = () => {
    clearAuthData();
    setUser(null);
    setCustomers([]);
    setItems([]);
    setQuotations([]);
    setLoading(false);
    setLoadError(null);
  };

  // ── CRUD helpers ──────────────────────────────────────────────────────────
  const addCustomer    = async (d)      => { const r = await customerAPI.create(d);       setCustomers(p => [...p, r.data]);                          return true; };
  const updateCustomer = async (id, d)  => { const r = await customerAPI.update(id, d);   setCustomers(p => p.map(c => c._id === id ? r.data : c));   return true; };
  const deleteCustomer = async (id)     => { await customerAPI.delete(id);                setCustomers(p => p.filter(c => c._id !== id));              return true; };

  const addItem    = async (d)      => { const r = await itemAPI.create(d);       setItems(p => [...p, r.data]);                      return true; };
  const updateItem = async (id, d)  => { const r = await itemAPI.update(id, d);   setItems(p => p.map(i => i._id === id ? r.data : i)); return true; };
  const deleteItem = async (id)     => { await itemAPI.delete(id);                setItems(p => p.filter(i => i._id !== id));           return true; };

  const addQuotation = async (d) => {
    const r = await quotationAPI.create(d);
    setQuotations(p => [...p, r.data]);
    alert('Quotation created and is pending approval');
    return true;
  };
  const updateQuotation = async (id, d) => {
    const r = await quotationAPI.update(id, d);
    setQuotations(p => p.map(q => q._id === id ? r.data : q));
    return true;
  };
  const deleteQuotation = async (id) => {
    await quotationAPI.delete(id);
    setQuotations(p => p.filter(q => q._id !== id));
    alert('Quotation deleted');
    return true;
  };

  const approveQuotation = async (id) => {
    const r = await adminAPI.approveQuotation(id);
    setQuotations(p => p.map(q => q._id === id ? r.data.quotation : q));
    alert('Approved');
    return true;
  };
  const rejectQuotation = async (id, reason) => {
    const r = await adminAPI.rejectQuotation(id, { reason });
    setQuotations(p => p.map(q => q._id === id ? r.data.quotation : q));
    alert('Rejected');
    return true;
  };

  const ctx = {
    user,
    customers, items, quotations,
    loading, loadError,
    refresh: fetchData,   // ✅ exposed so any screen can trigger a re-fetch
    handleLogin, handleRegister, handleLogout,
    addCustomer, updateCustomer, deleteCustomer,
    addItem, updateItem, deleteItem,
    addQuotation, updateQuotation, deleteQuotation,
    approveQuotation, rejectQuotation,
  };

  return (
    <AppContext.Provider value={ctx}>
      <BrowserRouter>
        {/* Top loading bar — visible during any data fetch */}
        {loading && <div style={S.loadingBar} />}

        <div style={S.container}>
          <Routes>
            {/* ── Public ── */}
            <Route path="/login"    element={<GuestOnly><LoginRoute /></GuestOnly>} />
            <Route path="/register" element={<GuestOnly><RegisterRoute /></GuestOnly>} />

            {/* ── User ── */}
            <Route path="/home"          element={<RequireAuth><HomeScreenRoute /></RequireAuth>} />
            <Route path="/customers"     element={<RequireAuth><CustomersRoute /></RequireAuth>} />
            <Route path="/items"         element={<RequireAuth><ItemsRoute /></RequireAuth>} />
            <Route path="/quotation/new" element={<RequireAuth><QuotationNewRoute /></RequireAuth>} />
            <Route path="/quotation/:id" element={<RequireAuth><ViewQuotationRoute /></RequireAuth>} />

            {/* ── Admin ── */}
            <Route path="/admin"         element={<RequireAdmin><AdminDashboardRoute /></RequireAdmin>} />
            <Route path="/admin/pending" element={<RequireAdmin><PendingRoute /></RequireAdmin>} />
            <Route path="/admin/users"   element={<RequireAdmin><UserManagementRoute /></RequireAdmin>} />

            {/* ── Fallback ── */}
            <Route path="/"  element={<RootRedirect />} />
            <Route path="*"  element={<RootRedirect />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AppContext.Provider>
  );
}

// ── Thin CRUD-wired routes ────────────────────────────────────────────────────
function CustomersRoute() {
  const { customers, addCustomer, updateCustomer, deleteCustomer } = useApp();
  return (
    <CustomersScreenWithBack
      customers={customers}
      onAddCustomer={addCustomer}
      onUpdateCustomer={updateCustomer}
      onDeleteCustomer={deleteCustomer}
    />
  );
}

function ItemsRoute() {
  const { items, addItem, updateItem, deleteItem } = useApp();
  return (
    <ItemsScreenWithBack
      items={items}
      onAddItem={addItem}
      onUpdateItem={updateItem}
      onDeleteItem={deleteItem}
    />
  );
}

function UserManagementRoute() {
  return <UserManagementScreenWithBack />;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f0f9ff',
  },
  loadingBar: {
    position: 'fixed',
    top: 0, left: 0, right: 0,
    height: '3px',
    background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #6366f1)',
    backgroundSize: '200% 100%',
    zIndex: 9999,
    animation: 'loadingPulse 1.4s ease-in-out infinite',
  },
};