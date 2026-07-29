import { auth } from "@/auth";
import {
  connectTelegramForDashboard,
  getTelegramDashboardStatus,
  TelegramDashboardError,
} from "@/core/integrations/telegram-dashboard-service";

export async function GET() {
  const userId = await sessionUserId();
  if (!userId) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    return Response.json(await getTelegramDashboardStatus(userId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const userId = await sessionUserId();
  if (!userId) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    return Response.json(await connectTelegramForDashboard(userId, await request.json()));
  } catch (error) {
    return errorResponse(error);
  }
}

async function sessionUserId() {
  return (await auth())?.user?.id ?? null;
}

export function errorResponse(error: unknown) {
  if (!(error instanceof TelegramDashboardError)) {
    return Response.json({ error: "TELEGRAM_UNAVAILABLE" }, { status: 503 });
  }
  const status = error.code === "UNAUTHORIZED" ? 401
    : error.code === "FORBIDDEN" ? 403
      : error.code === "NOT_CONNECTED" ? 404
        : error.code === "TELEGRAM_UNAVAILABLE" || error.code === "CONFIGURATION_ERROR" ? 503
          : 400;
  return Response.json({ error: error.code }, { status });
}
