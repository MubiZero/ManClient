"use client";

import { useFormStatus } from "react-dom";

export function OnboardingSubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button className="primary-button onboarding-primary-action" type="submit" disabled={pending} aria-live="polite">
      {pending ? pendingLabel : label}
    </button>
  );
}
