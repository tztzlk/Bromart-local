const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendFaqArticle, syncMessage } = require('../bromart');
const { fillTranslations } = require('../translate');

router.post('/faq/article', async (req, res) => {
  try {
    const b = req.body;
    await fillTranslations(b, ['title', 'body']);
    db.prepare(`
      INSERT INTO faq_articles (
        category_id, title_ru, title_kk, title_en,
        body_ru, body_kk, body_en,
        is_global, institution_ids, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      b.category_id != null && b.category_id !== '' ? b.category_id : null,
      b.title_ru || '',
      b.title_kk || '',
      b.title_en || '',
      b.body_ru || '',
      b.body_kk || '',
      b.body_en || '',
      b.is_global ? 1 : 0,
      b.institution_ids || '',
      b.sort_order != null && b.sort_order !== '' ? b.sort_order : null
    );
    res.json({ success: true, message: 'Статья FAQ сохранена локально' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/faq', (req, res) => {
  const articles = db.prepare('SELECT id, category_id, title_ru, title_kk, title_en, body_ru, body_kk, body_en, is_global, institution_ids, sort_order, prod_id, sent FROM faq_articles ORDER BY id').all();
  res.json(articles);
});

router.put('/faq/:id', async (req, res) => {
  try {
    const article = db.prepare('SELECT id FROM faq_articles WHERE id = ?').get(req.params.id);
    if (!article) return res.status(404).json({ success: false, message: 'Статья не найдена' });
    const b = req.body;
    await fillTranslations(b, ['title', 'body']);
    db.prepare(`
      UPDATE faq_articles SET
        category_id = ?, title_ru = ?, title_kk = ?, title_en = ?,
        body_ru = ?, body_kk = ?, body_en = ?,
        is_global = ?, institution_ids = ?, sort_order = ?, sent = 0
      WHERE id = ?
    `).run(
      b.category_id || null,
      b.title_ru || '',
      b.title_kk || '',
      b.title_en || '',
      b.body_ru || '',
      b.body_kk || '',
      b.body_en || '',
      b.is_global ? 1 : 0,
      b.institution_ids || '',
      b.sort_order != null && b.sort_order !== '' ? b.sort_order : null,
      req.params.id
    );
    res.json({ success: true, message: 'Статья FAQ обновлена' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/faq/:id', (req, res) => {
  const info = db.prepare('DELETE FROM faq_articles WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ success: false, message: 'Статья не найдена' });
  res.json({ success: true, message: 'Статья удалена' });
});

router.post('/send-faq/:id', async (req, res) => {
  const article = db.prepare('SELECT * FROM faq_articles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ success: false, message: 'Статья не найдена' });
  try {
    const r = await sendFaqArticle(article);
    res.json({ success: true, message: syncMessage('Статья FAQ создана', 'Статья FAQ обновлена', r) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, detail: err.response && err.response.data });
  }
});

router.post('/send-all-faq', async (req, res) => {
  const articles = db.prepare('SELECT * FROM faq_articles WHERE sent = 0 ORDER BY id').all();
  const results = [];
  for (const article of articles) {
    try {
      const r = await sendFaqArticle(article);
      results.push({ id: article.id, success: true, action: r.action });
    } catch (err) {
      const body = err.response && err.response.data;
      const msg = (body && (body.message || (body.detail && body.detail.message))) || err.message;
      results.push({ id: article.id, success: false, message: msg });
    }
  }
  res.json({ success: true, results });
});

module.exports = router;