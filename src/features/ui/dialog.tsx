"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function Dialog({ open, title, description, children, onClose }: { open: boolean; title: string; description?: string; children: ReactNode; onClose?: () => void }) {
  const reference = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = reference.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={reference} className="ui-dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onClose={onClose}>
      <div className="ui-dialog-content">
        <h2 id={titleId}>{title}</h2>
        {description ? <p id={descriptionId}>{description}</p> : null}
        <div className="ui-dialog-actions">{children}</div>
      </div>
    </dialog>
  );
}
