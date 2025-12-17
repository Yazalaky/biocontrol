import React, { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { RolUsuario } from '../types';

interface LayoutProps {
  children: ReactNode;
  title: string;
}

const Layout: React.FC<LayoutProps> = ({ children, title }) => {
  const { usuario, logout, hasRole } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  // Navegación simple usando hash
  const navigate = (path: string) => {
    window.location.hash = path;
    setIsSidebarOpen(false);
  };

  const NavItem = ({ label, path, roles }: { label: string, path: string, roles?: RolUsuario[] }) => {
    if (roles && !hasRole(roles)) return null;
    const isActive = window.location.hash === path;
    return (
      <button
        onClick={() => navigate(path)}
        className={`w-full text-left px-4 py-3 rounded-md mb-1 transition-colors ${
          isActive 
            ? 'bg-blue-600 text-white' 
            : 'text-gray-300 hover:bg-slate-700 hover:text-white'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Sidebar Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:relative z-30 w-64 h-full bg-slate-800 text-white flex flex-col transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-xl font-bold tracking-wider">BioControl</h1>
          <p className="text-xs text-slate-400 mt-1">{usuario?.nombre}</p>
          <span className="text-[10px] uppercase bg-slate-700 px-2 py-0.5 rounded text-blue-300">
            {usuario?.rol.replace('_', ' ')}
          </span>
          {import.meta.env.DEV && usuario?.id && (
            <div className="mt-2 text-[10px] text-slate-400 break-all">
              <div>UID: {usuario.id}</div>
              <div>Project: {import.meta.env.VITE_FIREBASE_PROJECT_ID}</div>
            </div>
          )}
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <NavItem label="Dashboard" path="#/" />
          
          <div className="mt-4 mb-2 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Gestión
          </div>
          {/* SE AGREGÓ EL ROL DE INGENIERO BIOMEDICO A PACIENTES */}
          <NavItem 
            label="Pacientes" 
            path="#/pacientes" 
            roles={[RolUsuario.AUXILIAR_ADMINISTRATIVA, RolUsuario.GERENCIA, RolUsuario.INGENIERO_BIOMEDICO]} 
          />
          <NavItem 
            label="Inventario Equipos" 
            path="#/equipos" 
            roles={[RolUsuario.INGENIERO_BIOMEDICO, RolUsuario.AUXILIAR_ADMINISTRATIVA, RolUsuario.GERENCIA]} 
          />
        </nav>

        <div className="p-4 border-t border-slate-700">
          <button 
            onClick={logout}
            className="w-full flex items-center justify-center px-4 py-2 text-sm text-red-300 hover:bg-slate-700 hover:text-red-200 rounded-md transition-colors"
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
        <header className="bg-white shadow-sm md:hidden flex items-center justify-between p-4">
          <button onClick={() => setIsSidebarOpen(true)} className="text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-gray-800">{title}</h1>
          <div className="w-6"></div> {/* Spacer */}
        </header>

        {/* Desktop Header & Content */}
        <main className="flex-1 overflow-auto p-4 md:p-8">
          <div className="hidden md:flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
