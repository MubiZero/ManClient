"use client";

import { ZoomIn } from "lucide-react";
import { useState } from "react";

import { Dialog, DialogContent } from "@/features/ui-kit/dialog";

export function ReceiptLightbox({ src }: { src: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative overflow-hidden rounded-md border border-border"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated binary endpoint is not an optimizable public asset */}
        <img src={src} alt="Чек, отправленный клиентом" className="max-h-96 w-full object-contain" />
        <span className="absolute inset-0 flex items-center justify-center bg-neutral-950/0 opacity-0 transition-all group-hover:bg-neutral-950/30 group-hover:opacity-100">
          <ZoomIn className="size-8 text-white" />
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated binary endpoint is not an optimizable public asset */}
          <img src={src} alt="Чек, отправленный клиентом (увеличено)" className="max-h-[85vh] w-full rounded-md object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
