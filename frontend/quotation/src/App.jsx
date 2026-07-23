import React, { useState, useMemo, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAppStore, useInitializeApp } from './services/store';
import { getHomePath } from './services/api';

import HomeScreen from './page/HomeScreen';
import CustomersScreen from './page/CustomersScreen';
import ItemsScreen from './page/ItemsScreen';
import QuotationScreen from './page/QuotationScreen';
import ViewQuotationScreen from './page/ViewQuotationScreen';
import LoginScreen from './page/LoginScreen';
import RegisterScreen from './page/RegisterScreen';
import AdminDashboard from './page/AdminDashboard';
import OpsDashboard from './page/OperManagerDashboard';
import UserManagementScreen from './page/UserManagementScreen';
import UserQuotationStatsPage from './page/UserQuotationStatsPage';
import CompanyManagementScreen from './page/CompanyManagementScreen';

const getUser = () => useAppStore.getState().user;

// Route Guards
function RequireAuth({ children }) {
  const location = useLocation();
  useAppStore((s) => s.user);
  const user = getUser();
  if (!user || !localStorage.getItem('token')) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function RequireCreator({ children }) {
  const location = useLocation();
  useAppStore((s) => s.user);
  const user = getUser();
  if (!user || !localStorage.getItem('token')) return <Navigate to="/login" state={{ from: location }} replace />;
  if (user.role !== 'user') return <Navigate to={getHomePath(user.role)} replace />;
  return children;
}

function RequireAdmin({ children }) {
  const location = useLocation();
  useAppStore((s) => s.user);
  const user = getUser();
  if (!user || !localStorage.getItem('token')) return <Navigate to="/login" state={{ from: location }} replace />;
  if (user.role !== 'admin') return <Navigate to={getHomePath(user.role)} replace />;
  return children;
}

function RequireOpsManager({ children }) {
  const location = useLocation();
  useAppStore((s) => s.user);
  const user = getUser();
  if (!user || !localStorage.getItem('token')) return <Navigate to="/login" state={{ from: location }} replace />;
  if (user.role !== 'ops_manager') return <Navigate to={getHomePath(user.role)} replace />;
  return children;
}

function GuestOnly({ children }) {
  useAppStore((s) => s.user);
  const loading = useAppStore((s) => s.loading);
  const user = getUser();
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token && user) {
      useAppStore.getState().handleLogout();
    }
  }, [token, user]);

  if (loading) return children;            // don't bounce mid-login
  if (user && token) return <Navigate to={getHomePath(user.role)} replace />;
  if (token && !user) { localStorage.removeItem('token'); localStorage.removeItem('user'); }
  return children;
}

function RootRedirect() {
  useAppStore((s) => s.user);
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={getHomePath(user.role)} replace />;
}

// HOC
function withBack(Component) {
  return function Wrapped(props) {
    const navigate = useNavigate();
    return <Component {...props} onBack={() => navigate(-1)} />;
  };
}

const CustomersScreenWithBack = withBack(CustomersScreen);
const ItemsScreenWithBack = withBack(ItemsScreen);
const QuotationScreenWithBack = withBack(QuotationScreen);
const UserManagementScreenWithBack = withBack(UserManagementScreen);
const CompanyManagementScreenWithBack = withBack(CompanyManagementScreen);

// Screen navigation
const ROUTE_MAP = {
  home: '/home', admin: '/admin', ops: '/ops', customers: '/customers',
  items: '/items', addQuotation: '/quotation/new', users: '/admin/users', userStats: '/admin/user-stats', companies: '/admin/companies'
};

function useScreenNavigate() {
  const navigate = useNavigate();
  return (screen) => {
    if (screen.startsWith('viewQuotation/')) navigate(`/quotation/${screen.split('/')[1]}`);
    else {
      const path = ROUTE_MAP[screen];
      if (path) navigate(path);
    }
  };
}

// Route Components
function HomeScreenRoute() {
  const navigate = useNavigate();
  const onNavigate = useScreenNavigate();
  return <HomeScreen onNavigate={onNavigate} onViewQuotation={(id) => navigate(`/quotation/${id}`)} />;
}

function AdminDashboardRoute() {
  const navigate = useNavigate();
  const onNavigate = useScreenNavigate();
  return <AdminDashboard onNavigate={onNavigate} onViewQuotation={(id) => navigate(`/quotation/${id}`)} />;
}

