/**
 * basic_authorizations: publish a VISA ISO message to NATS (same idea as basic_api_checks/health-check.js:
 * one-shot scenario, HTML summary table, K6_SUMMARY_HTML via Spaceport).
 *
 * Vanilla grafana/k6 has no NATS/TCP client. This script uses the NATS text protocol over WebSocket
 * (enable `websocket { ... }` on nats-server, or use a WS port your platform exposes).
 *
 * Env:
 *   K6_NATS_WS_URL — required in-cluster, e.g. ws://nats.messaging.svc.cluster.local:8080
 *   K6_NATS_SUBJECT    — default VISA.message.in
 *   K6_NATS_USER       — optional BASIC user
 *   K6_NATS_PASSWORD   — optional
 *   K6_NATS_TOKEN      — optional auth token (CONNECT auth_token)
 *   K6_NATS_PAYLOAD    — optional full JSON string (overrides bundled visa_message_in.payload.json)
 *
 * Local TCP (nats pub -s nats://127.0.0.1:5222 ...) is not the same URL as WebSocket; set
 * K6_NATS_WS_URL to your NATS WebSocket listener (often a different port than 5222/4222).
 */
import ws from "k6/ws";
import { check } from "k6";
import { htmlSummary } from "../helpers/html-summary.js";

const natsWsUrl = (__ENV.K6_NATS_WS_URL || "").trim();
const natsSubject = (__ENV.K6_NATS_SUBJECT || "VISA.message.in").trim();

const payloadFromFile = open("./visa_message_in.payload.json");
const payload = (__ENV.K6_NATS_PAYLOAD || "").trim() || String(payloadFromFile).trim();

export const options = {
  scenarios: {
    visa_nats_once: {
      executor: "shared-iterations",
      vus: 1,
      iterations: 1,
    },
  },
};

function utf8ByteLength(s) {
  var n = 0;
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 0x80) {
      n += 1;
    } else if (c < 0x800) {
      n += 2;
    } else if (c < 0xd800 || c >= 0xe000) {
      n += 3;
    } else {
      i += 1;
      n += 4;
    }
  }
  return n;
}

function connectOptions() {
  var o = {
    verbose: false,
    pedantic: false,
    name: "k6-visa-nats-pub",
    protocol: 1,
    lang: "k6",
    version: "0.49",
  };
  var u = (__ENV.K6_NATS_USER || "").trim();
  var p = (__ENV.K6_NATS_PASSWORD || "").trim();
  var t = (__ENV.K6_NATS_TOKEN || "").trim();
  if (u) {
    o.user = u;
  }
  if (p) {
    o.pass = p;
  }
  if (t) {
    o.auth_token = t;
  }
  return o;
}

export default function () {
  var state = { info: false, pub: false, err: "", wsStatus: 0 };

  if (!natsWsUrl) {
    check(null, {
      "K6_NATS_WS_URL is set": () => false,
    });
    return;
  }

  var res = ws.connect(
    natsWsUrl,
    { tags: { name: "nats_ws" } },
    function (socket) {
      socket.on("message", function (message) {
        var text = String(message);
        if (text.indexOf("PING") === 0) {
          socket.send("PONG\r\n");
          return;
        }
        if (text.indexOf("-ERR") === 0) {
          state.err = text.trim();
          socket.close();
          return;
        }
        if (!state.info && text.indexOf("INFO ") === 0) {
          state.info = true;
          socket.send("CONNECT " + JSON.stringify(connectOptions()) + "\r\n");
          var blen = utf8ByteLength(payload);
          socket.send("PUB " + natsSubject + " " + blen + "\r\n" + payload + "\r\n");
          state.pub = true;
          socket.close();
        }
      });

      socket.setTimeout(function () {
        if (!state.pub) {
          state.err = state.err || "timeout waiting for NATS INFO / PUB";
        }
        socket.close();
      }, 15000);
    }
  );

  state.wsStatus = res && res.status ? res.status : 0;
  check(res, { "WebSocket status 101": (r) => r && r.status === 101 });
  check(state, { "NATS INFO received": (s) => s.info });
  check(state, { "NATS PUB completed": (s) => s.pub && !s.err });
}

export function handleSummary(data) {
  return htmlSummary(data, {
    title: "basic_authorizations - visa NATS publish",
    heading: "visa_nats_pub",
    defaultPath: "/tmp/k6-sandbox-visa_nats_pub.html",
    metadata: [
      ["WebSocket", natsWsUrl],
      ["Subject", natsSubject],
      [
        "Payload",
        (__ENV.K6_NATS_PAYLOAD || "").trim()
          ? "K6_NATS_PAYLOAD (env)"
          : "visa_message_in.payload.json",
      ],
    ],
  });
}
