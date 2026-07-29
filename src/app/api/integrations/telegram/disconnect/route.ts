import { auth } from "@/auth";
import { disconnectTelegramForDashboard } from "@/core/integrations/telegram-dashboard-service";
import { errorResponse } from "@/app/api/integrations/telegram/route";

export async function POST() {
  const email = (await auth())?.user?.email;
  if (!email) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    return Response.json(await disconnectTelegramForDashboard(email));
  } catch (error) {
    return errorResponse(error);
  }
}
