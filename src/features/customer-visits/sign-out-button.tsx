"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { t, type SupportedLocale } from "@/i18n/translate";

/** Signing out matters on a shared phone, which in a salon is most phones. */
export function SignOutButton({ locale }: { locale: SupportedLocale }) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);

  return (
    <button
      type="button"
      className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
      disabled={isBusy}
      onClick={async () => {
        setIsBusy(true);
        try {
          await fetch("/api/public/customer/logout", { method: "POST" });
          router.refresh();
        } finally {
          setIsBusy(false);
        }
      }}
    >
      {t(locale, "visits.signOut")}
    </button>
  );
}
