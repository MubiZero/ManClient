import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button, LinkButton } from "@/features/ui/button";
import { Dialog } from "@/features/ui/dialog";
import { EmptyState } from "@/features/ui/empty-state";
import { Field } from "@/features/ui/field";
import { StatusBadge } from "@/features/ui/status-badge";

describe("UI primitives", () => {
  it("wires field labels, hints and inline errors", () => {
    const html = renderToStaticMarkup(<Field label="Название" name="name" hint="До 120 символов" error="Введите название" />);
    expect(html).toContain('for="field-name"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="field-name-error"');
    expect(html).toContain('role="alert"');
  });

  it("keeps loading feedback inside a disabled button", () => {
    const html = renderToStaticMarkup(<Button loading loadingLabel="Сохраняем">Сохранить услугу</Button>);
    expect(html).toContain("Сохраняем");
    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
  });

  it("renders semantic link, status, empty and dialog states", () => {
    expect(renderToStaticMarkup(<LinkButton href="/dashboard">Открыть кабинет</LinkButton>)).toContain('href="/dashboard"');
    expect(renderToStaticMarkup(<StatusBadge tone="success">Опубликована</StatusBadge>)).toContain("status-badge-success");
    expect(renderToStaticMarkup(<EmptyState title="Добавьте первую услугу" description="После этого клиенты смогут выбрать время." action={<button>Создать услугу</button>} />)).toContain("Создать услугу");
    expect(renderToStaticMarkup(<Dialog open title="Архивировать услугу" description="История записей сохранится."><button>Архивировать услугу</button></Dialog>)).toContain('aria-modal="true"');
  });
});
