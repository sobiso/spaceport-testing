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
    INSERT INTO public.products (
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
      '72fef714-f4c7-40b9-a23b-9c9d5b0f0e9c'::uuid, '2025-01-09 13:54:42.379253+00', NULL, 'visa', false, false, '221', false, 'visa-test', true, '35704535', 'VisaNewDominikOffLedger', 'YYMM', '', '118ae756-2d55-4154-bb01-e48da4577bd0'::uuid, '0d04132d-f167-4cc7-b56c-728f255920d0'::uuid, '12664', 'month', 0, 'plain', '', 'GBR', '978', '', '', 6, true
    );
    `
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
