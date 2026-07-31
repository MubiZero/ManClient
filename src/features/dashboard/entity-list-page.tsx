import type { ReactNode } from "react";

import { PageHeader } from "@/features/ui-kit/page-header";
import { ToastEmitter } from "@/features/ui-kit/toast-emitter";

export function EntityListPage({
  eyebrow = "Настройки бизнеса",
  title,
  description,
  action,
  notice,
  error,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
  notice?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <>
      <ToastEmitter notice={notice} error={error} />
      <PageHeader eyebrow={eyebrow} title={title} description={description} action={action} />
      {children}
    </>
  );
}
