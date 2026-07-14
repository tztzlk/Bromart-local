const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendFaqCategory } = require('../bromart');
const { fillTranslations } = require('../translate');

router.post('/faq-category', async (req, res) => {
  try {
    const b = req.body;
    await fillTranslations(b, ['name']);
    db.prepare(`
      INSERT INTO faq_categories (name_ru, name_kk, name_en, sort_order)
      VALUES (?, ?, ?, ?)
    `).run(
      b.name_ru || '',
      b.name_kk || '',
      b.name_en || '',
      b.sort_order != null && b.sort_order !== '' ? b.sort_order : null
    );
    res.json({ success: true, message: 'FAQ Category сохранена локально' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/faq-categories', (req, res) => {
  const categories = db.prepare('SELECT id, name_ru, name_kk, name_en, sort_order, prod_id, sent FROM faq_categories ORDER BY id').all();
  res.json(categories);
});

router.put('/faq-category/:id', async (req, res) => {
  try {
    const category = db.prepare('SELECT id FROM faq_categories WHERE id = ?').get(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'FAQ Category не найдена' });
    const b = req.body;
    await fillTranslations(b, ['name']);
    db.prepare(`
      UPDATE faq_categories SET name_ru = ?, name_kk = ?, name_en = ?, sort_order = ?, sent = 0 WHERE id = ?
    `).run(
      b.name_ru || '',
      b.name_kk || '',
      b.name_en || '',
      b.sort_order != null && b.sort_order !== '' ? b.sort_order : null,
      req.params.id
    );
    res.json({ success: true, message: 'FAQ Category обновлена' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/faq-category/:id', (req, res) => {
  const info = db.prepare('DELETE FROM faq_categories WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ success: false, message: 'FAQ Category не найдена' });
  res.json({ success: true, message: 'FAQ Category удалена' });
});

router.post('/send-faq-category/:id', async (req, res) => {
  const category = db.prepare('SELECT * FROM faq_categories WHERE id = ?').get(req.params.id);
  if (!category) return res.status(404).json({ success: false, message: 'FAQ Category не найдена' });
  try {
    await sendFaqCategory(category);
    res.json({ success: true, message: 'FAQ Category отправлена на Bromart' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, detail: err.response && err.response.data });
  }
});

router.post('/send-all-faq-categories', async (req, res) => {
  const categories = db.prepare('SELECT * FROM faq_categories WHERE sent = 0 ORDER BY id').all();
  const results = [];
  for (const category of categories) {
    try {
      await sendFaqCategory(category);
      results.push({ id: category.id, success: true });
    } catch (err) {
      const body = err.response && err.response.data;
      const msg = (body && (body.message || (body.detail && body.detail.message))) || err.message;
      results.push({ id: category.id, success: false, message: msg });
    }
  }
  res.json({ success: true, results });
});

module.exports = router;
