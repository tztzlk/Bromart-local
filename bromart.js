const axios = require('axios');
const FormData = require('form-data');
const db = require('./db');
const { BROMART_URL } = require('./config');
const { ensureToken, authHeaders } = require('./auth');

// "1, 6" -> [1, 6]
function parseInstitutionIds(raw) {
  return String(raw || '').split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0);
}

function appendInstitutionIds(form, raw) {
  const ids = parseInstitutionIds(raw);
  if (!ids.length) throw new Error('Не указано ни одного учреждения (institution_ids)');
  for (const id of ids) form.append('institution_ids[]', String(id));
}

// Для контактов и FAQ: при is_global бэкенд запрещает institution_ids, иначе — нужен массив чисел.
function scopeFields(item) {
  if (item.is_global) return { is_global: true };
  const ids = parseInstitutionIds(item.institution_ids);
  if (!ids.length) throw new Error('Не Global — укажите хотя бы одно учреждение');
  return { is_global: false, institution_ids: ids };
}

function isSessionError(err) {
  return err.response && err.response.status === 401;
}

// Запрос к бэкенду с токеном. При 401 (сессия закрыта по бездействию или лимиту сессий)
// один раз перелогиниваемся и повторяем. makeBody вызывается заново — FormData одноразовая.
async function bromartRequest(method, path, makeBody) {
  await ensureToken();
  const send = () => {
    const body = makeBody ? makeBody() : undefined;
    const headers = body instanceof FormData
      ? { ...body.getHeaders(), ...authHeaders() }
      : { 'Content-Type': 'application/json', ...authHeaders() };
    return axios({ method, url: BROMART_URL + path, data: body, headers });
  };
  try {
    return await send();
  } catch (err) {
    if (!isSessionError(err)) throw err;
    await ensureToken(true);
    return await send();
  }
}

function extractId(resp) {
  const d = resp.data;
  return (d && d.data && d.data.id) || (d && d.id) || null;
}

function requireImage(item, what) {
  if (!item.image_data) throw new Error('Бэкенд требует картинку при создании ' + what + ' — загрузите фото');
}

// Коды «самой записи нет на проде» для PATCH. Только они означают, что связь с прод-записью
// потеряна; остальные 404 (родитель, категория, учреждение) — обычная ошибка данных.
// У категорий CATEGORY_NOT_FOUND приходит и про родителя, и при отсутствии доступа, поэтому
// автоматически ничего не пересоздаём — только подсказываем «Отвязать от прода».
const OWN_NOT_FOUND = {
  categories: 'CATEGORY_NOT_FOUND',
  products: 'PRODUCT_NOT_FOUND',
  purchase_limits: 'PURCHASE_LIMIT_NOT_FOUND',
  contacts: 'CONTACT_NOT_FOUND',
  faq_categories: 'FAQ_CATEGORY_NOT_FOUND',
  faq_articles: 'FAQ_ARTICLE_NOT_FOUND',
};

// Создать на проде (POST) или, если запись уже туда отправлялась (есть prod_id), обновить (PATCH).
// makeBody(isUpdate) вызывается заранее — чтобы проверить данные до логина и запроса.
async function upsert(table, row, path, makeBody, { what, hasImage = false } = {}) {
  const isUpdate = !!row.prod_id;
  makeBody(isUpdate);
  let resp;
  try {
    resp = isUpdate
      ? await bromartRequest('patch', path + '/' + row.prod_id, () => makeBody(true))
      : await bromartRequest('post', path, () => makeBody(false));
  } catch (err) {
    const body = err.response && err.response.data;
    if (isUpdate && err.response && err.response.status === 404 && body && body.code === OWN_NOT_FOUND[table]) {
      throw new Error(`${what} с id ${row.prod_id} не найдена на проде (удалена или нет доступа к учреждению). ` +
        'Если нужно создать её заново — нажмите «Отвязать» и отправьте ещё раз.');
    }
    throw err;
  }
  const prodId = isUpdate ? row.prod_id : extractId(resp);
  db.prepare(`UPDATE ${table} SET sent = 1, prod_id = ?${hasImage ? ', image_synced = 1' : ''} WHERE id = ?`)
    .run(prodId, row.id);
  return { prodId, action: isUpdate ? 'updated' : 'created' };
}

