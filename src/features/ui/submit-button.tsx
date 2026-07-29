"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/features/ui/button";

export function SubmitButton({ idle, pending, variant = "primary" }: { idle: string; pending: string; variant?: "primary" | "secondary" | "danger" }) {
  const status = useFormStatus();
  return <Button type="submit" variant={variant} loading={status.pending} loadingLabel={pending}>{idle}</Button>;
}
