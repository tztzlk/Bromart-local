const axios = require('axios');
const { BROMART_URL } = require('./config');
const { getSetting, setSetting, delSetting } = require('./settings');

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

// Бэкенд требует подтверждение надписи при входе (consent_version), а при новой
// версии NDA — ещё и offer_version. Берём действующие версии перед логином.
async function getLegalVersions() {
  const resp = await axios.get(BROMART_URL + '/api/v1/admin/auth/legal-documents');
  const d = (resp.data && resp.data.data) || {};
  return {
    consent_version: d.login_notice ? String(d.login_notice.version) : undefined,
    offer_version: d.offer ? String(d.offer.version) : undefined,
  };
}

async function doLogin(user_name, password) {
  const legal = await getLegalVersions();
  const resp = await axios.post(BROMART_URL + '/api/v1/admin/auth/login', { user_name, password, ...legal });
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

// force — сессия закрыта на бэкенде (например, 15 минут бездействия), хотя JWT ещё не истёк.
async function ensureToken(force = false) {
  if (!force && isTokenValid()) return;
  const creds = getCreds();
  if (!creds) {
    throw new Error(force
      ? 'Сессия на бэкенде завершена, а сохранённого логина нет. Войди в систему заново.'
      : 'Нет токена и сохранённого логина. Войди в систему.');
  }
  console.log(force ? 'Сессия завершена на бэкенде — авторизуюсь заново' : 'Токен истёк — авторизуюсь заново');
  await doLogin(creds.user_name, creds.password);
}

function login(user_name, password) {
  return doLogin(user_name, password).then(() => {
    setSetting('cred_user', user_name);
    setSetting('cred_pass', password);
  });
}

function saveToken(token) {
  setSetting('token', token.trim().replace(/^Bearer\s+/i, ''));
}

function logout() {
  delSetting('token');
  delSetting('cred_user');
  delSetting('cred_pass');
}

module.exports = {
  getToken, getCreds, authHeaders, isTokenValid,
  ensureToken, login, saveToken, logout,
};
