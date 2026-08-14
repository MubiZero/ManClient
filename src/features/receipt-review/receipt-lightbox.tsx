"use client";

import { ZoomIn } from "lucide-react";
import { useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/features/ui-kit/dialog";

/**
 * The receipt itself, on the page rather than behind a link: a reviewer compares the photo with the
 * recognised numbers, and a second browser tab breaks that comparison in half.
 */
export function ReceiptLightbox({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative overflow-hidden rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated binary endpoint is not an optimizable public asset */}
        <img src={src} alt={alt} loading="lazy" className="max-h-96 w-full object-contain" />
        <span className="absolute inset-0 flex items-center justify-center bg-neutral-950/0 opacity-0 transition-all group-hover:bg-neutral-950/30 group-hover:opacity-100">
          <ZoomIn className="size-8 text-white" />
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>{alt}</DialogTitle>
          </DialogHeader>
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated binary endpoint is not an optimizable public asset */}
          <img src={src} alt={`${alt} (увеличено)`} className="max-h-[85vh] w-full rounded-md object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
