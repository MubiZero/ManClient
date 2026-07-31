"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";

import { cn } from "@/features/ui-kit/cn";
import { dismissToast, useToasts, type ToastTone } from "@/features/ui-kit/use-toast";

const toneClass: Record<ToastTone, string> = {
  neutral: "border-border bg-card text-foreground",
  success: "border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-200",
  danger: "border-danger-100 bg-danger-50 text-danger-700 dark:border-danger-700 dark:bg-danger-600/10 dark:text-danger-500",
  warning: "border-warning-100 bg-warning-50 text-warning-700 dark:border-warning-700 dark:bg-warning-600/10 dark:text-warning-500",
};

export function Toaster() {
  const toasts = useToasts();

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {toasts.map((item) => (
        <ToastPrimitive.Root
          key={item.id}
          open
          onOpenChange={(open) => {
            if (!open) dismissToast(item.id);
          }}
          className={cn(
            "grid grid-cols-[1fr_auto] items-start gap-2 rounded-md border p-4 shadow-md",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out",
            toneClass[item.tone],
          )}
        >
          <div className="flex flex-col gap-0.5">
            <ToastPrimitive.Title className="text-sm font-semibold">{item.title}</ToastPrimitive.Title>
            {item.description ? <ToastPrimitive.Description className="text-sm opacity-90">{item.description}</ToastPrimitive.Description> : null}
          </div>
          <ToastPrimitive.Close aria-label="Закрыть" className="text-sm opacity-60 transition-opacity hover:opacity-100">
            ×
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-6" />
    </ToastPrimitive.Provider>
  );
}
