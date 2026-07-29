import { z } from "zod";

import { prisma } from "@/core/database/prisma";
import {
  BusinessTelegramIntegrationError,
  connectBusinessTelegramBot,
  disconnectBusinessTelegramBot,
  getBusinessTelegramStatus,
  rotateBusinessTelegramBot,
  type BusinessTelegramApi,
  type BusinessTelegramErrorCode,
} from "@/core/integrations/business-telegram-service";
import { createTelegramApi } from "@/integrations/telegram/telegram-api";

export type TelegramApiFactory = (token: string) => BusinessTelegramApi;

export type TelegramDashboardStatus = {
  status: "DISCONNECTED" | "PENDING" | "ACTIVE" | "ERROR";
  botUsername: string | null;
  connectedAt: Date | null;
  lastWebhookError: string | null;
};

export class TelegramDashboardError extends Error {
  constructor(public readonly code: BusinessTelegramErrorCode | "UNAUTHORIZED") {
    super(code);
    this.name = "TelegramDashboardError";
  }
}

const tokenInput = z.object({ token: z.string().trim().min(1) }).strict();

export async function getTelegramDashboardStatus(userId: string): Promise<TelegramDashboardStatus> {
  const membership = await managerMembership(userId);
  const integration = await getBusinessTelegramStatus(membership.businessId);
  return safeStatus(integration);
}

export async function connectTelegramForDashboard(
  userId: string,
  input: unknown,
  telegramFactory: TelegramApiFactory = createTelegramApi,
): Promise<TelegramDashboardStatus> {
  const membership = await managerMembership(userId);
  const token = parseToken(input);
  try {
    return safeStatus(await connectBusinessTelegramBot(
      { businessId: membership.businessId, actorUserId: membership.userId, token },
      telegramFactory(token),
    ));
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function rotateTelegramForDashboard(
  userId: string,
  input: unknown,
  telegramFactory: TelegramApiFactory = createTelegramApi,
): Promise<TelegramDashboardStatus> {
  const membership = await managerMembership(userId);
  const token = parseToken(input);
  try {
    return safeStatus(await rotateBusinessTelegramBot(
      { businessId: membership.businessId, actorUserId: membership.userId, token },
      telegramFactory(token),
    ));
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function disconnectTelegramForDashboard(
  userId: string,
  telegramFactory?: TelegramApiFactory,
): Promise<TelegramDashboardStatus> {
  const membership = await managerMembership(userId);
  try {
    await disconnectBusinessTelegramBot(
      { businessId: membership.businessId, actorUserId: membership.userId },
      telegramFactory?.(""),
    );
    return disconnectedStatus();
  } catch (error) {
    throw normalizeError(error);
  }
}

async function managerMembership(userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { userId },
    select: { businessId: true, userId: true, role: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) throw new TelegramDashboardError("UNAUTHORIZED");
  if (membership.role === "STAFF") throw new TelegramDashboardError("FORBIDDEN");
  return membership;
}

function parseToken(input: unknown) {
  const parsed = tokenInput.safeParse(input);
  if (!parsed.success) throw new TelegramDashboardError("INVALID_BOT_TOKEN");
  return parsed.data.token;
}

function safeStatus(integration: {
  status: "DISCONNECTED" | "PENDING" | "ACTIVE" | "ERROR";
  botUsername: string;
  connectedAt: Date | null;
  lastWebhookError?: string | null;
} | null): TelegramDashboardStatus {
  if (!integration || integration.status === "DISCONNECTED") return disconnectedStatus();
  return {
    status: integration.status,
    botUsername: integration.botUsername,
    connectedAt: integration.connectedAt,
    lastWebhookError: integration.lastWebhookError ?? null,
  };
}

function disconnectedStatus(): TelegramDashboardStatus {
  return { status: "DISCONNECTED", botUsername: null, connectedAt: null, lastWebhookError: null };
}

function normalizeError(error: unknown) {
  if (error instanceof TelegramDashboardError) return error;
  if (error instanceof BusinessTelegramIntegrationError) return new TelegramDashboardError(error.code);
  return new TelegramDashboardError("TELEGRAM_UNAVAILABLE");
}
