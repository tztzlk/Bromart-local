const express = require('express');
const multer = require('multer');
const router = express.Router();
const db = require('../db');
const { sendCategory } = require('../bromart');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/save-category', upload.single('image'), (req, res) => {
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

router.post('/update-category/:id', upload.single('image'), (req, res) => {
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

router.get('/categories', (req, res) => {
  const categories = db.prepare('SELECT id, name_kk, name_ru, name_en, marketplace_id, institution_ids, parent_id, sort_order, image_name, image_mime, sent, prod_id FROM categories ORDER BY id').all();
  res.json(categories);
});

router.get('/category-image/:id', (req, res) => {
  const row = db.prepare('SELECT image_data, image_mime FROM categories WHERE id = ?').get(req.params.id);
  if (!row || !row.image_data) return res.status(404).send('нет картинки');
  res.set('Content-Type', row.image_mime);
  res.send(row.image_data);
});

router.post('/send-category/:id', async (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ success: false, message: 'Категория не найдена' });
  try {
    await sendCategory(cat);
    res.json({ success: true, message: 'Категория отправлена на прод' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, detail: err.response && err.response.data });
  }
});

router.post('/send-all-categories', async (req, res) => {
  const categories = db.prepare('SELECT * FROM categories WHERE sent = 0 ORDER BY (parent_id IS NOT NULL), id').all();
  const results = [];
  for (const cat of categories) {
    try {
      await sendCategory(cat);
      results.push({ id: cat.id, success: true });
    } catch (err) {
      const body = err.response && err.response.data;
      const msg = (body && (body.message || (body.detail && body.detail.message))) || err.message;
      results.push({ id: cat.id, success: false, message: msg });
    }
  }
  res.json({ success: true, results });
});

router.post('/delete-category/:id', (req, res) => {
  const info = db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ success: false, message: 'Категория не найдена' });
  res.json({ success: true, message: 'Категория удалена' });
});

router.post('/reset-categories', (req, res) => {
  const info = db.prepare('UPDATE categories SET sent = 0').run();
  res.json({ success: true, message: 'Сброшено категорий: ' + info.changes });
});

module.exports = router;
