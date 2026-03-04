import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Patients from './pages/Patients';
import Professionals from './pages/Professionals';
import Inventory from './pages/Inventory';
import Admin from './pages/Admin';
import Reports from './pages/Reports';
import InternalActas from './pages/InternalActas';
import Visits from './pages/Visits';
import Rutero from './pages/Rutero';
import Mantenimientos from './pages/Mantenimientos';
import Calibraciones from './pages/Calibraciones';
import Consultorios from './pages/Consultorios';
import FeedbackHost from './components/FeedbackHost';
import { RolUsuario } from './types';

// Simple Router Component
const Router = () => {
  const { isAuthenticated, loading, usuario, activeOrgContext } = useAuth();
  const [currentHash, setCurrentHash] = useState(window.location.hash || '#/');

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash || '#/');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const isAliadosContext = activeOrgContext.empresaId === 'ALIADOS';
  const isAliadosRestrictedRole =
    usuario?.rol === RolUsuario.AUXILIAR_ADMINISTRATIVA ||
    usuario?.rol === RolUsuario.INGENIERO_BIOMEDICO ||
    usuario?.rol === RolUsuario.GERENCIA;
  const isHiddenRouteInAliados =
    currentHash === '#/pacientes' ||
    currentHash === '#/profesionales' ||
    currentHash === '#/visitas';
  useEffect(() => {
    if (isAliadosContext && isAliadosRestrictedRole && isHiddenRouteInAliados) {
      window.location.hash = '#/';
    }
  }, [isAliadosContext, isAliadosRestrictedRole, isHiddenRouteInAliados]);

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

  // VISITADOR: rutas especiales
  if (usuario?.rol === RolUsuario.VISITADOR) {
    switch (currentHash) {
      case '#/rutero':
        return <Rutero />;
      case '#/visitas':
      case '#/':
      default:
        return <Visits />;
    }
  }

  if (isAliadosContext && isAliadosRestrictedRole && isHiddenRouteInAliados) {
    return <Dashboard />;
  }

  // Rutas
  switch (currentHash) {
    case '#/pacientes':
      return <Patients />;
    case '#/profesionales':
      return <Professionals />;
    case '#/equipos':
      return <Inventory />;
    case '#/informes':
      return <Reports />;
    case '#/actas-internas':
      return <InternalActas />;
    case '#/visitas':
      return <Visits />;
    case '#/mantenimientos':
      return <Mantenimientos />;
    case '#/calibraciones':
      return <Calibraciones />;
    case '#/consultorios':
      return isAliadosContext ? <Consultorios /> : <Dashboard />;
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
        <FeedbackHost />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
