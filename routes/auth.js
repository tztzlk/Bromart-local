const express = require('express');
const axios = require('axios');
const router = express.Router();
const { login, saveToken, logout, getToken, isTokenValid, getCreds } = require('../auth');
const { fetchInstitutions, unlinkFromProd } = require('../bromart');

router.post('/login', async (req, res) => {
  const { user_name, password } = req.body;
  try {
    await login(user_name, password);
    res.json({ success: true, message: 'Авторизация успешна' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, detail: err.loginData || (err.response && err.response.data) });
  }
});

router.post('/set-token', (req, res) => {
  const token = req.body.token;
  if (!token || !token.trim()) {
    return res.status(400).json({ success: false, message: 'Токен пустой' });
  }
  saveToken(token);
  res.json({ success: true, message: 'Токен сохранён' });
});

router.post('/logout', (req, res) => {
  logout();
  res.json({ success: true, message: 'Токен удалён' });
});

router.get('/auth-status', (req, res) => {
  const token = getToken();
  res.json({
    authorized: !!token,
    valid: isTokenValid(),
    auto_refresh: !!getCreds(),
    preview: token ? token.slice(0, 6) + '...' + token.slice(-4) : null,
  });
});

router.get('/institutions', async (req, res) => {
  try {
    res.json({ success: true, institutions: await fetchInstitutions() });
  } catch (err) {
    const body = err.response && err.response.data;
    res.status(500).json({ success: false, message: (body && body.message) || err.message });
  }
});

// Забыть связь с прод-записью: следующая отправка создаст её заново (POST)
router.post('/unlink/:table/:id', (req, res) => {
  try {
    const changes = unlinkFromProd(req.params.table, req.params.id);
    if (!changes) return res.status(404).json({ success: false, message: 'Запись не найдена' });
    res.json({ success: true, message: 'Отвязано от прода — при следующей отправке будет создана новая запись' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/translate', async (req, res) => {
  const { text, to } = req.query;
  if (!text) return res.json({ text: '' });
  try {
    const resp = await axios.get('https://translate.googleapis.com/translate_a/single', {
      params: { client: 'gtx', sl: 'ru', tl: to, dt: 't', q: text },
    });
    const translated = resp.data[0].map(part => part[0]).join('');
    res.json({ text: translated });
  } catch (err) {
    res.status(500).json({ text: '', error: err.message });
  }
});

module.exports = router;
