"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/features/ui-kit/sheet";

export function SettingsSheet({
  open,
  closeHref,
  title,
  description,
  visuallyHiddenTitle,
  children,
}: {
  open: boolean;
  closeHref: string;
  title: string;
  description?: string;
  visuallyHiddenTitle?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) router.push(closeHref);
      }}
    >
      <SheetContent>
        <SheetHeader className={visuallyHiddenTitle ? "sr-only" : undefined}>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
