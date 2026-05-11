import { create } from 'zustand';

interface ToastState {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
}

interface UIState {
  toasts: ToastState[];
  pushToast: (message: string, tone?: ToastState['tone']) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

export const useUI = create<UIState>((set) => ({
  toasts: [],
  pushToast: (message, tone = 'info') => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
