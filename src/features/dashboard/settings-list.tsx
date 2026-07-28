import type { ReactNode } from "react";

export function SettingsList({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="dashboard-content"><div className="page-heading"><div><p className="context-label">Настройки бизнеса</p><h1>{title}</h1><p>{description}</p></div></div><div className="settings-list">{children}</div></section>;
}
