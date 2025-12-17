import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { RolUsuario, type Usuario } from '../types';

interface AuthContextType {
  usuario: Usuario | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  hasRole: (roles: RolUsuario[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children?: ReactNode }) => {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setError(null);

      if (!firebaseUser) {
        setUsuario(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
          setUsuario(null);
          setIsAdmin(false);
          setError(
            'Tu cuenta existe, pero no tiene rol asignado. Pide al administrador que cree tu documento en Firestore: users/{uid}.',
          );
          setLoading(false);
          return;
        }

        const data = userDocSnap.data() as { nombre?: string; rol?: string };
        const rol = data.rol;
        const isValidRole = Object.values(RolUsuario).includes(rol as RolUsuario);

        if (!rol || !isValidRole) {
          setUsuario(null);
          setIsAdmin(false);
          setError('Tu usuario no tiene un rol válido asignado en Firestore (users/{uid}.rol).');
          setLoading(false);
          return;
        }

        setUsuario({
          id: firebaseUser.uid,
          nombre: data.nombre || firebaseUser.email || 'Usuario',
          rol: rol as RolUsuario,
        });

        // Admin flag (lectura opcional). Requiere rules para /admins/{uid}.
        try {
          const adminRef = doc(db, 'admins', firebaseUser.uid);
          const adminSnap = await getDoc(adminRef);
          setIsAdmin(adminSnap.exists() && adminSnap.data()?.enabled === true);
        } catch {
          setIsAdmin(false);
        }
        setLoading(false);
      } catch (err: any) {
        setUsuario(null);
        setIsAdmin(false);
        setError(err?.message || 'Error cargando perfil del usuario desde Firestore.');
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    setError(null);
    await signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    setError(null);
    await signOut(auth);
  };

  const hasRole = (roles: RolUsuario[]) => {
    if (!usuario) return false;
    return roles.includes(usuario.rol);
  };

  const value = useMemo(
    () => ({
      usuario,
      isAdmin,
      loading,
      error,
      login,
      logout,
      isAuthenticated: !!usuario,
      hasRole,
    }),
    [usuario, isAdmin, loading, error],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
