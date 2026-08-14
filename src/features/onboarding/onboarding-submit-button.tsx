"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/features/ui-kit/button";

/**
 * The wizard's own submit: same primitive as everywhere else, but a step's action is the one thing on
 * the screen the owner is meant to press, so it is full width and a size larger than a form button
 * buried in settings.
 */
export function OnboardingSubmitButton({
  label,
  pendingLabel,
  variant = "primary",
  className = "w-full",
}: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} size="lg" className={className} loading={pending} aria-live="polite">
      {pending ? pendingLabel : label}
    </Button>
  );
}