// Текст для ответа роутов: «Товар создан на проде (id 12)» / «… обновлён …»
function syncMessage(created, updated, r) {
  return (r.action === 'updated' ? updated : created) + ' на проде (id ' + r.prodId + ')';
}

// Картинку шлём при создании и при PATCH, только если загружена новая (image_synced = 0)
function appendImage(form, item, isUpdate) {
  if (!item.image_data) return;
  if (isUpdate && item.image_synced) return;
  form.append('image', Buffer.from(item.image_data), { filename: item.image_name, contentType: item.image_mime });
}

function buildCategoryForm(cat, isUpdate) {
  if (!isUpdate) requireImage(cat, 'категории');
  const form = new FormData();
  form.append('name_kk', cat.name_kk || '');
  form.append('name_ru', cat.name_ru || '');
  form.append('name_en', cat.name_en || '');
  form.append('marketplace_id', String(cat.marketplace_id));
  appendInstitutionIds(form, cat.institution_ids);
  if (cat.parent_id) {
    const parent = db.prepare('SELECT name_ru, prod_id FROM categories WHERE id = ?').get(cat.parent_id);
    if (!parent || !parent.prod_id) {
      throw new Error('Сначала отправьте родительскую категорию «' + ((parent && parent.name_ru) || cat.parent_id) + '» на прод');
    }
    if (parent.prod_id === cat.prod_id) throw new Error('Категория не может быть родителем самой себя');
    form.append('parent_id', String(parent.prod_id));
  } else if (isUpdate) {
    form.append('parent_id', ''); // пустая строка = снять родителя (верхний уровень)
  }
  if (cat.sort_order) form.append('sort_order', String(cat.sort_order));
  appendImage(form, cat, isUpdate);
  return form;
}

function buildProductForm(p, isUpdate) {
  if (!isUpdate) requireImage(p, 'товара');
  const form = new FormData();
  form.append('name_kk', p.name_kk || '');
  form.append('name_ru', p.name_ru || '');
  form.append('name_en', p.name_en || '');
  form.append('description_kk', p.description_kk || '');
  form.append('description_ru', p.description_ru || '');
  form.append('description_en', p.description_en || '');
  form.append('marketplace_id', String(p.marketplace_id));
  const cat = db.prepare('SELECT name_ru, prod_id FROM categories WHERE id = ?').get(p.category_id);
  if (!cat || !cat.prod_id) {
    throw new Error('Сначала отправьте категорию «' + ((cat && cat.name_ru) || p.category_id) + '» на прод');
  }
  form.append('category_id', String(cat.prod_id));
  appendInstitutionIds(form, p.institution_ids);
  if (p.price == null || p.price === '' || !Number.isFinite(Number(p.price))) {
    throw new Error('Не указана цена товара');
  }
  form.append('price', String(Math.round(Number(p.price) * 100))); // тенге -> тиыны
  if (p.purchase_limit_id) {
    const limit = db.prepare('SELECT name_ru, prod_id FROM purchase_limits WHERE id = ?').get(p.purchase_limit_id);
    if (!limit || !limit.prod_id) {
      throw new Error('Сначала отправьте лимит покупки «' + ((limit && limit.name_ru) || p.purchase_limit_id) + '» на прод');
    }
    form.append('purchase_limit_id', String(limit.prod_id));
  } else if (isUpdate) {
    form.append('purchase_limit_id', 'null'); // снять лимит, если его убрали локально
  }
  const missing = ['product_type_id', 'uom_id', 'stock_quantity', 'weight_per_unit']
    .filter(k => p[k] == null || p[k] === '');
  if (missing.length) throw new Error('Не заполнены обязательные поля: ' + missing.join(', '));
  form.append('sku', p.sku || '');
  form.append('stock_quantity', String(p.stock_quantity));
  form.append('product_type_id', String(p.product_type_id));
  form.append('uom_id', String(p.uom_id));
  form.append('weight_per_unit', String(p.weight_per_unit));
  appendImage(form, p, isUpdate);
  return form;
}

