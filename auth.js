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
  console.log('Токен истёк — авторизуюсь заново');
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
