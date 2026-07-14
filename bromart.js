const axios = require('axios');
const FormData = require('form-data');
const db = require('./db');
const { BROMART_URL } = require('./config');
const { ensureToken, authHeaders } = require('./auth');

function appendInstitutionIds(form, raw) {
  const ids = String(raw || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const id of ids) form.append('institution_ids[]', id);
}

function buildCategoryForm(cat) {
  const form = new FormData();
  form.append('name_kk', cat.name_kk || '');
  form.append('name_ru', cat.name_ru || '');
  form.append('name_en', cat.name_en || '');
  form.append('marketplace_id', cat.marketplace_id);
  appendInstitutionIds(form, cat.institution_ids);
  if (cat.parent_id) {
    const parent = db.prepare('SELECT name_ru, prod_id FROM categories WHERE id = ?').get(cat.parent_id);
    if (!parent || !parent.prod_id) {
      throw new Error('Сначала отправьте родительскую категорию «' + ((parent && parent.name_ru) || cat.parent_id) + '» на прод');
    }
    form.append('parent_id', parent.prod_id);
  }

  if (cat.sort_order) form.append('sort_order', cat.sort_order);
  if (cat.image_data) {
    form.append('image', Buffer.from(cat.image_data), { filename: cat.image_name, contentType: cat.image_mime });
  }
  return form;
}

function buildProductForm(p) {
  const form = new FormData();
  form.append('name_kk', p.name_kk || '');
  form.append('name_ru', p.name_ru || '');
  form.append('name_en', p.name_en || '');
  form.append('description_kk', p.description_kk || '');
  form.append('description_ru', p.description_ru || '');
  form.append('description_en', p.description_en || '');
  form.append('marketplace_id', p.marketplace_id);
  const cat = db.prepare('SELECT name_ru, prod_id FROM categories WHERE id = ?').get(p.category_id);
  if (!cat || !cat.prod_id) {
    throw new Error('Сначала отправьте категорию «' + ((cat && cat.name_ru) || p.category_id) + '» на прод');
  }
  form.append('category_id', cat.prod_id);
  appendInstitutionIds(form, p.institution_ids);
  form.append('price', p.price);
  if (p.purchase_limit_id) {
    const limit = db.prepare('SELECT name_ru, prod_id FROM purchase_limits WHERE id = ?').get(p.purchase_limit_id);
    if (!limit || !limit.prod_id) {
      throw new Error('Сначала отправьте лимит покупки «' + ((limit && limit.name_ru) || p.purchase_limit_id) + '» на прод');
    }
    form.append('purchase_limit_id', limit.prod_id);
  }
  form.append('sku', p.sku || '');
  form.append('stock_quantity', p.stock_quantity);
  form.append('product_type_id', p.product_type_id);
  form.append('uom_id', p.uom_id);
  if (p.weight_per_unit != null && p.weight_per_unit !== '') form.append('weight_per_unit', p.weight_per_unit);
  if (p.image_data) {
    form.append('image', Buffer.from(p.image_data), { filename: p.image_name, contentType: p.image_mime });
  }
  return form;
}

async function sendCategory(cat) {
  await ensureToken();
  const form = buildCategoryForm(cat);
  const resp = await axios.post(BROMART_URL + '/api/v1/admin/categories', form, { headers: { ...form.getHeaders(), ...authHeaders() } });
  const d = resp.data;
  const prodId = (d && d.data && d.data.id) || (d && d.id) || null;
  db.prepare('UPDATE categories SET sent = 1, prod_id = ? WHERE id = ?').run(prodId, cat.id);
}

async function sendProduct(p) {
  await ensureToken();
  const form = buildProductForm(p);
  await axios.post(BROMART_URL + '/api/v1/admin/products', form, { headers: { ...form.getHeaders(), ...authHeaders() } });
  db.prepare('UPDATE products SET sent = 1 WHERE id = ?').run(p.id);
}

async function sendPurchaseLimit(limit) {
  await ensureToken();
  const body = {
    marketplace_id: limit.marketplace_id,
    name_ru: limit.name_ru || '',
    name_kk: limit.name_kk || '',
    name_en: limit.name_en || '',
    limit_value: limit.limit_value,
    limit_uom_id: limit.limit_uom_id,
  };
  const resp = await axios.post(BROMART_URL + '/api/v1/admin/purchase-limits', body, { headers: { 'Content-Type': 'application/json', ...authHeaders() } });
  const d = resp.data;
  const prodId = (d && d.data && d.data.id) || (d && d.id) || null;
  db.prepare('UPDATE purchase_limits SET sent = 1, prod_id = ? WHERE id = ?').run(prodId, limit.id);
}

async function sendContact(contact) {
  await ensureToken();
  const body = {
    type: contact.type || '',
    value: contact.value || '',
    label_ru: contact.label_ru || '',
    label_kk: contact.label_kk || '',
    label_en: contact.label_en || '',
    is_active: contact.is_active ? 1 : 0,
    is_global: contact.is_global ? 1 : 0,
    institution_ids: contact.institution_ids || '',
    sort_order: contact.sort_order != null && contact.sort_order !== '' ? contact.sort_order : null,
  };
  const resp = await axios.post(BROMART_URL + '/api/v1/admin/contacts', body, { headers: { 'Content-Type': 'application/json', ...authHeaders() } });
  const d = resp.data;
  const prodId = (d && d.data && d.data.id) || (d && d.id) || null;
  db.prepare('UPDATE contacts SET sent = 1, prod_id = ? WHERE id = ?').run(prodId, contact.id);
  return prodId;
}

async function sendFaqCategory(category) {
  await ensureToken();
  const body = {
    name_ru: category.name_ru || '',
    name_kk: category.name_kk || '',
    name_en: category.name_en || '',
    sort_order: category.sort_order != null && category.sort_order !== '' ? category.sort_order : null,
  };
  const resp = await axios.post(BROMART_URL + '/api/v1/admin/faq/categories', body, { headers: { 'Content-Type': 'application/json', ...authHeaders() } });
  const d = resp.data;
  const prodId = (d && d.data && d.data.id) || (d && d.id) || null;
  db.prepare('UPDATE faq_categories SET sent = 1, prod_id = ? WHERE id = ?').run(prodId, category.id);
  return prodId;
}

async function sendFaqArticle(article) {
  await ensureToken();
  const body = {
    category_id: article.category_id || null,
    title_ru: article.title_ru || '',
    title_kk: article.title_kk || '',
    title_en: article.title_en || '',
    body_ru: article.body_ru || '',
    body_kk: article.body_kk || '',
    body_en: article.body_en || '',
    is_global: article.is_global ? 1 : 0,
    institution_ids: article.institution_ids || '',
    sort_order: article.sort_order != null && article.sort_order !== '' ? article.sort_order : null,
  };
  const resp = await axios.post(BROMART_URL + '/api/v1/admin/faq/articles', body, { headers: { 'Content-Type': 'application/json', ...authHeaders() } });
  const d = resp.data;
  const prodId = (d && d.data && d.data.id) || (d && d.id) || null;
  db.prepare('UPDATE faq_articles SET sent = 1, prod_id = ? WHERE id = ?').run(prodId, article.id);
  return prodId;
} 


function resolveImage(req) {
  if (req.file) return { name: req.file.originalname, data: req.file.buffer, mime: req.file.mimetype };
  return { name: null, data: null, mime: null };
}

module.exports = { sendCategory, sendProduct, sendPurchaseLimit, resolveImage, sendContact, sendFaqArticle, sendFaqCategory };
