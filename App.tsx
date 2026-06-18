import React, { Suspense, lazy, useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Visits from './pages/Visits';
import Rutero from './pages/Rutero';
import FeedbackHost from './components/FeedbackHost';
import { RolUsuario } from './types';

const Patients = lazy(() => import('./pages/Patients'));
const Professionals = lazy(() => import('./pages/Professionals'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Admin = lazy(() => import('./pages/Admin'));
const Reports = lazy(() => import('./pages/Reports'));
const InternalActas = lazy(() => import('./pages/InternalActas'));
const Mantenimientos = lazy(() => import('./pages/Mantenimientos'));
const Calibraciones = lazy(() => import('./pages/Calibraciones'));
const Consultorios = lazy(() => import('./pages/Consultorios'));

const RouteFallback = () => (
  <div className="min-h-screen bg-gradient-to-br from-blue-900 to-slate-800 flex items-center justify-center p-4">
    <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full text-center">
      <h1 className="text-xl font-bold text-gray-900">BioControl</h1>
      <p className="text-gray-500 mt-2">Cargando modulo...</p>
    </div>
  </div>
);

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

  let page: React.ReactNode;

  // Rutas
  switch (currentHash) {
    case '#/pacientes':
      page = <Patients />;
      break;
    case '#/profesionales':
      page = <Professionals />;
      break;
    case '#/equipos':
      page = <Inventory />;
      break;
    case '#/informes':
      page = <Reports />;
      break;
    case '#/actas-internas':
      page = <InternalActas />;
      break;
    case '#/visitas':
      page = <Visits />;
      break;
    case '#/mantenimientos':
      page = <Mantenimientos />;
      break;
    case '#/calibraciones':
      page = <Calibraciones />;
      break;
    case '#/consultorios':
      page = isAliadosContext ? <Consultorios /> : <Dashboard />;
      break;
    case '#/admin':
      page = <Admin />;
      break;
    case '#/':
    default:
      page = <Dashboard />;
      break;
  }

  return <Suspense fallback={<RouteFallback />}>{page}</Suspense>;
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
