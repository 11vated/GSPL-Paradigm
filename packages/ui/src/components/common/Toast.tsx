import { useState, useEffect, useCallback } from 'react';
import { create } from 'zustand';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  readonly id: number;
  readonly type: ToastType;
  readonly message: string;
  readonly duration: number;
}

interface ToastState {
  toasts: ToastItem[];
  add(type: ToastType, message: string, duration?: number): void;
  remove(id: number): void;
}

let toastCounter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  add(type, message, duration = 4000) {
    const id = ++toastCounter;
    set((state) => ({ toasts: [...state.toasts, { id, type, message, duration }] }));
  },
  remove(id) {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));

const TYPE_STYLES: Record<ToastType, string> = {
  success: 'border-emerald-700/50 bg-emerald-900/20 text-emerald-300',
  error: 'border-red-700/50 bg-red-900/20 text-red-300',
  warning: 'border-amber-700/50 bg-amber-900/20 text-amber-300',
  info: 'border-blue-700/50 bg-blue-900/20 text-blue-300',
};

function ToastItem({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    if (toast.duration > 0) {
      const timer = setTimeout(onDismiss, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.duration, onDismiss]);

  return (
    <div
      className={`animate-in slide-in-from-right rounded-md border px-4 py-2.5 text-sm shadow-lg ${TYPE_STYLES[toast.type]}`}
      role="alert"
    >
      {toast.message}
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => remove(toast.id)} />
      ))}
    </div>
  );
}

/** Convenience hook for showing toasts. */
export function useToast() {
  const add = useToastStore((s) => s.add);
  return {
    success: useCallback((msg: string) => add('success', msg), [add]),
    error: useCallback((msg: string) => add('error', msg), [add]),
    warning: useCallback((msg: string) => add('warning', msg), [add]),
    info: useCallback((msg: string) => add('info', msg), [add]),
  };
}
