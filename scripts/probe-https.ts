import { connect } from "node:tls";

import { formatProbeReport, probeDeployment } from "@/core/observability/https-probe";

/**
 * `pnpm probe:https [--url https://host] [--wait 300]`
 *
 * Run after a deploy: it fails loudly if the released instance is not reachable over a valid HTTPS or is
 * missing the secrets its webhooks need. `--wait` retries while a container is still coming up.
 *
 * Caveat worth knowing before trusting the certificate line: inside an environment that terminates TLS
 * for you (a corporate proxy, a sandbox egress gateway) the certificate reported is the proxy's, not the
 * one the outside world sees. Run the probe from an ordinary network.
 */
async function main() {
  const url = argValue("--url") ?? process.env.APP_URL;
  if (!url) throw new Error("pass --url or set APP_URL");
  const waitSeconds = Number(argValue("--wait") ?? 0);
  const deadline = Date.now() + waitSeconds * 1000;

  for (;;) {
    const checks = await probeDeployment(url, { fetch, peerCertificate, now: () => new Date() });
    const failed = checks.filter(check => !check.ok);
    if (failed.length === 0 || Date.now() >= deadline) {
      process.stdout.write(formatProbeReport(checks));
      if (failed.length > 0) throw new Error(`${failed.length} check(s) failed: ${failed.map(check => check.name).join(", ")}`);
      return;
    }
    process.stdout.write(`waiting for ${failed.map(check => check.name).join(", ")}…\n`);
    await sleep(10_000);
  }
}

/**
 * Node's fetch does not expose the peer certificate, so the handshake is made once on its own. The socket
 * is closed as soon as the certificate is in hand — nothing is sent over it.
 */
function peerCertificate(host: string, port: number): Promise<{ validTo: Date; host: string }> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port, servername: host, timeout: 15_000 }, () => {
      const certificate = socket.getPeerCertificate();
      socket.end();
      if (!certificate?.valid_to) {
        reject(new Error("no certificate presented"));
        return;
      }
      resolve({ validTo: new Date(certificate.valid_to), host: certificate.subject?.CN ?? host });
    });
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("timed out"));
    });
    socket.on("error", reject);
  });
}

function argValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "HTTPS probe failed"}\n`);
  process.exitCode = 1;
});
