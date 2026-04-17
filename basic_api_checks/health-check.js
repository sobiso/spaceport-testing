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
import { htmlSummary } from "../helpers/html-summary.js";

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

export function handleSummary(data) {
  return htmlSummary(data, {
    title: "basic_api_checks - health-check",
    heading: "health-check",
    defaultPath: "/tmp/k6-sandbox-health-check.html",
    maxWidth: "720px",
    metadata: [
      ["GET", url],
      ["POST", authUrl],
    ],
  });
}
