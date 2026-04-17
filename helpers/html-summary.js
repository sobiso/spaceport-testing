export function htmlSummary(data, options) {
  var cfg = options || {};
  var finishedAt = new Date().toISOString();
  var checks = [];
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

  var metadata = metadataHtml(cfg.metadata || []);
  var title = cfg.title || cfg.heading || "k6 summary";
  var heading = cfg.heading || title;
  var maxWidth = cfg.maxWidth || "920px";

  var html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, Segoe UI, Roboto, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 1.5rem; line-height: 1.45; }
    h1 { font-size: 1.1rem; color: #34d399; margin: 0 0 0.75rem; }
    .meta { color: #94a3b8; font-size: 0.8rem; margin-bottom: 1rem; word-break: break-all; }
    table { border-collapse: collapse; width: 100%; max-width: ${escapeHtml(maxWidth)}; }
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
  <h1>${escapeHtml(heading)}</h1>
  ${metadata}
  <table>
    <thead>${headerRows}</thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;

  var summaryPath = (__ENV.K6_SUMMARY_HTML || "").trim();
  if (!summaryPath) {
    summaryPath = cfg.defaultPath || "/tmp/k6-summary.html";
  }
  var out = {};
  out[summaryPath] = html;
  return out;
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function metadataHtml(items) {
  if (!items || !items.length) {
    return "";
  }
  var lines = items.map(function (item) {
    if (Array.isArray(item)) {
      return escapeHtml(item[0]) + ": " + escapeHtml(item[1]);
    }
    return escapeHtml(item);
  });
  return '<p class="meta">' + lines.join("<br/>") + "</p>";
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
