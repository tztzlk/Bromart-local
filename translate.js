const axios = require('axios');

async function translate(text, to) {
  if (!text) return '';
  try {
    const resp = await axios.get('https://translate.googleapis.com/translate_a/single', {
      params: { client: 'gtx', sl: 'ru', tl: to, dt: 't', q: text },
    });
    return resp.data[0].map(part => part[0]).join('');
  } catch (err) {
    return '';
  }
}

async function fillTranslations(b, fields) {
  for (const f of fields) {
    const ru = b[f + '_ru'];
    if (!ru) continue;
    if (!b[f + '_kk']) b[f + '_kk'] = await translate(ru, 'kk');
    if (!b[f + '_en']) b[f + '_en'] = await translate(ru, 'en');
  }
}

module.exports = { translate, fillTranslations };
