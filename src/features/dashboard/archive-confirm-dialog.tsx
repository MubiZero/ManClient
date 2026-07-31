"use client";

import { useRouter } from "next/navigation";

import { Button, ButtonLink } from "@/features/ui-kit/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/features/ui-kit/dialog";

export function ArchiveConfirmDialog({
  open,
  closeHref,
  title,
  description,
  action,
  entityIdField,
  entityId,
  confirmLabel,
}: {
  open: boolean;
  closeHref: string;
  title: string;
  description: string;
  action: (formData: FormData) => void | Promise<void>;
  entityIdField: string;
  entityId?: string;
  confirmLabel: string;
}) {
  const router = useRouter();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) router.push(closeHref);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <ButtonLink variant="quiet" href={closeHref}>
            Отмена
          </ButtonLink>
          {entityId ? (
            <form action={action}>
              <input type="hidden" name={entityIdField} value={entityId} />
              <Button type="submit" variant="destructive">
                {confirmLabel}
              </Button>
            </form>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
