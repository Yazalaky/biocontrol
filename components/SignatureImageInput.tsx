import React, { useMemo, useRef } from 'react';

interface Props {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  label: string;
  required?: boolean;
  helperText?: string;
}

const SignatureImageInput: React.FC<Props> = ({ value, onChange, label, required, helperText }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const meta = useMemo(() => {
    if (!value) return null;
    const isJpeg = value.startsWith('data:image/jpeg');
    const isPng = value.startsWith('data:image/png');
    const type = isPng ? 'PNG' : isJpeg ? 'JPG' : 'IMG';
    return { type };
  }, [value]);

  const pick = () => inputRef.current?.click();

  const handleFile = (file?: File) => {
    if (!file) return;
    const okType = ['image/png', 'image/jpeg'].includes(file.type);
    if (!okType) {
      alert('Formato no soportado. Usa PNG o JPG/JPEG.');
      return;
    }
    // Límite simple para evitar firmas gigantes (puedes subirlo si lo necesitas).
    if (file.size > 1024 * 1024) {
      const ok = confirm('La imagen pesa más de 1MB. ¿Deseas continuar? (puede afectar rendimiento)');
      if (!ok) return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const res = typeof reader.result === 'string' ? reader.result : null;
      onChange(res);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="force-light border border-gray-300 rounded bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-gray-700">
            {label} {required ? <span className="text-red-600">*</span> : null}
          </div>
          {helperText ? <div className="text-xs text-gray-500 mt-0.5">{helperText}</div> : null}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button type="button" onClick={pick} className="md-btn md-btn-outlined">
            {value ? 'Cambiar' : 'Subir firma'}
          </button>
          {value ? (
            <button type="button" onClick={() => onChange(null)} className="md-btn md-btn-tonal">
              Borrar
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 border border-gray-200 rounded bg-gray-50 p-2 min-h-[96px] flex items-center justify-center">
        {value ? (
          <div className="w-full">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase text-gray-500">{meta?.type}</span>
              <span className="text-[10px] text-gray-400">Vista previa</span>
            </div>
            <img src={value} alt="Firma" className="max-h-20 w-auto object-contain mx-auto" />
          </div>
        ) : (
          <span className="text-xs text-gray-400 italic">Sin firma seleccionada</span>
        )}
      </div>
    </div>
  );
};

export default SignatureImageInput;

