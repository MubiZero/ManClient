/**
 * The post-deploy probe. It answers the one question no check before the push can answer: is the thing
 * that is actually running reachable over a working HTTPS, and does it carry the secrets it needs?
 *
 * The unit tests prove the code fails closed when a secret is missing. This proves the deployed
 * environment has those secrets at all — a variable that was never added to Coolify looks exactly like a
 * healthy app until the first webhook arrives, and by then the salon has already missed it.
 */

export type ProbeCheck = { name: string; ok: boolean; detail: string };

export type ProbeDependencies = {
  fetch: typeof globalThis.fetch;
  /** Resolves the TLS certificate the host presents, or rejects if the handshake fails. */
  peerCertificate: (host: string, port: number) => Promise<{ validTo: Date; host: string }>;
  now: () => Date;
};

/** A certificate renews at 30 days left. Two weeks of silence means renewal is stuck, not merely due. */
export const CERTIFICATE_MIN_DAYS = 14;

/** Any value would do — the point is that a wrong token is refused, so the real one must be configured. */
const WRONG_VERIFY_TOKEN = "probe-not-the-verify-token";

export async function probeDeployment(rawUrl: string, dependencies: ProbeDependencies): Promise<ProbeCheck[]> {
  const url = parseUrl(rawUrl);
  if (!url) return [{ name: "url", ok: false, detail: `not a valid URL: ${rawUrl}` }];
  if (url.protocol !== "https:") {
    // Everything below would still pass over plain HTTP and would prove nothing about the pilot.
    return [{ name: "https", ok: false, detail: `probe target must be https, got ${url.protocol}//` }];
  }

  const origin = url.origin;
  return [
    { name: "https", ok: true, detail: origin },
    await certificateCheck(url, dependencies),
    await plaintextCheck(url, dependencies),
    await statusCheck(dependencies, "health", `${origin}/api/health`, { expected: 200, body: '"status":"ok"' }),
    await statusCheck(dependencies, "legacy webhook gone", `${origin}/api/webhooks/telegram`, { expected: 410, method: "POST" }),
    await statusCheck(dependencies, "telegram webhook secret set", `${origin}/api/webhooks/telegram/platform`, { expected: 401, method: "POST", body: "{}" }),
    await statusCheck(dependencies, "whatsapp verify token set", `${origin}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${WRONG_VERIFY_TOKEN}&hub.challenge=probe`, { expected: 403 }),
  ];
}

async function certificateCheck(url: URL, dependencies: ProbeDependencies): Promise<ProbeCheck> {
  const name = "certificate";
  try {
    const certificate = await dependencies.peerCertificate(url.hostname, Number(url.port || 443));
    const daysLeft = Math.floor((certificate.validTo.getTime() - dependencies.now().getTime()) / 86_400_000);
    if (daysLeft < 0) return { name, ok: false, detail: `expired ${-daysLeft} day(s) ago` };
    if (daysLeft < CERTIFICATE_MIN_DAYS) return { name, ok: false, detail: `expires in ${daysLeft} day(s) — renewal is not running` };
    return { name, ok: true, detail: `${certificate.host}, ${daysLeft} day(s) left` };
  } catch (error) {
    return { name, ok: false, detail: `TLS handshake failed: ${messageOf(error)}` };
  }
}

/**
 * Plain HTTP must not serve the app: session cookies are `Secure`, and a page delivered over port 80 is a
 * page a network can rewrite. A redirect is the expected answer; a closed port is an equally good one.
 */
async function plaintextCheck(url: URL, dependencies: ProbeDependencies): Promise<ProbeCheck> {
  const name = "no plaintext";
  try {
    const response = await dependencies.fetch(`http://${url.host}/api/health`, { redirect: "manual" });
    const location = response.headers.get("location") ?? "";
    if (response.status >= 300 && response.status < 400 && location.startsWith("https://")) {
      return { name, ok: true, detail: `port 80 redirects to ${location}` };
    }
    return { name, ok: false, detail: `port 80 answered ${response.status} instead of redirecting to https` };
  } catch {
    return { name, ok: true, detail: "port 80 does not answer" };
  }
}

async function statusCheck(
  dependencies: ProbeDependencies,
  name: string,
  url: string,
  expectation: { expected: number; method?: string; body?: string },
): Promise<ProbeCheck> {
  try {
    const response = await dependencies.fetch(url, {
      method: expectation.method ?? "GET",
      redirect: "manual",
      ...(expectation.method === "POST" ? { headers: { "content-type": "application/json" }, body: expectation.body ?? "{}" } : {}),
    });
    if (response.status !== expectation.expected) {
      return { name, ok: false, detail: `expected HTTP ${expectation.expected}, got ${response.status}` };
    }
    if (expectation.method !== "POST" && expectation.body) {
      const text = await response.text();
      if (!text.includes(expectation.body)) return { name, ok: false, detail: `HTTP 200 but body does not contain ${expectation.body}` };
    }
    return { name, ok: true, detail: `HTTP ${response.status}` };
  } catch (error) {
    return { name, ok: false, detail: `request failed: ${messageOf(error)}` };
  }
}

export function formatProbeReport(checks: ProbeCheck[]): string {
  return `${checks.map(check => `${check.ok ? "ok  " : "FAIL"} ${check.name}: ${check.detail}`).join("\n")}\n`;
}

function parseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

/** A probe failure is read by a human mid-release, so the reason has to survive into the output. */
function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}
