import React, { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from './ThemeToggle';
import { RolUsuario } from '../types';
import {
  subscribeActasInternasPendientesCount,
  subscribeReportesCerradosSinLeerCount,
  subscribeReportesEquiposAbiertosCount,
  subscribeSolicitudesEquiposPacientePendientes,
  subscribeMantenimientosPendientesCount,
} from '../services/firestoreData';

interface LayoutProps {
  children: ReactNode;
  title: string;
}

function getInitials(name?: string | null) {
  const n = (name || '').trim();
  if (!n) return 'U';
  const parts = n.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || 'U';
  const last = (parts.length > 1 ? parts[parts.length - 1]?.[0] : '') || '';
  return (first + last).toUpperCase();
}

const Icons = {
  dashboard: (
    <svg className="app-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12h8V3H3v9Z" />
      <path d="M13 21h8V12h-8v9Z" />
      <path d="M13 3h8v7h-8V3Z" />
      <path d="M3 14h8v7H3v-7Z" />
    </svg>
  ),
  patients: (
    <svg className="app-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  professionals: (
    <svg className="app-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
      <path d="M16 11l2 2 4-4" />
    </svg>
  ),
  inventory: (
    <svg className="app-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 16V8a2 2 0 0 0-1-1.73L13 2.27a2 2 0 0 0-2 0L4 6.27A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73Z" />
      <path d="M3.3 7l8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  ),
  reports: (
    <svg className="app-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 3 3 6-6" />
    </svg>
  ),
  rutero: (
    <svg className="app-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.5 6h4a4 4 0 0 1 4 4v2" />
      <path d="M18 12v4" />
      <path d="M12 16h4" />
    </svg>
  ),
  visits: (
    <svg className="app-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M17 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M2 21v-1a6 6 0 0 1 6-6" />
      <path d="M22 21v-1a6 6 0 0 0-6-6" />
      <path d="M8 14a6 6 0 0 1 8 0" />
    </svg>
  ),
  maintenance: (
    <svg className="app-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.7 6.3a3 3 0 0 0-4.24 4.24l-6.22 6.22a2 2 0 1 0 2.83 2.83l6.22-6.22a3 3 0 0 0 4.24-4.24l-2.83 2.83-2.83-2.83 2.83-2.83Z" />
    </svg>
  ),
  calibrations: (
    <svg className="app-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 3" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
    </svg>
  ),
  admin: (
    <svg className="app-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l8 4v6c0 5-3.5 9-8 9s-8-4-8-9V7l8-4Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  actas: (
    <svg className="app-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h8" />
      <path d="M8 9h2" />
    </svg>
  ),
};

const Layout: React.FC<LayoutProps> = ({ children, title }) => {
  const { usuario, logout, hasRole, isAdmin } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [pendingActasInternas, setPendingActasInternas] = React.useState(0);
  const [pendingReportesAbiertos, setPendingReportesAbiertos] = React.useState(0);
  const [pendingCerradosSinLeer, setPendingCerradosSinLeer] = React.useState(0);
  const [pendingSolicitudesEquipos, setPendingSolicitudesEquipos] = React.useState(0);
  const [pendingMantenimientos, setPendingMantenimientos] = React.useState(0);

  React.useEffect(() => {
    setPendingActasInternas(0);
    if (!usuario?.id) return;
    if (usuario.rol !== RolUsuario.AUXILIAR_ADMINISTRATIVA) return;

    const unsub = subscribeActasInternasPendientesCount(
      usuario.id,
      (count) => setPendingActasInternas(count),
      () => setPendingActasInternas(0),
    );
    return () => unsub();
  }, [usuario?.id, usuario?.rol]);

  React.useEffect(() => {
    setPendingReportesAbiertos(0);
    if (!usuario?.id) return;
    if (usuario.rol !== RolUsuario.INGENIERO_BIOMEDICO) return;

    const unsub = subscribeReportesEquiposAbiertosCount(
      (count) => setPendingReportesAbiertos(count),
      () => setPendingReportesAbiertos(0),
    );
    return () => unsub();
  }, [usuario?.id, usuario?.rol]);

  React.useEffect(() => {
    setPendingMantenimientos(0);
    if (!usuario?.id) return;
    if (usuario.rol !== RolUsuario.AUXILIAR_ADMINISTRATIVA) return;

    const unsub = subscribeMantenimientosPendientesCount(
      (count) => setPendingMantenimientos(count),
      () => setPendingMantenimientos(0),
    );
    return () => unsub();
  }, [usuario?.id, usuario?.rol]);

  React.useEffect(() => {
    setPendingSolicitudesEquipos(0);
    if (!usuario?.id) return;
    if (usuario.rol !== RolUsuario.INGENIERO_BIOMEDICO) return;

    const unsub = subscribeSolicitudesEquiposPacientePendientes(
      (items) => setPendingSolicitudesEquipos(items.length),
      () => setPendingSolicitudesEquipos(0),
    );
    return () => unsub();
  }, [usuario?.id, usuario?.rol]);

  React.useEffect(() => {
    setPendingCerradosSinLeer(0);
    if (!usuario?.id) return;
    if (usuario.rol !== RolUsuario.VISITADOR) return;

    const unsub = subscribeReportesCerradosSinLeerCount(
      usuario.id,
      (count) => setPendingCerradosSinLeer(count),
      () => setPendingCerradosSinLeer(0),
    );
    return () => unsub();
  }, [usuario?.id, usuario?.rol]);

  // Navegación simple usando hash
  const navigate = (path: string) => {
    window.location.hash = path;
    setIsSidebarOpen(false);
  };

  const NavItem = ({
    label,
    path,
    roles,
    badge,
  }: {
    label: string;
    path: string;
    roles?: RolUsuario[];
    badge?: number;
  }) => {
    if (roles && !hasRole(roles)) return null;
    const isActive = window.location.hash === path;
    return (
      <button
        onClick={() => navigate(path)}
        className="app-nav-item mb-1"
        data-active={isActive ? 'true' : 'false'}
      >
        {path === '#/' ? Icons.dashboard : null}
        {path === '#/pacientes' ? Icons.patients : null}
        {path === '#/profesionales' ? Icons.professionals : null}
        {path === '#/rutero' ? Icons.rutero : null}
        {path === '#/equipos' ? Icons.inventory : null}
        {path === '#/informes' ? Icons.reports : null}
        {path === '#/visitas' ? Icons.visits : null}
        {path === '#/mantenimientos' ? Icons.maintenance : null}
        {path === '#/calibraciones' ? Icons.calibrations : null}
        {path === '#/actas-internas' ? Icons.actas : null}
        {path === '#/admin' ? Icons.admin : null}
        <span className="text-sm font-medium flex-1 text-left">{label}</span>
        {!!badge && badge > 0 && (
          <span className="ml-2 inline-flex min-w-6 h-6 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold px-2">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      {/* Sidebar Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        app-sidebar fixed md:relative z-30 w-72 h-full flex flex-col transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-6 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-600/15 flex items-center justify-center text-blue-200 border border-blue-500/30">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19.428 15.428a2 2 0 0 0-1.022-.547l-2.384-.477a6 6 0 0 0-3.86.517l-.318.158a6 6 0 0 1-3.86.517L6.05 15.21a2 2 0 0 0-1.806.547M8 4h8l-1 1v5.172a2 2 0 0 0 .586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 0 0 9 10.172V5L8 4z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-wide">BioControl</h1>
              <p className="text-xs sidebar-muted mt-0.5">{usuario?.nombre}</p>
            </div>
          </div>
          <span className="mt-3 inline-flex text-[10px] uppercase px-3 py-1 rounded-full border border-white/10 bg-white/5 text-white/80">
            {usuario?.rol.replace(/_/g, ' ')}
          </span>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <NavItem
            label="Dashboard"
            path="#/"
            roles={[RolUsuario.AUXILIAR_ADMINISTRATIVA, RolUsuario.GERENCIA, RolUsuario.INGENIERO_BIOMEDICO]}
          />
          
          <div className="mt-5 mb-2 px-4 text-xs font-semibold sidebar-muted uppercase tracking-wider">
            Gestión
          </div>
          {/* SE AGREGÓ EL ROL DE INGENIERO BIOMEDICO A PACIENTES */}
          <NavItem 
            label="Pacientes" 
            path="#/pacientes" 
            roles={[RolUsuario.AUXILIAR_ADMINISTRATIVA, RolUsuario.GERENCIA, RolUsuario.INGENIERO_BIOMEDICO]} 
          />
          <NavItem
            label="Profesionales"
            path="#/profesionales"
            roles={[RolUsuario.AUXILIAR_ADMINISTRATIVA, RolUsuario.GERENCIA, RolUsuario.INGENIERO_BIOMEDICO]}
          />
          <NavItem
            label="Rutero"
            path="#/rutero"
            roles={[RolUsuario.VISITADOR]}
          />
          <NavItem 
            label="Inventario Equipos" 
            path="#/equipos" 
            roles={[RolUsuario.INGENIERO_BIOMEDICO, RolUsuario.AUXILIAR_ADMINISTRATIVA, RolUsuario.GERENCIA]} 
            badge={usuario?.rol === RolUsuario.INGENIERO_BIOMEDICO ? pendingSolicitudesEquipos : 0}
          />
          <NavItem
            label="Mantenimientos"
            path="#/mantenimientos"
            roles={[RolUsuario.INGENIERO_BIOMEDICO, RolUsuario.AUXILIAR_ADMINISTRATIVA, RolUsuario.GERENCIA]}
            badge={usuario?.rol === RolUsuario.AUXILIAR_ADMINISTRATIVA ? pendingMantenimientos : 0}
          />
          <NavItem
            label="Calibraciones"
            path="#/calibraciones"
            roles={[RolUsuario.INGENIERO_BIOMEDICO, RolUsuario.AUXILIAR_ADMINISTRATIVA, RolUsuario.GERENCIA]}
          />
          <NavItem
            label={usuario?.rol === RolUsuario.INGENIERO_BIOMEDICO ? 'Reportes de Visitas' : 'Visitas'}
            path="#/visitas"
            roles={[RolUsuario.VISITADOR, RolUsuario.INGENIERO_BIOMEDICO]}
            badge={
              usuario?.rol === RolUsuario.INGENIERO_BIOMEDICO
                ? pendingReportesAbiertos
                : usuario?.rol === RolUsuario.VISITADOR
                  ? pendingCerradosSinLeer
                  : 0
            }
          />
          <NavItem
            label="Actas Internas"
            path="#/actas-internas"
            roles={[RolUsuario.INGENIERO_BIOMEDICO, RolUsuario.AUXILIAR_ADMINISTRATIVA, RolUsuario.GERENCIA]}
            badge={usuario?.rol === RolUsuario.AUXILIAR_ADMINISTRATIVA ? pendingActasInternas : 0}
          />
          <NavItem
            label="Informes"
            path="#/informes"
            roles={[RolUsuario.INGENIERO_BIOMEDICO, RolUsuario.AUXILIAR_ADMINISTRATIVA, RolUsuario.GERENCIA]}
          />
          {isAdmin && (
            <NavItem label="Admin" path="#/admin" />
          )}
        </nav>

        <div className="p-4 border-t border-slate-700/50">
          <button 
            onClick={logout}
            className="w-full flex items-center justify-center px-4 py-2 text-sm text-red-300 hover:bg-white/5 hover:text-red-200 rounded-full transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header Mobile */}
        <header className="app-topbar md:hidden flex items-center justify-between p-4 border-b border-gray-200">
          <button onClick={() => setIsSidebarOpen(true)} className="text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-gray-800">{title}</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <div className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow">
              {getInitials(usuario?.nombre)}
            </div>
          </div>
        </header>

        {/* Desktop Header & Content */}
        <main className="flex-1 overflow-auto p-4 md:p-8">
          <div className="hidden md:flex justify-between items-center mb-8">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
              <p className="text-sm text-gray-500 mt-1">BioControl · Gestión biomédica</p>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="h-10 w-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow">
                {getInitials(usuario?.nombre)}
              </div>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
