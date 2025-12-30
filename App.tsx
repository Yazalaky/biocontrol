import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Patients from './pages/Patients';
import Inventory from './pages/Inventory';
import Admin from './pages/Admin';
import Reports from './pages/Reports';
import InternalActas from './pages/InternalActas';
import Visits from './pages/Visits';
import { RolUsuario } from './types';

// Simple Router Component
const Router = () => {
  const { isAuthenticated, loading, usuario } = useAuth();
  const [currentHash, setCurrentHash] = useState(window.location.hash || '#/');

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash || '#/');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-slate-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full text-center">
          <h1 className="text-xl font-bold text-gray-900">BioControl</h1>
          <p className="text-gray-500 mt-2">Cargando sesión...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  // VISITADOR: solo usa la pantalla de visitas/reportes
  if (usuario?.rol === RolUsuario.VISITADOR) {
    return <Visits />;
  }

  // Rutas
  switch (currentHash) {
    case '#/pacientes':
      return <Patients />;
    case '#/equipos':
      return <Inventory />;
    case '#/informes':
      return <Reports />;
    case '#/actas-internas':
      return <InternalActas />;
    case '#/visitas':
      return <Visits />;
    case '#/admin':
      return <Admin />;
    case '#/':
    default:
      return <Dashboard />;
  }
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
