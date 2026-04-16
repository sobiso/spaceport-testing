/**
 * basic_api_checks: GET /healthz + POST /v1/auth (same host as the client API).
 *
 * Spaceport sets on the k6 Job:
 *   K6_NAMESPACE            — sandbox namespace (e.g. sbx-stellar-probe)
 *   K6_PUBLIC_DOMAIN_SUFFIX — e.g. dev.apps-clowd9.io (SANDBOX_ROUTING_PUBLIC_DOMAIN_SUFFIX)
 *
 * Default URL matches Istio/Ingress routing in ops-tools-spaceport (external-client, hostPrefix "api"):
 *   https://api-{namespace}.{K6_PUBLIC_DOMAIN_SUFFIX}/healthz
 *
 * UAT fixed host (no namespace in hostname), e.g.:
 *   K6_CLIENT_API_HEALTH_URL=https://client.api.uat.apps-clowd9.io/healthz
 *
 * Optional: K6_AUTH_POST_BODY — JSON body for POST /v1/auth (default "{}").
 *
 * HTML summary: K6_SUMMARY_HTML (Spaceport: k6 run -e K6_SUMMARY_HTML=/tmp/k6-sandbox-<script>.html)
 * because the cloned repo in the pod is often read-only — summary must be written under /tmp.
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
  return `https://api-${namespace}.${domainSuffix}/healthz`;
}

/** API origin without /healthz — used for /v1/auth etc. */
function baseApiUrl() {
  var h = healthUrl();
  var suf = "/healthz";
  if (h.length >= suf.length && h.substring(h.length - suf.length) === suf) {
    return h.slice(0, -suf.length);
  }
  return h.replace(/\/healthz\/?$/i, "");
}

const url = healthUrl();
const authUrl = baseApiUrl() + "/v1/auth";
const authBody = (__ENV.K6_AUTH_POST_BODY || "{}").trim();

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
  const resHealth = http.get(url, {
    timeout: "30s",
    tags: { name: "client_healthz" },
  });
  check(resHealth, {
    "healthz status 200": (r) => r.status === 200,
  });

  const resAuth = http.post(authUrl, authBody, {
    timeout: "30s",
    headers: { "Content-Type": "application/json" },
    tags: { name: "client_auth_v1" },
  });
  // Expected status depends on the environment (e.g. 401 without valid credentials); must not be a 5xx server error.
  check(resAuth, {
    "POST /v1/auth — no server error (status < 500)": (r) =>
      r.status >= 200 && r.status < 500,
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
  const finishedAt = new Date().toISOString();
  const checks = [];
  collectChecks(data.root_group, checks);

  var headerRows =
    "<tr><th>Test name</th><th>Result</th><th>Run at (UTC)</th></tr>";
  var bodyRows = checks
    .map(function (c) {
      var name = c.name || c.path || "(check)";
      var pass = false;
      if (typeof c.passes === "number" && typeof c.fails === "number") {
        if (c.fails > 0) {
          pass = false;
        } else if (c.passes > 0) {
          pass = true;
        }
      }
      var result = pass ? "OK" : "FAILED";
      var resultClass = pass ? "ok" : "fail";
      return (
        "<tr>" +
        '<td class="name">' +
        escapeHtml(name) +
        "</td>" +
        '<td class="' +
        resultClass +
        '">' +
        escapeHtml(result) +
        "</td>" +
        '<td class="time">' +
        escapeHtml(finishedAt) +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  if (checks.length === 0) {
    bodyRows =
      '<tr><td colspan="3" class="muted">No check entries (root_group).</td></tr>';
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>basic_api_checks — health-check</title>
  <style>
    body { font-family: system-ui, Segoe UI, Roboto, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 1.5rem; line-height: 1.45; }
    h1 { font-size: 1.1rem; color: #34d399; margin: 0 0 0.75rem; }
    .meta { color: #94a3b8; font-size: 0.8rem; margin-bottom: 1rem; word-break: break-all; }
    table { border-collapse: collapse; width: 100%; max-width: 720px; }
    th, td { border: 1px solid #334155; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #1e293b; color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
    td.name { font-family: ui-monospace, monospace; font-size: 0.85rem; }
    td.ok { color: #4ade80; font-weight: 600; }
    td.fail { color: #f87171; font-weight: 600; }
    td.time { font-family: ui-monospace, monospace; font-size: 0.8rem; color: #cbd5e1; }
    td.muted { color: #64748b; font-style: italic; }
  </style>
</head>
<body>
  <h1>health-check</h1>
  <p class="meta">GET: ${escapeHtml(url)}<br/>POST: ${escapeHtml(
    authUrl
  )}</p>
  <table>
    <thead>${headerRows}</thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;

  var summaryPath = (__ENV.K6_SUMMARY_HTML || "").trim();
  if (!summaryPath) {
    summaryPath = "/tmp/k6-sandbox-health-check.html";
  }
  var out = {};
  out[summaryPath] = html;
  return out;
}

function collectChecks(group, acc) {
  if (!group) {
    return;
  }
  var list = group.checks;
  if (list && list.length) {
    for (var i = 0; i < list.length; i++) {
      acc.push(list[i]);
    }
  }
  var nested = group.groups;
  if (nested && nested.length) {
    for (var j = 0; j < nested.length; j++) {
      collectChecks(nested[j], acc);
    }
  }
}
