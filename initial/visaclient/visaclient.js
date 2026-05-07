import sql from "k6/x/sql";
import driver from "k6/x/sql/driver/postgres";
import { check } from "k6";
import { htmlSummary } from "../../helpers/html-summary.js";

const namespace = __ENV.K6_NAMESPACE;
// Must match ops-tools-shipyard ServiceDatabaseName("module-exa") → module_exa (not "module-exa").
const dbName = __ENV.K6_DB_NAME || "module_visa_client";
const dbDsn =
  __ENV.K6_DB_DSN ||
  `postgres://postgres:postgres@postgres.${namespace}.svc.cluster.local:5432/${dbName}?sslmode=disable`;
const db = sql.open(driver, dbDsn);
const insertConnectionsSQL = open("./insert_connections.sql");

const seedEndpointID = "9e12d005-b376-4a2e-a5b8-b0510ba72dae";

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  const upsertConnections = db.exec(insertConnectionsSQL);

  const connectionsRows = db.query(
    `SELECT id, created_at, updated_at, "name", status, auto_connect, auto_sign_on, sub_prefix
     FROM connections WHERE name = 'tech'`,
    seedConnectionName
  );
  const connection = connectionsRows.length > 0 ? connectionsRows[0] : null;

  check(
    {
      upsertConnections,
      connection,
    },
    {
      "connections insert touched rows": (v) => v.upsertConnections.rowsAffected() >= 1,
      "connections row exists": (v) => v.connection !== null,
      "connections row has expected name": (v) =>
        v.connection && v.connection.name === "tech",
    }
  );

  console.log(
    `seed done in namespace=${namespace}, db=${dbName}, endpoints=${upsertEndpoint.rowsAffected()}`
  );
}

export function handleSummary(data) {
  return htmlSummary(data, {
    title: "initial - visa client seed",
    heading: "visa client",
    defaultPath: "/tmp/k6-sandbox-visa-client.html",
    metadata: [
      ["Namespace", namespace],
      ["Database", dbName],
    ],
  });
}

export function teardown() {
  db.close();
}
