import { endCustomerSession } from "@/core/customers/customer-session";

/** POST rather than a link: a signed-in customer must not be signed out by an image on another site. */
export async function POST(): Promise<Response> {
  await endCustomerSession();
  return Response.json({ ok: true });
}
