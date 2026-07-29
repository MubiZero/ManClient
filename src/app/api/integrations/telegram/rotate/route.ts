import { auth } from "@/auth";
import { rotateTelegramForDashboard } from "@/core/integrations/telegram-dashboard-service";
import { errorResponse } from "@/app/api/integrations/telegram/route";

export async function POST(request: Request) {
  const userId = (await auth())?.user?.id;
  if (!userId) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    return Response.json(await rotateTelegramForDashboard(userId, await request.json()));
  } catch (error) {
    return errorResponse(error);
  }
}