function OpsDashboardRoute() {
  const navigate = useNavigate();
  return <OpsDashboard onViewQuotation={(id) => navigate(`/quotation/${id}`)} />;
}

function ViewQuotationRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const quotations = useAppStore((s) => s.quotations);
  const opsReviewHistory = useAppStore((s) => s.opsReviewHistory);
  const allVisible = useMemo(() => [...quotations, ...opsReviewHistory], [quotations, opsReviewHistory]);
  return <ViewQuotationScreen quotationId={id} quotations={allVisible} user={user} onBack={() => navigate(-1)} />;
}

function LoginRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const handleLogin = useAppStore((s) => s.handleLogin);
  const [busy, setBusy] = useState(false);
  const from = location.state?.from;

  const login = async (email, password) => {
    if (busy) return { success: false, error: 'Login in progress' };
    setBusy(true);
    try {
      const result = await handleLogin(email, password);
      if (!result.success) return result;
      const role = result.role || useAppStore.getState().user?.role;
      if (!role) return { success: false, error: 'Invalid user data' };
      const redirectTo = from ? (from.pathname + (from.search || '')) : getHomePath(role);
      navigate(redirectTo, { replace: true });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || 'Login failed' };
    } finally {
      setBusy(false);
    }
  };

  return <LoginScreen onLogin={login} onNavigate={(s) => navigate(`/${s}`)} />;
}

function RegisterRoute() {
  const navigate = useNavigate();
  const handleRegister = useAppStore((s) => s.handleRegister);
  const register = async (data) => {
    const result = await handleRegister(data);
    if (result.success) navigate('/home', { replace: true });
    return result;
  };
  return <RegisterScreen onRegister={register} onNavigate={(s) => navigate(`/${s}`)} />;
}

function QuotationNewRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAppStore((s) => s.user);
  const prefillFrom = location.state?.prefillFrom || null;
  return <QuotationScreenWithBack onBack={() => navigate(getHomePath(user?.role))} prefillFrom={prefillFrom} />;
}

function CustomersRoute() { return <CustomersScreenWithBack />; }
function ItemsRoute() { return <ItemsScreenWithBack />; }

// AppContent
function AppContent() {
  const loading = useAppStore((s) => s.loading);
  return (
    <>
      {loading && <div style={S.loadingBar} />}
      <div style={S.container}>
        <Routes>
          <Route path="/login" element={<GuestOnly><LoginRoute /></GuestOnly>} />
          <Route path="/register" element={<GuestOnly><RegisterRoute /></GuestOnly>} />
          <Route path="/home" element={<RequireCreator><HomeScreenRoute /></RequireCreator>} />
          <Route path="/customers" element={<RequireAuth><CustomersRoute /></RequireAuth>} />
          <Route path="/items" element={<RequireAuth><ItemsRoute /></RequireAuth>} />
          <Route path="/quotation/new" element={<RequireAuth><QuotationNewRoute /></RequireAuth>} />
          <Route path="/quotation/:id" element={<RequireAuth><ViewQuotationRoute /></RequireAuth>} />
          <Route path="/ops" element={<RequireOpsManager><OpsDashboardRoute /></RequireOpsManager>} />
          <Route path="/admin" element={<RequireAdmin><AdminDashboardRoute /></RequireAdmin>} />
          <Route path="/admin/users" element={<RequireAdmin><UserManagementScreenWithBack /></RequireAdmin>} />
          <Route path="/admin/user-stats" element={<RequireAdmin><UserQuotationStatsPage /></RequireAdmin>} />
          <Route path="/admin/companies" element={<RequireAdmin><CompanyManagementScreenWithBack /></RequireAdmin>} />
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </div>
    </>
  );
}

// App
export default function App() {
  useInitializeApp();
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

// Styles
const S = {
  container: { minHeight: '100vh', backgroundColor: '#f0f9ff' },
  loadingBar: {
    position: 'fixed', top: 0, left: 0, right: 0, height: '3px', zIndex: 9999,
    background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #6366f1)',
    backgroundSize: '200% 100%',
    animation: 'loadingPulse 1.4s ease-in-out infinite',
  },
};

const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes loadingPulse { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
`;
document.head.appendChild(styleSheet);