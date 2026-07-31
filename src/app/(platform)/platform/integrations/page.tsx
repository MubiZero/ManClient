import Link from "next/link";

import { listIntegrationHealth } from "@/core/platform/integration-health";
import { Badge } from "@/features/ui-kit/badge";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { PageHeader } from "@/features/ui-kit/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/features/ui-kit/table";

export default async function PlatformIntegrationsPage() {
  const integrations = await listIntegrationHealth();

  return (
    <>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
