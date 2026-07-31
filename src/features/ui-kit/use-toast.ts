"use client";

import { useSyncExternalStore } from "react";

export type ToastTone = "neutral" | "success" | "danger" | "warning";
export type ToastItem = { id: string; title: string; description?: string; tone: ToastTone };

let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();
const emptyToasts: ToastItem[] = [];

function emit() {
  for (const listener of listeners) listener();
}

export function toast(input: { title: string; description?: string; tone?: ToastTone }) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  toasts = [...toasts, { id, tone: input.tone ?? "neutral", title: input.title, description: input.description }];
  emit();
  setTimeout(() => dismissToast(id), 5000);
  return id;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((item) => item.id !== id);
  emit();
}

export function useToasts() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => toasts,
    () => emptyToasts,
  );
}
