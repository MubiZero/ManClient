"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/features/ui/button";

export function SubmitButton({ idle, pending, variant = "primary", disabled = false }: { idle: string; pending: string; variant?: "primary" | "secondary" | "danger"; disabled?: boolean }) {
  const status = useFormStatus();
  return <Button type="submit" variant={variant} disabled={disabled} loading={status.pending} loadingLabel={pending}>{idle}</Button>;
}
