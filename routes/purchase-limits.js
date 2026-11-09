const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendPurchaseLimit, syncMessage } = require('../bromart');
const { fillTranslations } = require('../translate');

router.post('/save-purchase-limit', async (req, res) => {
  try {
    const b = req.body;
    await fillTranslations(b, ['name']);
    db.prepare(`
      INSERT INTO purchase_limits (name_kk, name_ru, name_en, marketplace_id, limit_value, limit_uom_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(b.name_kk, b.name_ru, b.name_en, b.marketplace_id, b.limit_value, b.limit_uom_id);
    res.json({ success: true, message: 'Лимит сохранён локально' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/update-purchase-limit/:id', async (req, res) => {
  try {
    const limit = db.prepare('SELECT id FROM purchase_limits WHERE id = ?').get(req.params.id);
    if (!limit) return res.status(404).json({ success: false, message: 'Лимит не найден' });
    const b = req.body;
    await fillTranslations(b, ['name']);
    db.prepare(`
      UPDATE purchase_limits SET name_kk=?, name_ru=?, name_en=?, marketplace_id=?, limit_value=?, limit_uom_id=?, sent=0 WHERE id=?
    `).run(b.name_kk, b.name_ru, b.name_en, b.marketplace_id, b.limit_value, b.limit_uom_id, req.params.id);
    res.json({ success: true, message: 'Лимит обновлён' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/purchase-limits', (req, res) => {
  const limits = db.prepare('SELECT id, name_kk, name_ru, name_en, marketplace_id, limit_value, limit_uom_id, prod_id, sent FROM purchase_limits ORDER BY id').all();
  res.json(limits);
});

router.post('/send-purchase-limit/:id', async (req, res) => {
  const limit = db.prepare('SELECT * FROM purchase_limits WHERE id = ?').get(req.params.id);
  if (!limit) return res.status(404).json({ success: false, message: 'Лимит не найден' });
  try {
    const r = await sendPurchaseLimit(limit);
    res.json({ success: true, message: syncMessage('Лимит создан', 'Лимит обновлён', r) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, detail: err.response && err.response.data });
  }
});

router.post('/send-all-purchase-limits', async (req, res) => {
  const limits = db.prepare('SELECT * FROM purchase_limits WHERE sent = 0').all();
  const results = [];
  for (const limit of limits) {
    try {
      const r = await sendPurchaseLimit(limit);
      results.push({ id: limit.id, success: true, action: r.action });
    } catch (err) {
      const body = err.response && err.response.data;
      const msg = (body && (body.message || (body.detail && body.detail.message))) || err.message;
      results.push({ id: limit.id, success: false, message: msg });
    }
  }
  res.json({ success: true, results });
});

router.post('/delete-purchase-limit/:id', (req, res) => {
  const info = db.prepare('DELETE FROM purchase_limits WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ success: false, message: 'Лимит не найден' });
  res.json({ success: true, message: 'Лимит удалён' });
});

module.exports = router;
