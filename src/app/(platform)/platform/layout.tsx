import type { ReactNode } from "react";

import { signOut } from "@/auth";
import { requirePlatformAdmin } from "@/core/auth/platform-session";
import { PlatformNav } from "@/features/platform/platform-nav";
import { Toaster } from "@/features/ui-kit/toaster";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  await requirePlatformAdmin();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground md:flex-row">
      <PlatformNav signOutAction={async () => { "use server"; await signOut({ redirectTo: "/login" }); }} />
      <main className="flex-1 overflow-x-hidden p-4 md:p-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">{children}</div>
      </main>
      <Toaster />
    </div>
  );
}
