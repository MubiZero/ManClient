"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/features/ui-kit/button";

export function SubmitButton({
  idle,
  pending,
  variant = "primary",
  disabled = false,
}: {
  idle: string;
  pending: string;
  variant?: "primary" | "secondary" | "quiet" | "destructive";
  disabled?: boolean;
}) {
  const status = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={disabled} loading={status.pending}>
      {status.pending ? pending : idle}
    </Button>
  );
}
