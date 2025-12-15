import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Usuario, RolUsuario } from '../types';
import { mockLogin } from '../services/db';

interface AuthContextType {
  usuario: Usuario | null;
  login: (rol: RolUsuario) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  hasRole: (roles: RolUsuario[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children?: ReactNode }) => {
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  // Intentar recuperar sesión del localStorage (persistencia simple)
  useEffect(() => {
    const savedUser = localStorage.getItem('biocontrol_user');
    if (savedUser) {
      setUsuario(JSON.parse(savedUser));
    }
  }, []);

  const login = async (rol: RolUsuario) => {
    const user = await mockLogin(rol);
    setUsuario(user);
    localStorage.setItem('biocontrol_user', JSON.stringify(user));
  };

  const logout = () => {
    setUsuario(null);
    localStorage.removeItem('biocontrol_user');
  };

  const hasRole = (roles: RolUsuario[]) => {
    if (!usuario) return false;
    return roles.includes(usuario.rol);
  };

  return (
    <AuthContext.Provider value={{ usuario, login, logout, isAuthenticated: !!usuario, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};