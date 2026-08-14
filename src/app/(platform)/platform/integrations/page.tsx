import { redirect } from "next/navigation";
import Link from "next/link";

import { requirePlatformAdmin } from "@/core/auth/platform-session";
import { BusinessTelegramIntegrationError, retryBusinessTelegramWebhook } from "@/core/integrations/business-telegram-service";
import { listIntegrationHealth } from "@/core/platform/integration-health";
import { CursorPager, currentCursor, filterQuery, readPageTrail } from "@/features/ui-kit/cursor-pager";
import { Badge } from "@/features/ui-kit/badge";
import { Button } from "@/features/ui-kit/button";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { PageHeader } from "@/features/ui-kit/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";
import { ToastEmitter } from "@/features/ui-kit/toast-emitter";

type PageProps = { searchParams: Promise<{ notice?: string; error?: string; cursor?: string; trail?: string }> };

export default async function PlatformIntegrationsPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const trail = readPageTrail(query.trail);
  const { items: integrations, nextCursor } = await listIntegrationHealth({ cursor: currentCursor(trail) });

  async function retry(formData: FormData) {
    "use server";
    const admin = await requirePlatformAdmin();
    const integrationId = String(formData.get("integrationId") ?? "");
    try {
      await retryBusinessTelegramWebhook({ integrationId, actorUserId: admin.userId });
    } catch (error) {
      const code = error instanceof BusinessTelegramIntegrationError ? error.code : "TELEGRAM_UNAVAILABLE";
      redirect(`/platform/integrations?error=${code}`);
    }
    redirect("/platform/integrations?notice=retried");
  }

  return (
    <>
      <ToastEmitter notice={noticeMessage(query.notice)} error={errorMessage(query.error)} />
      <PageHeader eyebrow="Платформа" title="Здоровье интеграций" description="Telegram-боты и очередь сообщений по всем бизнесам." />

      {integrations.length === 0 ? (
        <EmptyState title="Интеграций пока нет" description="Ни один бизнес ещё не подключил клиентского бота." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Бизнес</TableHead>
              <TableHead>Бот</TableHead>
              <TableHead>Способ подключения</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Последняя ошибка webhook</TableHead>
              <TableHead>Ошибок доставки</TableHead>
              <TableHead>Действие</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {integrations.map((integration) => (
              <TableRow key={integration.id}>
                <TableCell>
                  <Link href={`/platform/businesses/${integration.business.id}`} className="font-medium text-foreground hover:underline">
                    {integration.business.name}
                  </Link>
                </TableCell>
                <TableCell>@{integration.botUsername}</TableCell>
                <TableCell className="text-muted-foreground">{integration.connectionMethod === "MANAGED" ? "Managed Bots" : "Token"}</TableCell>
                <TableCell>
                  <Badge variant={integration.status === "ACTIVE" ? "success" : integration.status === "ERROR" ? "danger" : "warning"}>
                    {integration.status}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate text-destructive">{integration.lastWebhookError ?? "—"}</TableCell>
                <TableCell>
                  {integration.failedMessages > 0 ? <Badge variant="danger">{integration.failedMessages}</Badge> : <span className="text-muted-foreground">0</span>}
                </TableCell>
                <TableCell>
                  {integration.status !== "DISCONNECTED" ? (
                    <form action={retry}>
                      <input type="hidden" name="integrationId" value={integration.id} />
                      <Button type="submit" size="sm" variant="secondary">
                        Переподключить
                      </Button>
                    </form>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CursorPager basePath="/platform/integrations" query={filterQuery(query)} trail={trail} nextCursor={nextCursor} label="Страницы интеграций" />
    </>
  );
}

function noticeMessage(code?: string) {
  return ({ retried: "Webhook переподключён." } as Record<string, string>)[code ?? ""];
}
function errorMessage(code?: string) {
  return ({
    NOT_CONNECTED: "У этой интеграции нет сохранённого токена — переподключение невозможно.",
    TELEGRAM_UNAVAILABLE: "Telegram не ответил на запрос. Попробуйте ещё раз позже.",
    CONFIGURATION_ERROR: "Не настроены переменные окружения для интеграций.",
  } as Record<string, string>)[code ?? ""];
}
