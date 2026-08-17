/**
 * `pnpm deploy:coolify`
 *
 * Triggers the Coolify deployment and then waits for it. The waiting is the point: the trigger endpoint
 * answers the moment the request is queued, so a pipeline that stops there goes green while the build is
 * still running — and stays green if the build fails. The probe that runs after this step would then be
 * probing the previous version and passing for the wrong reason.
 */

const COOLIFY_URL = "https://cool.mubi.dev";
const APPLICATION_UUID = "u1j3srpnv5rjvsaxnabu1liu";
const POLL_INTERVAL_MS = 10_000;
const DEPLOY_TIMEOUT_MS = 20 * 60_000;

/** Coolify's terminal states. Anything else means the deployment is still on its way. */
const FINISHED = "finished";
const FAILED_STATES = ["failed", "cancelled-by-user", "error"];

type Trigger = { deployments?: Array<{ deployment_uuid?: string }>; deployment_uuid?: string };
/** The deployment record embeds the whole application, which carries a `status` of its own. */
type Deployment = { status?: string };

async function main() {
  const token = process.env.COOLIFY_API_TOKEN?.trim();
  if (!token) throw new Error("COOLIFY_API_TOKEN is required");

  // POST, not GET: Coolify answers a GET here with 405, which is how this step spent several releases
  // failing while the application kept updating through Coolify's own git webhook — the pipeline was red
  // and the site was current, so nobody read the red as real.
  const trigger = await coolify<Trigger>(token, `/api/v1/deploy?uuid=${APPLICATION_UUID}&force=false`, "POST");
  const deploymentUuid = trigger.deployments?.[0]?.deployment_uuid ?? trigger.deployment_uuid;
  if (!deploymentUuid) {
    // The deployment was accepted — we just cannot follow it. Say so plainly rather than fail the release:
    // the probe that runs next is what actually decides whether the release is good.
    process.stdout.write("deployment queued, but Coolify returned no deployment_uuid — skipping the wait\n");
    return;
  }
  process.stdout.write(`deployment ${deploymentUuid} queued\n`);

  const deadline = Date.now() + DEPLOY_TIMEOUT_MS;
  let lastStatus = "";
  for (;;) {
    // Read the deployment's own status, not the nested application's: the application is "running:healthy"
    // throughout, because the old container keeps serving until the new one is ready.
    const { status = "unknown" } = await coolify<Deployment>(token, `/api/v1/deployments/${deploymentUuid}`);
    if (status !== lastStatus) {
      process.stdout.write(`deployment ${deploymentUuid}: ${status}\n`);
      lastStatus = status;
    }
    if (status === FINISHED) return;
    if (FAILED_STATES.includes(status)) throw new Error(`deployment ${deploymentUuid} ended as ${status}`);
    if (Date.now() >= deadline) throw new Error(`deployment ${deploymentUuid} still ${status} after 20 minutes`);
    await sleep(POLL_INTERVAL_MS);
  }
}

/** The token travels in a header and is never echoed: an error here is read off a screen or out of a log. */
async function coolify<T>(token: string, path: string, method: "GET" | "POST" = "GET"): Promise<T> {
  const response = await fetch(`${COOLIFY_URL}${path}`, { method, headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Coolify answered HTTP ${response.status} for ${path}`);
  return await response.json() as T;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Coolify deployment failed"}\n`);
  process.exitCode = 1;
});
