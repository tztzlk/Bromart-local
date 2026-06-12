const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const Database = require('better-sqlite3');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const db = new Database('bromart.db');

const PORT = 6767;
const BROMART_URL = 'http://192.168.2.31:8000';

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
    marketplace_id INTEGER,
    category_id INTEGER,
    institution_ids TEXT,
    price REAL,
    sku TEXT,
    stock_quantity REAL,
    product_type_id INTEGER,
    uom_id INTEGER,
    weight_per_unit REAL,
    image_name TEXT,
    image_data BLOB,
    image_mime TEXT,
    sent INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

try { db.exec('ALTER TABLE categories ADD COLUMN prod_id INTEGER'); } catch (e) {}

app.use(express.json());
app.use(express.static('public'));

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(key, value, value);
}

function delSetting(key) {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

function getToken() {
  return getSetting('token');
}

function getCreds() {
  const user_name = getSetting('cred_user');
  const password = getSetting('cred_pass');
  if (!user_name || !password) return null;
  return { user_name, password };
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: 'Bearer ' + token } : {};
}

function tokenExp(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.exp ? payload.exp * 1000 : null;
  } catch (e) {
    return null;
  }
}

function isTokenValid() {
  const token = getToken();
  if (!token) return false;
  const exp = tokenExp(token);
  if (!exp) return true;
  return Date.now() < exp - 30000;
}

async function doLogin(user_name, password) {
  const resp = await axios.post(BROMART_URL + '/api/v1/admin/auth/login', { user_name, password });
  const d = resp.data;
  const token = d.access_token || d.token || (d.data && (d.data.access_token || d.data.token));
  if (!token) {
    const e = new Error('Токен не найден в ответе прода');
    e.loginData = resp.data;
    throw e;
  }
  setSetting('token', token);
  return token;
}

async function ensureToken() {
  if (isTokenValid()) return;
  const creds = getCreds();
  if (!creds) throw new Error('Нет токена и сохранённого логина. Войди в систему.');
  console.log('Токен истёк  авторизуюсь заново');
  await doLogin(creds.user_name, creds.password);
}

app.post('/login', async (req, res) => {
  const { user_name, password } = req.body;
  try {
    await doLogin(user_name, password);
    setSetting('cred_user', user_name);
    setSetting('cred_pass', password);
    res.json({ success: true, message: 'Авторизация успешна' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, detail: err.loginData || (err.response && err.response.data) });
  }
}); 

app.post('/set-token', (req, res) => {
  let token = req.body.token;
  if (!token || !token.trim()) {
    return res.status(400).json({ success: false, message: 'Токен пустой' });
  }
  token = token.trim().replace(/^Bearer\s+/i, '');
  setSetting('token', token);
  res.json({ success: true, message: 'Токен сохранён' });
});

app.post('/logout', (req, res) => {
  delSetting('token');
  delSetting('cred_user');
  delSetting('cred_pass');
  res.json({ success: true, message: 'Токен удалён' });
});

app.get('/auth-status', (req, res) => {
  const token = getToken();
  res.json({
    authorized: !!token,
    valid: isTokenValid(),
    auto_refresh: !!getCreds(),
    preview: token ? token.slice(0, 6) + '...' + token.slice(-4) : null,
  });
});

