import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { RolUsuario } from '../types';

const Login: React.FC = () => {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleLogin = async (rol: RolUsuario) => {
    setLoading(true);
    await login(rol);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-slate-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="mx-auto h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">BioControl</h1>
          <p className="text-gray-500">Seleccione un rol para simular el acceso</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => handleLogin(RolUsuario.GERENCIA)}
            disabled={loading}
            className="w-full flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 hover:border-blue-500 transition-all group"
          >
            <div className="text-left">
              <p className="font-semibold text-gray-800">Gerencia</p>
              <p className="text-xs text-gray-500">Solo lectura y reportes</p>
            </div>
            <span className="text-gray-300 group-hover:text-blue-500">&rarr;</span>
          </button>

          <button
            onClick={() => handleLogin(RolUsuario.AUXILIAR_ADMINISTRATIVA)}
            disabled={loading}
            className="w-full flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 hover:border-blue-500 transition-all group"
          >
            <div className="text-left">
              <p className="font-semibold text-gray-800">Auxiliar Administrativa</p>
              <p className="text-xs text-gray-500">Pacientes y Asignaciones</p>
            </div>
            <span className="text-gray-300 group-hover:text-blue-500">&rarr;</span>
          </button>

          <button
            onClick={() => handleLogin(RolUsuario.INGENIERO_BIOMEDICO)}
            disabled={loading}
            className="w-full flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 hover:border-blue-500 transition-all group"
          >
            <div className="text-left">
              <p className="font-semibold text-gray-800">Ingeniero Biomédico</p>
              <p className="text-xs text-gray-500">Gestión de Equipos</p>
            </div>
            <span className="text-gray-300 group-hover:text-blue-500">&rarr;</span>
          </button>
        </div>
        
        {loading && <p className="text-center text-sm text-blue-600 mt-4">Iniciando sesión...</p>}
      </div>
    </div>
  );
};

export default Login;