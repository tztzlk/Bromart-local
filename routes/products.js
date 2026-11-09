const express = require('express');
const multer = require('multer');
const router = express.Router();
const db = require('../db');
const { sendProduct, resolveImage, syncMessage } = require('../bromart');
const { fillTranslations } = require('../translate');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/save-product', upload.single('image'), async (req, res) => {
  try {
    const b = req.body;
    await fillTranslations(b, ['name', 'description']);
    const img = await resolveImage(req);
    db.prepare(`
      INSERT INTO products (name_kk, name_ru, name_en, description_kk, description_ru, description_en, marketplace_id, category_id, institution_ids, price, sku, stock_quantity, product_type_id, uom_id, weight_per_unit, purchase_limit_id, image_name, image_data, image_mime)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      b.name_kk, b.name_ru, b.name_en, b.description_kk, b.description_ru, b.description_en,
      b.marketplace_id, b.category_id, b.institution_ids,
      b.price, b.sku, b.stock_quantity, b.product_type_id, b.uom_id, b.weight_per_unit || null, b.purchase_limit_id || null,
      img.name, img.data, img.mime
    );
    res.json({ success: true, message: 'Товар сохранён локально' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/update-product/:id', upload.single('image'), async (req, res) => {
  try {
    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Товар не найден' });
    const b = req.body;
    await fillTranslations(b, ['name', 'description']);
    const img = await resolveImage(req);
    if (img.data) {
      db.prepare(`
        UPDATE products SET name_kk=?, name_ru=?, name_en=?, description_kk=?, description_ru=?, description_en=?, marketplace_id=?, category_id=?, institution_ids=?, price=?, sku=?, stock_quantity=?, product_type_id=?, uom_id=?, weight_per_unit=?, purchase_limit_id=?, image_name=?, image_data=?, image_mime=?, image_synced=0, sent=0 WHERE id=?
      `).run(b.name_kk, b.name_ru, b.name_en, b.description_kk, b.description_ru, b.description_en, b.marketplace_id, b.category_id, b.institution_ids, b.price, b.sku, b.stock_quantity, b.product_type_id, b.uom_id, b.weight_per_unit || null, b.purchase_limit_id || null, img.name, img.data, img.mime, req.params.id);
    } else {
      db.prepare(`
        UPDATE products SET name_kk=?, name_ru=?, name_en=?, description_kk=?, description_ru=?, description_en=?, marketplace_id=?, category_id=?, institution_ids=?, price=?, sku=?, stock_quantity=?, product_type_id=?, uom_id=?, weight_per_unit=?, purchase_limit_id=?, sent=0 WHERE id=?
      `).run(b.name_kk, b.name_ru, b.name_en, b.description_kk, b.description_ru, b.description_en, b.marketplace_id, b.category_id, b.institution_ids, b.price, b.sku, b.stock_quantity, b.product_type_id, b.uom_id, b.weight_per_unit || null, b.purchase_limit_id || null, req.params.id);
    }
    res.json({ success: true, message: 'Товар обновлён' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/products', (req, res) => {
  const products = db.prepare('SELECT id, name_kk, name_ru, name_en, description_kk, description_ru, description_en, marketplace_id, category_id, institution_ids, price, sku, stock_quantity, product_type_id, uom_id, weight_per_unit, purchase_limit_id, image_name, image_mime, prod_id, sent FROM products ORDER BY id').all();
  res.json(products);
});

router.get('/product-image/:id', (req, res) => {
  const row = db.prepare('SELECT image_data, image_mime FROM products WHERE id = ?').get(req.params.id);
  if (!row || !row.image_data) return res.status(404).send('нет картинки');
  res.set('Content-Type', row.image_mime);
  res.send(row.image_data);
});

router.post('/send-product/:id', async (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ success: false, message: 'Товар не найден' });
  try {
    const r = await sendProduct(p);
    res.json({ success: true, message: syncMessage('Товар создан', 'Товар обновлён', r) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, detail: err.response && err.response.data });
  }
});

router.post('/send-all-products', async (req, res) => {
  const products = db.prepare('SELECT * FROM products WHERE sent = 0').all();
  const results = [];
  for (const p of products) {
    try {
      const r = await sendProduct(p);
      results.push({ id: p.id, success: true, action: r.action });
    } catch (err) {
      const body = err.response && err.response.data;
      const msg = (body && (body.message || (body.detail && body.detail.message))) || err.message;
      results.push({ id: p.id, success: false, message: msg });
    }
  }
  res.json({ success: true, results });
});

router.post('/delete-product/:id', (req, res) => {
  const info = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ success: false, message: 'Товар не найден' });
  res.json({ success: true, message: 'Товар удалён' });
});

router.post('/reset-products', (req, res) => {
  const info = db.prepare('UPDATE products SET sent = 0').run();
  res.json({ success: true, message: 'Помечено к повторной отправке товаров: ' + info.changes + ' (отправленные ранее обновятся PATCH-ем, без дублей)' });
});

module.exports = router;
