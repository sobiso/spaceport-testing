/**
 * basic_api_checks: GET /healthz + POST /v1/auth (ten sam host co API klienta).
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
 * Opcjonalnie: K6_AUTH_POST_BODY — JSON body dla POST /v1/auth (domyślnie "{}").
 *
 * HTML summary: ścieżka z env K6_SUMMARY_HTML (ustawiana przez Spaceport, zwykle /tmp/k6-sandbox-<skrypt>.html),
 * bo katalog repozytorium w podzie może być tylko do odczytu.
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

/** Bazowy origin API (bez /healthz) — pod /v1/auth itd. */
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
  // Oczekiwany kod zależy od środowiska (np. 401 bez poprawnych danych) — brak błędu serwera 5xx.
  check(resAuth, {
    "POST /v1/auth — brak błędu serwera (status < 500)": (r) =>
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
    "<tr><th>Nazwa testu</th><th>Wynik</th><th>Wykonano (UTC)</th></tr>";
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
      var wynik = pass ? "OK" : "FAILED";
      var wynikClass = pass ? "ok" : "fail";
      return (
        "<tr>" +
        '<td class="name">' +
        escapeHtml(name) +
        "</td>" +
        '<td class="' +
        wynikClass +
        '">' +
        escapeHtml(wynik) +
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
      '<tr><td colspan="3" class="muted">Brak wpisów checków (root_group).</td></tr>';
  }

  const html = `<!DOCTYPE html>
<html lang="pl">
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
