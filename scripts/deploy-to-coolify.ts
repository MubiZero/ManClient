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

async function main() {
  const token = process.env.COOLIFY_API_TOKEN?.trim();
  if (!token) throw new Error("COOLIFY_API_TOKEN is required");

  const trigger = await coolify(token, `/api/v1/deploy?uuid=${APPLICATION_UUID}&force=false`);
  const deploymentUuid = /"deployment_uuid"\s*:\s*"([^"]+)"/.exec(trigger)?.[1];
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
    const body = await coolify(token, `/api/v1/deployments/${deploymentUuid}`);
    const status = /"status"\s*:\s*"([^"]+)"/.exec(body)?.[1] ?? "unknown";
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

/** The token travels in a header and is never echoed: an error here is read from a public CI log. */
async function coolify(token: string, path: string) {
  const response = await fetch(`${COOLIFY_URL}${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Coolify answered HTTP ${response.status} for ${path}`);
  return response.text();
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Coolify deployment failed"}\n`);
  process.exitCode = 1;
});
