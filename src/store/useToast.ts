import { create } from 'zustand';

export interface ToastOptions {
  title: string;
  message: string;
  type?: 'success' | 'error' | 'info';
}

interface ToastState {
  toast: ToastOptions | null;
  show: (toast: ToastOptions | null) => void;
}

/**
 * Toast lives in its own tiny store so showing/hiding one never re-renders
 * the (persisted, whole-app) main store's subscribers — previously every
 * toast triggered two full-state AsyncStorage writes and a dashboard
 * re-render.
 */
export const useToastStore = create<ToastState>()((set) => ({
  toast: null,
  show: (toast) => set({ toast }),
}));
