"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function Dialog({ open, title, description, children, onClose }: { open: boolean; title: string; description?: string; children: ReactNode; onClose?: () => void }) {
  const reference = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = reference.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={reference} open={open || undefined} className="ui-dialog" aria-modal="true" aria-labelledby="ui-dialog-title" aria-describedby={description ? "ui-dialog-description" : undefined} onClose={onClose}>
      <div className="ui-dialog-content">
        <h2 id="ui-dialog-title">{title}</h2>
        {description ? <p id="ui-dialog-description">{description}</p> : null}
        <div className="ui-dialog-actions">{children}</div>
      </div>
    </dialog>
  );
}
