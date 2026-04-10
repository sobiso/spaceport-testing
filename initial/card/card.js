import sql from "k6/x/sql";
import driver from "k6/x/sql/driver/postgres";
import { check } from "k6";

const namespace = __ENV.K6_NAMESPACE || "default";
const dbName = __ENV.K6_DB_NAME || "card";
const dbDsn =
  __ENV.K6_DB_DSN ||
  `postgres://postgres:postgres@postgres.${namespace}.svc.cluster.local:5432/${dbName}?sslmode=disable`;
const db = sql.open(driver, dbDsn);

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  const upsert = db.exec(
    `
    INSERT INTO products (
      id,
      created_at,
      updated_at,
      scheme,
      contactless,
      three_ds,
      service_code,
      use_atc,
      hsm_key_group,
      external_authorization,
      bin,
      program_name,
      scheme_expiry_format,
      internal_status,
      program_id,
      client_id,
      nmi,
      expiry_card_granularity,
      valid_period,
      expiry_return,
      behaviour_name,
      country_issuance_code,
      currency_code,
      min_bin_range,
      max_bin_range,
      bin_range_length,
      is_on_ledger
    ) VALUES (
      $1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, '', $13, $14, $15, $16, $17, $18, NULL, $19, $20, NULL, NULL, $21, $22
    )
    ON CONFLICT (id) DO UPDATE SET
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at,
      scheme = EXCLUDED.scheme,
      contactless = EXCLUDED.contactless,
      three_ds = EXCLUDED.three_ds,
      service_code = EXCLUDED.service_code,
      use_atc = EXCLUDED.use_atc,
      hsm_key_group = EXCLUDED.hsm_key_group,
      external_authorization = EXCLUDED.external_authorization,
      bin = EXCLUDED.bin,
      program_name = EXCLUDED.program_name,
      scheme_expiry_format = EXCLUDED.scheme_expiry_format,
      internal_status = EXCLUDED.internal_status,
      program_id = EXCLUDED.program_id,
      client_id = EXCLUDED.client_id,
      nmi = EXCLUDED.nmi,
      expiry_card_granularity = EXCLUDED.expiry_card_granularity,
      valid_period = EXCLUDED.valid_period,
      expiry_return = EXCLUDED.expiry_return,
      behaviour_name = EXCLUDED.behaviour_name,
      country_issuance_code = EXCLUDED.country_issuance_code,
      currency_code = EXCLUDED.currency_code,
      min_bin_range = EXCLUDED.min_bin_range,
      max_bin_range = EXCLUDED.max_bin_range,
      bin_range_length = EXCLUDED.bin_range_length,
      is_on_ledger = EXCLUDED.is_on_ledger;
    `,
    "72fef714-f4c7-40b9-a23b-9c9d5b0f0e9c",
    "2025-01-09 13:54:42.379253+00",
    "visa",
    false,
    false,
    "221",
    false,
    "visa-test",
    true,
    "35704535",
    "VisaNewDominikOffLedger",
    "YYMM",
    "118ae756-2d55-4154-bb01-e48da4577bd0",
    "0d04132d-f167-4cc7-b56c-728f255920d0",
    "12664",
    "month",
    0,
    "plain",
    "GBR",
    "978",
    6,
    true
  );

  const rows = db.query("SELECT id, scheme, bin, is_on_ledger FROM products WHERE id = $1", "72fef714-f4c7-40b9-a23b-9c9d5b0f0e9c");
  const row = rows.length > 0 ? rows[0] : null;

  check(
    { upsert, row },
    {
      "products upsert touched rows": (v) => v.upsert.rowsAffected() >= 1,
      "products row exists": (v) => v.row !== null,
      "products row has expected id": (v) => v.row && v.row.id === "72fef714-f4c7-40b9-a23b-9c9d5b0f0e9c",
      "products row has expected scheme": (v) => v.row && v.row.scheme === "visa",
      "products row has expected bin": (v) => v.row && v.row.bin === "35704535",
    }
  );

  console.log(`products upsert done in namespace=${namespace}, db=${dbName}, affected=${upsert.rowsAffected()}`);
}

export function teardown() {
  db.close();
}