app.post('/save-category', upload.single('image'), (req, res) => {
  try {
    const b = req.body;
    db.prepare(`
      INSERT INTO categories (name_kk, name_ru, name_en, marketplace_id, institution_ids, parent_id, sort_order, image_name, image_data, image_mime)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      b.name_kk, b.name_ru, b.name_en, b.marketplace_id, b.institution_ids,
      b.parent_id || null, b.sort_order || null,
      req.file ? req.file.originalname : null,
      req.file ? req.file.buffer : null,
      req.file ? req.file.mimetype : null
    );
    res.json({ success: true, message: 'Категория сохранена локально' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/save-product', upload.single('image'), (req, res) => {
  try {
    const b = req.body;
    db.prepare(`
      INSERT INTO products (name_kk, name_ru, name_en, marketplace_id, category_id, institution_ids, price, sku, stock_quantity, product_type_id, uom_id, weight_per_unit, image_name, image_data, image_mime)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      b.name_kk, b.name_ru, b.name_en, b.marketplace_id, b.category_id, b.institution_ids,
      b.price, b.sku, b.stock_quantity, b.product_type_id, b.uom_id, b.weight_per_unit || null,
      req.file ? req.file.originalname : null,
      req.file ? req.file.buffer : null,
      req.file ? req.file.mimetype : null
    );
    res.json({ success: true, message: 'Товар сохранён локально' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/update-category/:id', upload.single('image'), (req, res) => {
  try {
    const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(req.params.id);
    if (!cat) return res.status(404).json({ success: false, message: 'Категория не найдена' });
    const b = req.body;
    if (req.file) {
      db.prepare(`
        UPDATE categories SET name_kk=?, name_ru=?, name_en=?, marketplace_id=?, institution_ids=?, parent_id=?, sort_order=?, image_name=?, image_data=?, image_mime=?, sent=0 WHERE id=?
      `).run(b.name_kk, b.name_ru, b.name_en, b.marketplace_id, b.institution_ids, b.parent_id || null, b.sort_order || null, req.file.originalname, req.file.buffer, req.file.mimetype, req.params.id);
    } else {
      db.prepare(`
        UPDATE categories SET name_kk=?, name_ru=?, name_en=?, marketplace_id=?, institution_ids=?, parent_id=?, sort_order=?, sent=0 WHERE id=?
      `).run(b.name_kk, b.name_ru, b.name_en, b.marketplace_id, b.institution_ids, b.parent_id || null, b.sort_order || null, req.params.id);
    }
    res.json({ success: true, message: 'Категория обновлена' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/update-product/:id', upload.single('image'), (req, res) => {
  try {
    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Товар не найден' });
    const b = req.body;
    if (req.file) {
      db.prepare(`
        UPDATE products SET name_kk=?, name_ru=?, name_en=?, marketplace_id=?, category_id=?, institution_ids=?, price=?, sku=?, stock_quantity=?, product_type_id=?, uom_id=?, weight_per_unit=?, image_name=?, image_data=?, image_mime=?, sent=0 WHERE id=?
      `).run(b.name_kk, b.name_ru, b.name_en, b.marketplace_id, b.category_id, b.institution_ids, b.price, b.sku, b.stock_quantity, b.product_type_id, b.uom_id, b.weight_per_unit || null, req.file.originalname, req.file.buffer, req.file.mimetype, req.params.id);
    } else {
      db.prepare(`
        UPDATE products SET name_kk=?, name_ru=?, name_en=?, marketplace_id=?, category_id=?, institution_ids=?, price=?, sku=?, stock_quantity=?, product_type_id=?, uom_id=?, weight_per_unit=?, sent=0 WHERE id=?
      `).run(b.name_kk, b.name_ru, b.name_en, b.marketplace_id, b.category_id, b.institution_ids, b.price, b.sku, b.stock_quantity, b.product_type_id, b.uom_id, b.weight_per_unit || null, req.params.id);
    }
    res.json({ success: true, message: 'Товар обновлён' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/categories', (req, res) => {
  const categories = db.prepare('SELECT id, name_kk, name_ru, name_en, marketplace_id, institution_ids, parent_id, sort_order, image_name, image_mime, sent, prod_id FROM categories ORDER BY id').all();
  res.json(categories);
});

app.get('/products', (req, res) => {
  const products = db.prepare('SELECT id, name_kk, name_ru, name_en, marketplace_id, category_id, institution_ids, price, sku, stock_quantity, product_type_id, uom_id, weight_per_unit, image_name, image_mime, sent FROM products ORDER BY id').all();
  res.json(products);
});

app.get('/category-image/:id', (req, res) => {
  const row = db.prepare('SELECT image_data, image_mime FROM categories WHERE id = ?').get(req.params.id);
  if (!row || !row.image_data) return res.status(404).send('нет картинки');
  res.set('Content-Type', row.image_mime);
  res.send(row.image_data);
});

app.get('/product-image/:id', (req, res) => {
  const row = db.prepare('SELECT image_data, image_mime FROM products WHERE id = ?').get(req.params.id);
  if (!row || !row.image_data) return res.status(404).send('нет картинки');
  res.set('Content-Type', row.image_mime);
  res.send(row.image_data);
});

function appendInstitutionIds(form, raw) {
  const ids = String(raw || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const id of ids) form.append('institution_ids[]', id);
}

function buildCategoryForm(cat) {
  const form = new FormData();
  form.append('name_kk', cat.name_kk || '');
  form.append('name_ru', cat.name_ru || '');
  form.append('name_en', cat.name_en || '');
  form.append('marketplace_id', cat.marketplace_id);
  appendInstitutionIds(form, cat.institution_ids);
  if (cat.parent_id) {
    const parent = db.prepare('SELECT prod_id FROM categories WHERE id = ?').get(cat.parent_id);
    form.append('parent_id', parent && parent.prod_id ? parent.prod_id : cat.parent_id);
  }
  if (cat.sort_order) form.append('sort_order', cat.sort_order);
  if (cat.image_data) {
    form.append('image', Buffer.from(cat.image_data), { filename: cat.image_name, contentType: cat.image_mime });
  }
  return form;
}

function buildProductForm(p) {
  const form = new FormData();
  form.append('name_kk', p.name_kk || '');
  form.append('name_ru', p.name_ru || '');
  form.append('name_en', p.name_en || '');
  form.append('marketplace_id', p.marketplace_id);
  const cat = db.prepare('SELECT prod_id FROM categories WHERE id = ?').get(p.category_id);
  form.append('category_id', cat && cat.prod_id ? cat.prod_id : p.category_id);
  appendInstitutionIds(form, p.institution_ids);
  form.append('price', p.price);
  form.append('sku', p.sku || '');
  form.append('stock_quantity', p.stock_quantity);
  form.append('product_type_id', p.product_type_id);
  form.append('uom_id', p.uom_id);
  if (p.weight_per_unit != null && p.weight_per_unit !== '') form.append('weight_per_unit', p.weight_per_unit);
  if (p.image_data) {
    form.append('image', Buffer.from(p.image_data), { filename: p.image_name, contentType: p.image_mime });
  }
  return form;
}

async function sendCategory(cat) {
  await ensureToken();
  const form = buildCategoryForm(cat);
  const resp = await axios.post(BROMART_URL + '/api/v1/admin/categories', form, { headers: { ...form.getHeaders(), ...authHeaders() } });
  console.log('Ответ прода на категорию:', JSON.stringify(resp.data));
  const d = resp.data;
  const prodId = (d && d.data && d.data.id) || (d && d.id) || null;
  db.prepare('UPDATE categories SET sent = 1, prod_id = ? WHERE id = ?').run(prodId, cat.id);
}

async function sendProduct(p) {
  await ensureToken();
  const form = buildProductForm(p);
  await axios.post(BROMART_URL + '/api/v1/admin/products', form, { headers: { ...form.getHeaders(), ...authHeaders() } });
  db.prepare('UPDATE products SET sent = 1 WHERE id = ?').run(p.id);
}

app.post('/send-category/:id', async (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ success: false, message: 'Категория не найдена' });
  try {
    await sendCategory(cat);
    res.json({ success: true, message: 'Категория отправлена на прод' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, detail: err.response && err.response.data });
  }
});

app.post('/send-product/:id', async (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ success: false, message: 'Товар не найден' });
  try {
    await sendProduct(p);
    res.json({ success: true, message: 'Товар отправлен на прод' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, detail: err.response && err.response.data });
  }
});

app.post('/send-all-categories', async (req, res) => {
  const categories = db.prepare('SELECT * FROM categories WHERE sent = 0 ORDER BY (parent_id IS NOT NULL), id').all();
  const results = [];
  for (const cat of categories) {
    try {
      await sendCategory(cat);
      results.push({ id: cat.id, success: true });
    } catch (err) {
      results.push({ id: cat.id, success: false, error: err.message });
    }
  }
  res.json({ success: true, results });
});

app.post('/send-all-products', async (req, res) => {
  const products = db.prepare('SELECT * FROM products WHERE sent = 0').all();
  const results = [];
  for (const p of products) {
    try {
      await sendProduct(p);
      results.push({ id: p.id, success: true });
    } catch (err) {
      results.push({ id: p.id, success: false, error: err.message });
    }
  } 
  res.json({ success: true, results });
});

app.post('/delete-category/:id', (req, res) => {
  const info = db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ success: false, message: 'Категория не найдена' });
  res.json({ success: true, message: 'Категория удалена' });
});

app.post('/delete-product/:id', (req, res) => {
  const info = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ success: false, message: 'Товар не найден' });
  res.json({ success: true, message: 'Товар удалён' });
});

app.post('/reset-categories', (req, res) => {
  const info = db.prepare('UPDATE categories SET sent = 0').run();
  res.json({ success: true, message: 'Сброшено категорий: ' + info.changes });
});

app.post('/reset-products', (req, res) => {
  const info = db.prepare('UPDATE products SET sent = 0').run();
  res.json({ success: true, message: 'Сброшено товаров: ' + info.changes });
});

app.listen(PORT, () => {
  console.log('Сервер запущен: http://localhost:' + PORT);
});
