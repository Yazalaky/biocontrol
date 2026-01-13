export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastPayload {
  message: string;
  title?: string;
  tone?: ToastTone;
  durationMs?: number;
}

export type ConfirmTone = 'default' | 'danger';

export interface ConfirmPayload {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
}

interface ToastEventPayload extends ToastPayload {
  id: string;
}

interface ConfirmEventPayload extends ConfirmPayload {
  id: string;
}

interface ConfirmResultPayload {
  id: string;
  ok: boolean;
}

export const feedbackBus = new EventTarget();
export const TOAST_EVENT = 'app-toast';
export const CONFIRM_EVENT = 'app-confirm';
export const CONFIRM_RESULT_EVENT = 'app-confirm-result';

let seq = 0;
const nextId = () => {
  seq += 1;
  return `fb_${Date.now()}_${seq}`;
};

export const toast = (payload: ToastPayload) => {
  const detail: ToastEventPayload = {
    id: nextId(),
    tone: 'info',
    durationMs: 4200,
    ...payload,
  };
  feedbackBus.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail }));
};

export const confirmDialog = (payload: ConfirmPayload) => {
  const id = nextId();
  return new Promise<boolean>((resolve) => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ConfirmResultPayload>).detail;
      if (!detail || detail.id !== id) return;
      feedbackBus.removeEventListener(CONFIRM_RESULT_EVENT, handler);
      resolve(detail.ok);
    };
    feedbackBus.addEventListener(CONFIRM_RESULT_EVENT, handler);
    const detail: ConfirmEventPayload = {
      id,
      title: 'Confirmar accion',
      confirmText: 'Confirmar',
      cancelText: 'Cancelar',
      tone: 'default',
      ...payload,
    };
    feedbackBus.dispatchEvent(new CustomEvent(CONFIRM_EVENT, { detail }));
  });
};

