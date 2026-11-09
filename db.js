const Database = require('better-sqlite3');

const db = new Database('bromart.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_kk TEXT,
    name_ru TEXT,
    name_en TEXT,
    marketplace_id INTEGER,
    institution_ids TEXT,
    parent_id INTEGER,
    sort_order INTEGER,
    prod_id INTEGER,
    image_name TEXT,
    image_data BLOB,
    image_mime TEXT,
    sent INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_kk TEXT,
    name_ru TEXT,
    name_en TEXT,
    description_kk TEXT,
    description_ru TEXT,
    description_en TEXT,
    marketplace_id INTEGER,
    category_id INTEGER,
    institution_ids TEXT,
    price REAL,
    sku TEXT,
    stock_quantity REAL,
    product_type_id INTEGER,
    uom_id INTEGER,
    weight_per_unit REAL,
    purchase_limit REAL,
    purchase_limit_id INTEGER,
    image_name TEXT,
    image_data BLOB,
    image_mime TEXT,
    sent INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS purchase_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_kk TEXT,
    name_ru TEXT,
    name_en TEXT,
    marketplace_id INTEGER,
    limit_value REAL,
    limit_uom_id INTEGER,
    prod_id INTEGER,
    sent INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS faq_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_ru TEXT,
    name_kk TEXT,
    name_en TEXT,
    sort_order INTEGER,
    prod_id INTEGER,
    sent INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS faq_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    title_ru TEXT,
    title_kk TEXT,
    title_en TEXT,
    body_ru TEXT,
    body_kk TEXT,
    body_en TEXT,
    is_global INTEGER,
    institution_ids TEXT,
    sort_order INTEGER,
    prod_id INTEGER,
    sent INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    value TEXT,
    label_ru TEXT,
    label_kk TEXT,
    label_en TEXT,
    is_active INTEGER,
    is_global INTEGER,
    institution_ids TEXT,
    sort_order INTEGER,
    prod_id INTEGER,
    sent INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// миграции для старых баз (если колонок ещё нет)
const migrations = [
  'ALTER TABLE categories ADD COLUMN prod_id INTEGER',
  'ALTER TABLE products ADD COLUMN description_kk TEXT',
  'ALTER TABLE products ADD COLUMN description_ru TEXT',
  'ALTER TABLE products ADD COLUMN description_en TEXT',
  'ALTER TABLE products ADD COLUMN purchase_limit REAL',
  'ALTER TABLE products ADD COLUMN purchase_limit_id INTEGER',
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (e) {}
}

// prod_id у товаров — чтобы повторная отправка шла PATCH-ем, а не создавала дубликат.
// image_synced — картинка уже на проде; при PATCH её не перезаливаем, пока не загрузят новую.
const syncMigrations = [
  ['ALTER TABLE products ADD COLUMN prod_id INTEGER', null],
  ['ALTER TABLE categories ADD COLUMN image_synced INTEGER DEFAULT 0',
    'UPDATE categories SET image_synced = 1 WHERE prod_id IS NOT NULL'],
  ['ALTER TABLE products ADD COLUMN image_synced INTEGER DEFAULT 0',
    'UPDATE products SET image_synced = 1 WHERE prod_id IS NOT NULL'],
];
for (const [alter, backfill] of syncMigrations) {
  try {
    db.exec(alter);
    if (backfill) db.exec(backfill); // только в момент добавления колонки
  } catch (e) {}
}

module.exports = db;