async function sendCategory(cat) {
  return upsert('categories', cat, '/api/v1/admin/categories', u => buildCategoryForm(cat, u),
    { what: 'Категория', hasImage: true });
}

async function sendProduct(p) {
  return upsert('products', p, '/api/v1/admin/products', u => buildProductForm(p, u),
    { what: 'Товар', hasImage: true });
}

async function sendPurchaseLimit(limit) {
  for (const k of ['name_ru', 'name_kk', 'name_en']) {
    if (!limit[k]) throw new Error('Пустое поле ' + k + ' (перевод не получился?) — заполните вручную');
  }
  const body = {
    marketplace_id: Number(limit.marketplace_id),
    name_ru: limit.name_ru,
    name_kk: limit.name_kk,
    name_en: limit.name_en,
    limit_value: Number(limit.limit_value),
    limit_uom_id: Number(limit.limit_uom_id),
  };
  return upsert('purchase_limits', limit, '/api/v1/admin/purchase-limits', () => body, { what: 'Лимит' });
}

async function sendContact(contact) {
  const body = {
    type: contact.type || '',
    value: contact.value || '',
    label_ru: contact.label_ru || '',
    label_kk: contact.label_kk || '',
    label_en: contact.label_en || '',
    is_active: !!contact.is_active,
    ...scopeFields(contact),
    sort_order: contact.sort_order != null && contact.sort_order !== '' ? Number(contact.sort_order) : undefined,
  };
  return upsert('contacts', contact, '/api/v1/admin/contacts', () => body, { what: 'Контакт' });
}

async function sendFaqCategory(category) {
  const body = {
    name_ru: category.name_ru || '',
    name_kk: category.name_kk || '',
    name_en: category.name_en || '',
    sort_order: category.sort_order != null && category.sort_order !== '' ? Number(category.sort_order) : undefined,
  };
  return upsert('faq_categories', category, '/api/v1/admin/faq/categories', () => body, { what: 'Категория FAQ' });
}

async function sendFaqArticle(article) {
  // category_id в faq_articles — это уже prod_id категории (так его выбирает форма)
  if (!article.category_id) throw new Error('Бэкенд требует категорию FAQ — выберите отправленную категорию');
  const body = {
    category_id: Number(article.category_id),
    title_ru: article.title_ru || '',
    title_kk: article.title_kk || '',
    title_en: article.title_en || '',
    body_ru: article.body_ru || '',
    body_kk: article.body_kk || '',
    body_en: article.body_en || '',
    ...scopeFields(article),
    sort_order: article.sort_order != null && article.sort_order !== '' ? Number(article.sort_order) : undefined,
  };
  return upsert('faq_articles', article, '/api/v1/admin/faq/articles', () => body, { what: 'Статья FAQ' });
}

// «Отвязать от прода»: забыть prod_id, чтобы следующая отправка создала запись заново (POST)
const SYNC_TABLES = ['categories', 'products', 'purchase_limits', 'contacts', 'faq_categories', 'faq_articles'];
function unlinkFromProd(table, id) {
  if (!SYNC_TABLES.includes(table)) throw new Error('Неизвестная таблица: ' + table);
  const extra = (table === 'categories' || table === 'products') ? ', image_synced = 0' : '';
  return db.prepare(`UPDATE ${table} SET prod_id = NULL, sent = 0${extra} WHERE id = ?`).run(id).changes;
}

// Учреждения, доступные на бэкенде (вместо захардкоженного списка 1..17)
async function fetchInstitutions() {
  const resp = await bromartRequest('get', '/api/v1/admin/institutions');
  const rows = (resp.data && resp.data.data) || [];
  return rows.map(r => ({ id: r.id, name: r.name, is_active: r.is_active !== false }));
}

function resolveImage(req) {
  if (req.file) return { name: req.file.originalname, data: req.file.buffer, mime: req.file.mimetype };
  return { name: null, data: null, mime: null };
}

module.exports = {
  sendCategory, sendProduct, sendPurchaseLimit, resolveImage, sendContact, sendFaqArticle, sendFaqCategory,
  fetchInstitutions, syncMessage, unlinkFromProd,
};
