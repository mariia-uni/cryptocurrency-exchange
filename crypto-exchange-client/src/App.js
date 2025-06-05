import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import SignUp from './components/SignUp';
import Login from './components/Login';
import VerifyIdentity from './components/VerifyIdentity';
import DocumentUpload from './components/DocumentUpload';
import Dashboard from './components/Dashboard';
import About from './components/About';
import Terms from './components/Terms';
import Privacy from './components/Privacy';
import Support from './components/Support';
import AdminPanel from './components/AdminPanel';
import VerificationQueue from './components/VerificationQueue';
import UserManagement from './components/UserManagement';
import Settings from './components/Settings';
import ResetPassword from './components/ResetPassword';
import Markets from './components/Markets';
import Assets from './components/Assets';
import AssetsOverview from './components/AssetsOverview';
import Deposit from './components/Deposit';
import Withdrawal from './components/Withdrawal';
import Futures from './components/Futures';
import VerificationRequired from './components/VerificationRequired';
import VerifiedRoute from './components/VerifiedRoute';
import './App.css';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('auth_token');

  if (!token)
    return <Navigate to="/login" replace />;

  return children;
};

const AuthRoutes = ({ children }) => {
  const token = localStorage.getItem('auth_token');

  if (token)
    return <Navigate to="/dashboard" replace />;

  return children;
}

const AdminRoute = ({ children }) => {
  const token = localStorage.getItem('auth_token');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/signup" element={<AuthRoutes><SignUp /></AuthRoutes>} />
        <Route path="/login" element={<AuthRoutes><Login /></AuthRoutes>} />
        <Route path="/verify" element={<ProtectedRoute><VerifyIdentity /></ProtectedRoute>} />
        <Route path="/document-upload" element={<ProtectedRoute><DocumentUpload /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/markets" element={<Markets />} />
        <Route path="/verify-required" element={<ProtectedRoute><VerificationRequired /></ProtectedRoute>} />

        {/* Financial pages requiring verification */}
        <Route path="/futures" element={<VerifiedRoute><Futures /></VerifiedRoute>} />
        <Route path="/assets" element={<VerifiedRoute><Assets /></VerifiedRoute>} />
        <Route path="/assets-overview" element={<VerifiedRoute><AssetsOverview /></VerifiedRoute>} />
        <Route path="/deposit" element={<VerifiedRoute><Deposit /></VerifiedRoute>} />
        <Route path="/withdrawal" element={<VerifiedRoute><Withdrawal /></VerifiedRoute>} />

        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Admin routes */}
        <Route path="/admin" element={<ProtectedRoute><AdminPanel /></ProtectedRoute>} />
        <Route path="/admin/verification-queue" element={<ProtectedRoute><VerificationQueue /></ProtectedRoute>} />
        <Route path="/admin/queue" element={<ProtectedRoute><VerificationQueue /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />

        {/* Public routes */}
        <Route path="/about" element={<About />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/support" element={<Support />} />

        {/* Default route */}
        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;