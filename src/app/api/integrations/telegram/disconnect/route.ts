import { auth } from "@/auth";
import { disconnectTelegramForDashboard } from "@/core/integrations/telegram-dashboard-service";
import { errorResponse } from "@/app/api/integrations/telegram/route";

export async function POST() {
  const userId = (await auth())?.user?.id;
  if (!userId) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    return Response.json(await disconnectTelegramForDashboard(userId));
  } catch (error) {
    return errorResponse(error);
  }
}
