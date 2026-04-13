import sql from "k6/x/sql";
import driver from "k6/x/sql/driver/postgres";
import { check } from "k6";

const namespace = __ENV.K6_NAMESPACE;
// Must match ops-tools-shipyard ServiceDatabaseName("module-exa") → module_exa (not "module-exa").
const dbName = __ENV.K6_DB_NAME || "module_exa";
const dbDsn =
  __ENV.K6_DB_DSN ||
  `postgres://postgres:postgres@postgres.${namespace}.svc.cluster.local:5432/${dbName}?sslmode=disable`;
const db = sql.open(driver, dbDsn);
const insertEndpointSQL = open("./insert_endpoint.sql");

const seedEndpointID = "9e12d005-b376-4a2e-a5b8-b0510ba72dae";

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  const upsertEndpoint = db.exec(insertEndpointSQL);

  const endpointRows = db.query(
    `SELECT id, url, name, client_id, timeout, headers::text, response_codec, retry, endpoint_type
     FROM endpoints WHERE id = $1`,
    seedEndpointID
  );
  const endpoint = endpointRows.length > 0 ? endpointRows[0] : null;

  check(
    {
      upsertEndpoint,
      endpoint,
    },
    {
      "endpoints insert touched rows": (v) => v.upsertEndpoint.rowsAffected() >= 1,
      "endpoints row exists": (v) => v.endpoint !== null,
      "endpoints row has expected id": (v) =>
        v.endpoint && v.endpoint.id === seedEndpointID,
      "endpoints url matches seed": (v) =>
        v.endpoint &&
        v.endpoint.url === "http://localhost:9090/exa/dds/simulator",
      "endpoints name matches seed": (v) => v.endpoint && v.endpoint.name === "general",
      "endpoints client_id matches seed": (v) =>
        v.endpoint &&
        v.endpoint.client_id === "0d04132d-f167-4cc7-b56c-728f255920d0",
      "endpoints timeout matches seed": (v) => v.endpoint && v.endpoint.timeout === 1000,
      "endpoints response_codec matches seed": (v) =>
        v.endpoint && v.endpoint.response_codec === "dds_response",
      "endpoints retry matches seed": (v) => v.endpoint && v.endpoint.retry === 0,
      "endpoints endpoint_type matches seed": (v) =>
        v.endpoint && v.endpoint.endpoint_type === "general",
    }
  );

  console.log(
    `seed done in namespace=${namespace}, db=${dbName}, endpoints=${upsertEndpoint.rowsAffected()}`
  );
}

export function teardown() {
  db.close();
}
