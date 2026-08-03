import { requirePlatformAdmin } from "@/core/auth/platform-session";
import { listAuditEvents } from "@/core/platform/audit-log";

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(request: Request) {
  await requirePlatformAdmin();
  const url = new URL(request.url);
  const businessId = url.searchParams.get("businessId") ?? undefined;
  const type = url.searchParams.get("type") ?? undefined;

  const rows: string[] = ["Время,Бизнес,Тип,Актор"];
  let cursor: string | null | undefined;
  do {
    const page = await listAuditEvents({ businessId, type }, { cursor });
    for (const event of page.items) {
      rows.push(
        [event.createdAt.toISOString(), event.business.name, event.type, event.actorType]
          .map((value) => csvEscape(String(value)))
          .join(","),
      );
    }
    cursor = page.nextCursor;
  } while (cursor);

  return new Response(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log.csv"`,
    },
  });
}
