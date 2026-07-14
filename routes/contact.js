const express = require('express');
const router = express.Router();
const { sendContact } = require('../bromart');
const db = require('../db');
const { fillTranslations } = require('../translate');

router.post('/contact', async (req, res) => {
  try {
    const b = req.body;
    await fillTranslations(b, ['label']);
    db.prepare(`
      INSERT INTO contacts (
        type, value, label_ru, label_kk, label_en,
        is_active, is_global, institution_ids, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      b.type || '',
      b.value || '',
      b.label_ru || '',
      b.label_kk || '',
      b.label_en || '',
      b.is_active ? 1 : 0,
      b.is_global ? 1 : 0,
      b.institution_ids || '',
      b.sort_order != null && b.sort_order !== '' ? b.sort_order : null
    );
    res.json({ success: true, message: 'Контакт сохранён локально' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/contacts', (req, res) => {
  const contacts = db.prepare('SELECT id, type, value, label_ru, label_kk, label_en, is_active, is_global, institution_ids, sort_order, prod_id, sent FROM contacts ORDER BY id').all();
  res.json(contacts);
});

router.put('/contact/:id', async (req, res) => {
  try {
    const contact = db.prepare('SELECT id FROM contacts WHERE id = ?').get(req.params.id);
    if (!contact) return res.status(404).json({ success: false, message: 'Контакт не найден' });
    const b = req.body;
    await fillTranslations(b, ['label']);
    db.prepare(`
      UPDATE contacts SET
        type = ?, value = ?, label_ru = ?, label_kk = ?, label_en = ?,
        is_active = ?, is_global = ?, institution_ids = ?, sort_order = ?, sent = 0
      WHERE id = ?
    `).run(
      b.type || '',
      b.value || '',
      b.label_ru || '',
      b.label_kk || '',
      b.label_en || '',
      b.is_active ? 1 : 0,
      b.is_global ? 1 : 0,
      b.institution_ids || '',
      b.sort_order != null && b.sort_order !== '' ? b.sort_order : null,
      req.params.id
    );
    res.json({ success: true, message: 'Контакт обновлён' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/contact/:id', (req, res) => {
  const info = db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ success: false, message: 'Контакт не найден' });
  res.json({ success: true, message: 'Контакт удалён' });
});

router.post('/send-contact/:id', async (req, res) => {
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!contact) return res.status(404).json({ success: false, message: 'Контакт не найден' });
  try {
    await sendContact(contact);
    res.json({ success: true, message: 'Контакт отправлен на Bromart' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, detail: err.response && err.response.data });
  }
});

router.post('/send-all-contact', async (req, res) => {
  const contacts = db.prepare('SELECT * FROM contacts WHERE sent = 0 ORDER BY id').all();
  const results = [];
  for (const contact of contacts) {
    try {
      await sendContact(contact);
      results.push({ id: contact.id, success: true });
    } catch (err) {
      const body = err.response && err.response.data;
      const msg = (body && (body.message || (body.detail && body.detail.message))) || err.message;
      results.push({ id: contact.id, success: false, message: msg });
    }
  }
  res.json({ success: true, results });
});

module.exports = router;
