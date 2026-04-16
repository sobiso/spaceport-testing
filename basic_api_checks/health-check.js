/**
 * Single GET to external-client HTTP /healthz.
 *
 * Spaceport sets on the k6 Job:
 *   K6_NAMESPACE          — sandbox namespace (e.g. sbx-stellar-probe)
 *   K6_PUBLIC_DOMAIN_SUFFIX — e.g. dev.apps-clowd9.io (SANDBOX_ROUTING_PUBLIC_DOMAIN_SUFFIX)
 *
 * Default URL matches Istio/Ingress routing in ops-tools-spaceport (external-client, hostPrefix "api"):
 *   https://api-{namespace}.{K6_PUBLIC_DOMAIN_SUFFIX}/healthz
 *
 * UAT fixed host (no namespace in hostname), e.g.:
 *   K6_CLIENT_API_HEALTH_URL=https://client.api.uat.apps-clowd9.io/healthz
 *
 * HTML summary is written as health-check-report.html when k6 runs.
 */
import http from "k6/http";
import { check } from "k6";

const namespace = __ENV.K6_NAMESPACE || "default";
const domainSuffix = (__ENV.K6_PUBLIC_DOMAIN_SUFFIX || "uat.apps-clowd9.io").replace(
  /^\.+/,
  ""
);

function healthUrl() {
  const override = (__ENV.K6_CLIENT_API_HEALTH_URL || "").trim();
  if (override) {
    return override.replace(/\/$/, "");
  }
  // Per-namespace public host: api-<namespace>.<suffix> (see deployment_sandbox_routing.go)
  return `https://api-${namespace}.${domainSuffix}/healthz`;
}

const url = healthUrl();

export const options = {
  scenarios: {
    health_once: {
      executor: "shared-iterations",
      vus: 1,
      iterations: 1,
    },
  },
};

export default function () {
  const res = http.get(url, {
    timeout: "30s",
    tags: { name: "client_healthz" },
  });
  check(res, {
    "healthz status 200": (r) => r.status === 200,
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function handleSummary(data) {
  const metrics = data.metrics || {};
  const reqs = metrics.http_reqs;
  const failed = metrics.http_req_failed;
  const duration = metrics.http_req_duration;

  var avgMs = "—";
  if (
    duration &&
    duration.values &&
    typeof duration.values.avg === "number"
  ) {
    avgMs = duration.values.avg.toFixed(2);
  }

  const rows = [
    ["Target URL", url],
    ["K6_NAMESPACE", namespace],
    ["K6_PUBLIC_DOMAIN_SUFFIX", domainSuffix],
    ["HTTP requests (count)", reqs != null ? reqs.values.count : "—"],
    ["HTTP failed (rate)", failed != null ? failed.values.rate : "—"],
    ["Duration (avg ms)", avgMs],
  ];

  const table = rows
    .map(
      ([k, v]) =>
        `<tr><th style="text-align:left;padding:4px 12px 4px 0">${escapeHtml(
          k
        )}</th><td style="font-family:monospace">${escapeHtml(
          String(v)
        )}</td></tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>basic_api_checks — health-check</title>
  <style>
    body { font-family: system-ui, Segoe UI, Roboto, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 1.5rem; line-height: 1.45; }
    h1 { font-size: 1.1rem; color: #34d399; margin: 0 0 1rem; }
    table { border-collapse: collapse; }
    th { color: #94a3b8; font-weight: 600; }
    pre { background: #1e293b; padding: 1rem; border-radius: 8px; overflow: auto; font-size: 0.75rem; }
  </style>
</head>
<body>
  <h1>health-check (k6)</h1>
  <table>${table}</table>
  <h2 style="margin-top:1.25rem;font-size:0.95rem;color:#94a3b8">Raw metrics (JSON)</h2>
  <pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>
</body>
</html>`;

  return {
    "health-check-report.html": html,
  };
}
