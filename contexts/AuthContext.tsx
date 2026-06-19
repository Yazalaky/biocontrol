import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import {
  clearStoredAccessProfile,
  getDefaultOrgContext,
  getStoredOrgContextStrict,
  tryNormalizeOrgContext,
  setStoredAccessProfile,
  setStoredOrgContext,
} from '../services/orgContext';
import { RolUsuario, type OrgContext, type OrgScope, type Usuario } from '../types';

interface AuthContextType {
  usuario: Usuario | null;
  activeOrgContext: OrgContext;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  hasRole: (roles: RolUsuario[]) => boolean;
  setActiveOrgContext: (context: Partial<OrgContext>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children?: ReactNode }) => {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [activeOrgContext, setActiveOrgContextState] = useState<OrgContext>(
    getStoredOrgContextStrict() ?? getDefaultOrgContext(),
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setActiveOrgContext = (context: Partial<OrgContext>) => {
    const normalized = tryNormalizeOrgContext(context);
    if (!normalized) return;
    if (usuario && !usuario.isGlobalRead) {
      const userScopes = Array.isArray(usuario.scope) && usuario.scope.length > 0
        ? usuario.scope
        : usuario.empresaId && usuario.sedeId
          ? [{ empresaId: usuario.empresaId, sedeId: usuario.sedeId }]
          : [];
      const isAllowed = userScopes.some(
        (item) => item.empresaId === normalized.empresaId && item.sedeId === normalized.sedeId,
      );
      if (!isAllowed) return;
    }
    setActiveOrgContextState(normalized);
    setStoredOrgContext(normalized);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setError(null);

      if (!firebaseUser) {
        setUsuario(null);
        setActiveOrgContextState(getDefaultOrgContext());
        clearStoredAccessProfile();
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

        const data = userDocSnap.data() as {
          nombre?: string;
          rol?: string;
          empresaId?: string;
          sedeId?: string;
          scope?: Array<{ empresaId?: string; sedeId?: string }>;
          isGlobalRead?: boolean;
        };
        const rol = data.rol;
        const isValidRole = Object.values(RolUsuario).includes(rol as RolUsuario);

        if (!rol || !isValidRole) {
          setUsuario(null);
          setIsAdmin(false);
          setError('Tu usuario no tiene un rol válido asignado en Firestore (users/{uid}.rol).');
          setLoading(false);
          return;
        }

        const isGlobalRead = data.isGlobalRead === true || rol === RolUsuario.GERENCIA;
        const parseScopeItem = (item: { empresaId?: string; sedeId?: string } | undefined): OrgScope | null =>
          tryNormalizeOrgContext(item);
        const scope: OrgScope[] = Array.isArray(data.scope)
          ? data.scope
              .map((item) => parseScopeItem(item))
              .filter((item): item is OrgScope => !!item)
          : [];
        let primaryOrg = tryNormalizeOrgContext({
          empresaId: data.empresaId,
          sedeId: data.sedeId,
        });

        if (!primaryOrg && scope[0]) {
          primaryOrg = scope[0];
        }

        if (!primaryOrg) {
          const retrySnap = await getDoc(userDocRef);
          const retryData = retrySnap.exists()
            ? (retrySnap.data() as {
                empresaId?: string;
                sedeId?: string;
                scope?: Array<{ empresaId?: string; sedeId?: string }>;
              })
            : null;
          const retryScope = Array.isArray(retryData?.scope)
            ? retryData.scope
                .map((item) => parseScopeItem(item))
                .filter((item): item is OrgScope => !!item)
            : [];
          primaryOrg = tryNormalizeOrgContext({
            empresaId: retryData?.empresaId,
            sedeId: retryData?.sedeId,
          }) || retryScope[0] || null;
        }

        if (!primaryOrg) {
          setUsuario(null);
          setIsAdmin(false);
          setError(
            'Tu perfil no tiene un contexto organizacional válido. Recargamos una vez y el problema persiste. Corrige users/{uid} agregando empresaId y sedeId válidos o un scope válido.',
          );
          setLoading(false);
          return;
        }

        const storedContext = getStoredOrgContextStrict();
        const allowedScopes = scope.length > 0 ? scope : [primaryOrg];
        const storedIsAllowed = storedContext
          ? allowedScopes.some(
              (item) => item.empresaId === storedContext.empresaId && item.sedeId === storedContext.sedeId,
            )
          : false;
        const resolvedContext = storedIsAllowed ? storedContext! : primaryOrg;
        setActiveOrgContextState(resolvedContext);
        setStoredOrgContext(resolvedContext);

        setUsuario({
          id: firebaseUser.uid,
          nombre: data.nombre || firebaseUser.email || 'Usuario',
          rol: rol as RolUsuario,
          empresaId: primaryOrg.empresaId,
          sedeId: primaryOrg.sedeId,
          scope,
          isGlobalRead,
        });
        setStoredAccessProfile({ isGlobalRead });

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
      activeOrgContext,
      isAdmin,
      loading,
      error,
      login,
      logout,
      isAuthenticated: !!usuario,
      hasRole,
      setActiveOrgContext,
    }),
    [usuario, activeOrgContext, isAdmin, loading, error],
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
