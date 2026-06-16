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

module.exports = db;
