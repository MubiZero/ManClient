"use client";

import { useFormStatus } from "react-dom";

export function OnboardingSubmitButton({ label, pendingLabel, variant = "primary" }: { label: string; pendingLabel: string; variant?: "primary" | "quiet" }) {
  const { pending } = useFormStatus();

  return (
    <button className={variant === "quiet" ? "secondary-action" : "primary-button onboarding-primary-action"} type="submit" disabled={pending} aria-live="polite">
      {pending ? pendingLabel : label}
    </button>
  );
}
