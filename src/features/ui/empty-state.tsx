import type { ReactNode } from "react";

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <section className="ui-empty-state">
      <div className="ui-empty-mark" aria-hidden>+</div>
      <div><h2>{title}</h2><p>{description}</p></div>
      {action ? <div className="ui-empty-action">{action}</div> : null}
    </section>
  );
}
