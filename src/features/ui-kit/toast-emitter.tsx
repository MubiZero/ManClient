"use client";

import { useEffect } from "react";

import { dismissToast, toast } from "@/features/ui-kit/use-toast";

export function ToastEmitter({ notice, error }: { notice?: string; error?: string }) {
  useEffect(() => {
    if (!notice) return;
    const id = toast({ title: notice, tone: "success" });
    return () => dismissToast(id);
  }, [notice]);

  useEffect(() => {
    if (!error) return;
    const id = toast({ title: error, tone: "danger" });
    return () => dismissToast(id);
  }, [error]);

  return null;
}
