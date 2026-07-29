import type { ReactNode } from "react";

export function EntityListPage({ eyebrow = "Настройки бизнеса", title, description, action, notice, error, children }: { eyebrow?: string; title: string; description: string; action?: ReactNode; notice?: string; error?: string; children: ReactNode }) {
  return (
    <section className="dashboard-content entity-page">
      <div className="page-heading"><div><p className="context-label">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>
      {notice ? <p className="entity-notice" role="status">{notice}</p> : null}
      {error ? <p className="entity-error" role="alert">{error}</p> : null}
      {children}
    </section>
  );
}
