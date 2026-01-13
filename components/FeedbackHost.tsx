import React, { useEffect, useRef, useState } from 'react';
import {
  CONFIRM_EVENT,
  CONFIRM_RESULT_EVENT,
  TOAST_EVENT,
  feedbackBus,
  type ConfirmPayload,
  type ToastPayload,
} from '../services/feedback';

interface ToastItem extends ToastPayload {
  id: string;
}

interface ConfirmItem extends ConfirmPayload {
  id: string;
}

const toneBadge = (tone: ToastPayload['tone']) => {
  switch (tone) {
    case 'success':
      return { label: 'OK', bg: '#16a34a', fg: '#ffffff' };
    case 'error':
      return { label: 'Error', bg: '#dc2626', fg: '#ffffff' };
    case 'warning':
      return { label: 'Aviso', bg: '#d97706', fg: '#ffffff' };
    default:
      return { label: 'Info', bg: '#2563eb', fg: '#ffffff' };
  }
};

const FeedbackHost: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirm, setConfirm] = useState<ConfirmItem | null>(null);
  const timeoutsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastItem>).detail;
      if (!detail) return;
      setToasts((prev) => [...prev, detail]);
      const duration = typeof detail.durationMs === 'number' ? detail.durationMs : 4200;
      if (duration > 0) {
        const timeoutId = window.setTimeout(() => {
          removeToast(detail.id);
        }, duration);
        timeoutsRef.current.set(detail.id, timeoutId);
      }
    };

    const onConfirm = (event: Event) => {
      const detail = (event as CustomEvent<ConfirmItem>).detail;
      if (!detail) return;
      setConfirm(detail);
    };

    feedbackBus.addEventListener(TOAST_EVENT, onToast);
    feedbackBus.addEventListener(CONFIRM_EVENT, onConfirm);

    return () => {
      feedbackBus.removeEventListener(TOAST_EVENT, onToast);
      feedbackBus.removeEventListener(CONFIRM_EVENT, onConfirm);
      timeoutsRef.current.forEach((id) => window.clearTimeout(id));
      timeoutsRef.current.clear();
    };
  }, []);

  const removeToast = (id: string) => {
    const timeoutId = timeoutsRef.current.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutsRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const resolveConfirm = (ok: boolean) => {
    if (!confirm) return;
    feedbackBus.dispatchEvent(
      new CustomEvent(CONFIRM_RESULT_EVENT, {
        detail: { id: confirm.id, ok },
      }),
    );
    setConfirm(null);
  };

  return (
    <>
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:right-6 z-[90] flex flex-col gap-3 items-stretch sm:items-end">
        {toasts.map((t) => {
          const badge = toneBadge(t.tone);
          return (
            <div
              key={t.id}
              className="pointer-events-auto rounded-2xl border px-4 py-3 shadow-lg"
              style={{
                background: 'var(--md-surface)',
                color: 'var(--md-text)',
                borderColor: 'var(--md-outline)',
              }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                  style={{ background: badge.bg, color: badge.fg }}
                >
                  {badge.label}
                </span>
                <div className="flex-1">
                  {t.title ? <div className="text-sm font-semibold">{t.title}</div> : null}
                  <div className="text-sm whitespace-pre-line" style={{ color: 'var(--md-text-2)' }}>
                    {t.message}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-xs"
                  style={{ color: 'var(--md-text-3)' }}
                  onClick={() => removeToast(t.id)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {confirm ? (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-md rounded-2xl border shadow-2xl p-5"
            style={{
              background: 'var(--md-surface)',
              color: 'var(--md-text)',
              borderColor: 'var(--md-outline)',
            }}
          >
            <div className="text-lg font-semibold">{confirm.title || 'Confirmar accion'}</div>
            <div className="mt-2 text-sm whitespace-pre-line" style={{ color: 'var(--md-text-2)' }}>
              {confirm.message}
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" className="md-btn md-btn-outlined" onClick={() => resolveConfirm(false)}>
                {confirm.cancelText || 'Cancelar'}
              </button>
              <button
                type="button"
                className="md-btn md-btn-filled"
                style={confirm.tone === 'danger' ? { background: '#dc2626' } : undefined}
                onClick={() => resolveConfirm(true)}
              >
                {confirm.confirmText || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default FeedbackHost;
