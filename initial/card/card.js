import sql from "k6/x/sql";
import driver from "k6/x/sql/driver/postgres";
import { check } from "k6";

const namespace = __ENV.K6_NAMESPACE;
const dbName = "module-card";
const dbDsn =
  __ENV.K6_DB_DSN ||
  `postgres://postgres:postgres@postgres.${namespace}.svc.cluster.local:5432/${dbName}?sslmode=disable`;
const db = sql.open(driver, dbDsn);
const insertProductSQL = open("./insert_product.sql");
const insertCustomerSQL = open("./insert_customer.sql");
const insertCardSQL = open("./insert_card.sql");
const insertCardMetaSQL = open("./insert_card_meta.sql");

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  const upsertProduct = db.exec(insertProductSQL);
  const upsertCustomer = db.exec(insertCustomerSQL);
  const upsertCard = db.exec(insertCardSQL);
  const upsertCardMeta = db.exec(insertCardMetaSQL);

  const productRows = db.query(
    "SELECT id, scheme, bin, is_on_ledger FROM products WHERE id = $1",
    "72fef714-f4c7-40b9-a23b-9c9d5b0f0e9c"
  );
  const product = productRows.length > 0 ? productRows[0] : null;

  const customerRows = db.query(
    "SELECT id, first_name, last_name FROM customers WHERE id = $1",
    "aa2b42bd-0788-444e-ba57-b647f0a29be3"
  );
  const customer = customerRows.length > 0 ? customerRows[0] : null;

  const cardRows = db.query(
    "SELECT id, card_status, customer_id, product_id FROM cards WHERE id = $1",
    "f9ed6e37-56bf-45e4-8f60-31b107a5b972"
  );
  const card = cardRows.length > 0 ? cardRows[0] : null;

  const metaRows = db.query(
    "SELECT card_id, failed_pin_count, atc FROM card_metadata WHERE card_id = $1",
    "f9ed6e37-56bf-45e4-8f60-31b107a5b972"
  );
  const cardMeta = metaRows.length > 0 ? metaRows[0] : null;

  check(
    {
      upsertProduct,
      upsertCustomer,
      upsertCard,
      upsertCardMeta,
      product,
      customer,
      card,
      cardMeta,
    },
    {
      "products upsert touched rows": (v) => v.upsertProduct.rowsAffected() >= 1,
      "customers upsert touched rows": (v) => v.upsertCustomer.rowsAffected() >= 1,
      "cards upsert touched rows": (v) => v.upsertCard.rowsAffected() >= 1,
      "card_metadata upsert touched rows": (v) => v.upsertCardMeta.rowsAffected() >= 1,
      "products row exists": (v) => v.product !== null,
      "products row has expected id": (v) =>
        v.product && v.product.id === "72fef714-f4c7-40b9-a23b-9c9d5b0f0e9c",
      "products row has expected scheme": (v) => v.product && v.product.scheme === "visa",
      "products row has expected bin": (v) => v.product && v.product.bin === "35704535",
      "customers row exists": (v) => v.customer !== null,
      "customers row has expected name": (v) =>
        v.customer &&
        v.customer.first_name === "Dominik" &&
        v.customer.last_name === "Rabazynski",
      "cards row exists": (v) => v.card !== null,
      "cards row links customer and product": (v) =>
        v.card &&
        v.card.customer_id === "aa2b42bd-0788-444e-ba57-b647f0a29be3" &&
        v.card.product_id === "72fef714-f4c7-40b9-a23b-9c9d5b0f0e9c",
      "card_metadata row exists": (v) => v.cardMeta !== null,
      "card_metadata atc matches seed": (v) => v.cardMeta && v.cardMeta.atc === 941,
    }
  );

  console.log(
    `seed done in namespace=${namespace}, db=${dbName}, products=${upsertProduct.rowsAffected()}, customers=${upsertCustomer.rowsAffected()}, cards=${upsertCard.rowsAffected()}, card_metadata=${upsertCardMeta.rowsAffected()}`
  );
}

export function teardown() {
  db.close();
}
