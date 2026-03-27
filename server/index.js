/**
 * Modeva — phục vụ thư mục gốc dự án (HTML/CSS/JS) + API đồng bộ MySQL.
 *
 * Cách chạy:
 *   1) Import sql/modeva_mysql_seed.sql rồi sql/modeva_mysql_api.sql vào MySQL
 *   2) copy server/.env.example → server/.env và chỉnh MYSQL_*
 *   3) cd server && npm install && npm start
 *   4) Mở http://localhost:3000/index.html (hoặc /pages/checkout.html)
 */
'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const https = require('https');

const PORT = parseInt(process.env.PORT || '3000', 10);
const ROOT = path.join(__dirname, '..');

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'modeva_demo',
  waitForConnections: true,
  connectionLimit: 10
});

const app = express();

app.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Modeva-Sync');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '2mb' }));

function postJsonHttps (hostname, pathName, bodyObj) {
  const requestBody = JSON.stringify(bodyObj || {});
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: hostname,
      port: 443,
      path: pathName,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const json = raw ? JSON.parse(raw) : {};
          resolve({ statusCode: res.statusCode || 0, data: json });
        } catch (e) {
          reject(new Error('MoMo parse response lỗi: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

function requireSyncSecret (req, res, next) {
  const want = process.env.MODEVA_SYNC_SECRET;
  if (!want) return next();
  if (req.get('x-modeva-sync') !== want) {
    return res.status(401).json({ ok: false, message: 'Thiếu hoặc sai X-Modeva-Sync' });
  }
  next();
}

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1 AS ok');
    return res.json({ ok: true, mysql: true });
  } catch (e) {
    return res.status(503).json({ ok: false, mysql: false, message: String(e.message || e) });
  }
});

app.post('/api/pay/momo/create', async (req, res) => {
  const cfg = {
    partnerCode: process.env.MOMO_PARTNER_CODE || '',
    accessKey: process.env.MOMO_ACCESS_KEY || '',
    secretKey: process.env.MOMO_SECRET_KEY || '',
    endpointHost: process.env.MOMO_ENDPOINT_HOST || 'test-payment.momo.vn',
    endpointPath: process.env.MOMO_ENDPOINT_PATH || '/v2/gateway/api/create',
    redirectUrl: process.env.MOMO_REDIRECT_URL || '',
    ipnUrl: process.env.MOMO_IPN_URL || ''
  };

  if (!cfg.partnerCode || !cfg.accessKey || !cfg.secretKey || !cfg.redirectUrl || !cfg.ipnUrl) {
    return res.status(500).json({ ok: false, message: 'Thiếu cấu hình MoMo trong .env' });
  }

  const b = req.body || {};
  const amount = String(Math.max(0, parseInt(b.amount, 10) || 0));
  const orderId = String(b.orderId || '').trim();
  const orderInfo = String(b.orderInfo || ('Thanh toan don ' + orderId)).trim();
  const requestType = String(b.requestType || 'payWithMethod');
  const requestId = String(b.requestId || orderId || (cfg.partnerCode + Date.now()));
  const extraData = b.extraData != null ? String(b.extraData) : '';
  const orderGroupId = b.orderGroupId != null ? String(b.orderGroupId) : '';
  const autoCapture = b.autoCapture !== false;
  const lang = String(b.lang || 'vi');
  const paymentCode = b.paymentCode != null ? String(b.paymentCode) : undefined;

  if (!orderId) return res.status(400).json({ ok: false, message: 'Thiếu orderId' });
  if (!amount || amount === '0') return res.status(400).json({ ok: false, message: 'Số tiền không hợp lệ' });

  const rawSignature =
    'accessKey=' + cfg.accessKey +
    '&amount=' + amount +
    '&extraData=' + extraData +
    '&ipnUrl=' + cfg.ipnUrl +
    '&orderId=' + orderId +
    '&orderInfo=' + orderInfo +
    '&partnerCode=' + cfg.partnerCode +
    '&redirectUrl=' + cfg.redirectUrl +
    '&requestId=' + requestId +
    '&requestType=' + requestType;

  const signature = crypto.createHmac('sha256', cfg.secretKey).update(rawSignature).digest('hex');
  const payload = {
    partnerCode: cfg.partnerCode,
    partnerName: 'Modeva',
    storeId: 'ModevaStore',
    requestId: requestId,
    amount: amount,
    orderId: orderId,
    orderInfo: orderInfo,
    redirectUrl: cfg.redirectUrl,
    ipnUrl: cfg.ipnUrl,
    lang: lang,
    requestType: requestType,
    autoCapture: autoCapture,
    extraData: extraData,
    orderGroupId: orderGroupId,
    signature: signature
  };
  if (paymentCode) payload.paymentCode = paymentCode;

  try {
    const momoRes = await postJsonHttps(cfg.endpointHost, cfg.endpointPath, payload);
    return res.status(200).json({
      ok: momoRes.data && (momoRes.data.resultCode === 0 || !!momoRes.data.payUrl),
      momo: momoRes.data || {}
    });
  } catch (e) {
    return res.status(502).json({ ok: false, message: 'Không gọi được MoMo: ' + String(e.message || e) });
  }
});

app.post('/api/pay/momo/ipn', async (req, res) => {
  const b = req.body || {};
  const orderId = String(b.orderId || '').trim();
  const resultCode = parseInt(b.resultCode, 10);
  const transId = b.transId != null ? String(b.transId) : '';
  const message = b.message != null ? String(b.message) : '';

  if (!orderId) return res.json({ ok: true });

  try {
    if (resultCode === 0) {
      await pool.execute(
        `UPDATE orders
         SET payment_status = 'paid', paid_at = NOW(), status = 'processing',
             note = CONCAT(COALESCE(note, ''), '\n[MoMo IPN] transId=', ?, ' msg=', ?)
         WHERE order_code = ? LIMIT 1`,
        [transId, message, orderId]
      );
    } else {
      await pool.execute(
        `UPDATE orders
         SET note = CONCAT(COALESCE(note, ''), '\n[MoMo IPN fail] code=', ?, ' msg=', ?)
         WHERE order_code = ? LIMIT 1`,
        [String(resultCode), message, orderId]
      );
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, message: String(e.message || e) });
  }
});

const sync = express.Router();
sync.use(requireSyncSecret);

function toInt (v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function pickStatus (s) {
  const v = String(s || '').toLowerCase();
  if (v === 'processing' || v === 'shipping' || v === 'delivered' || v === 'cancelled' || v === 'completed') return v;
  return 'processing';
}

sync.post('/register', async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const fullName = String(b.fullName || b.name || '').trim();
  const phone = String(b.phone || '').replace(/\D/g, '');
  const passwordHash = b.passwordHash != null ? String(b.passwordHash) : null;
  const passwordSalt = b.passwordSalt != null ? String(b.passwordSalt) : null;
  const passwordKdf = b.passwordKdf != null ? String(b.passwordKdf) : null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, message: 'Email không hợp lệ' });
  }
  if (!fullName) {
    return res.status(400).json({ ok: false, message: 'Thiếu họ tên' });
  }
  if (email.endsWith('@modeva.vn')) {
    return res.status(403).json({ ok: false, message: 'Email hệ thống' });
  }

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(
      'SELECT id, role FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    if (rows.length && rows[0].role !== 'customer') {
      return res.status(403).json({ ok: false, message: 'Email đã dùng cho tài khoản nội bộ' });
    }

    await conn.execute(
      `INSERT INTO users (email, full_name, role, phone, password_hash, password_salt, password_kdf)
       VALUES (?, ?, 'customer', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         full_name = VALUES(full_name),
         phone = VALUES(phone),
         password_hash = VALUES(password_hash),
         password_salt = VALUES(password_salt),
         password_kdf = VALUES(password_kdf),
         deleted_at = NULL`,
      [email, fullName, phone || null, passwordHash, passwordSalt, passwordKdf]
    );

    const [ids] = await conn.execute(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    return res.json({ ok: true, userId: ids[0] ? ids[0].id : null });
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, message: 'Trùng email' });
    }
    console.error(e);
    return res.status(500).json({ ok: false, message: String(e.message || e) });
  } finally {
    conn.release();
  }
});

async function resolveProductId (conn, pid) {
  if (!pid) return null;
  const id = String(pid).trim();
  if (!id) return null;
  const [r] = await conn.execute('SELECT id FROM products WHERE id = ? AND is_deleted = 0 LIMIT 1', [id]);
  return r.length ? id : null;
}

sync.post('/order', async (req, res) => {
  const o = req.body || {};
  const orderCode = String(o.orderId || '').trim();
  const ownerEmail = String(o.ownerEmail || '').trim().toLowerCase();
  const cust = o.customer || {};
  const fullName = String(cust.fullName || '').trim() || 'Khách';
  const phone = String(cust.phone || '').replace(/\D/g, '');

  if (!orderCode) {
    return res.status(400).json({ ok: false, message: 'Thiếu mã đơn' });
  }
  if (!ownerEmail) {
    return res.status(400).json({ ok: false, message: 'Thiếu email tài khoản khách' });
  }

  const subtotal = Math.max(0, parseInt(o.subtotal, 10) || 0);
  const discount = Math.max(0, parseInt(o.discount, 10) || 0);
  const shipping = Math.max(0, parseInt(o.shipping, 10) || 0);
  const total = Math.max(0, parseInt(o.total, 10) || 0);
  const paymentMethod = String(o.paymentMethod || 'cod').slice(0, 64);
  const deliveryMethod = String(o.deliveryMethod || 'standard').slice(0, 64);
  const noteRaw = String(o.note || '').trim();
  const voucherCode = o.voucherCode ? String(o.voucherCode).slice(0, 64) : null;
  const noteParts = [noteRaw];
  if (voucherCode) noteParts.push('Voucher: ' + voucherCode);
  const note = noteParts.filter(Boolean).join('\n') || null;

  const payStatus = String(o.paymentStatus || (paymentMethod === 'bank' ? 'pending' : 'paid')).toLowerCase();
  let paidAt = null;
  if (payStatus === 'paid') {
    paidAt = o.paidAt ? new Date(o.paidAt) : (o.createdAt ? new Date(o.createdAt) : new Date());
    if (isNaN(paidAt.getTime())) paidAt = new Date();
  }

  const addr = cust.address || {};
  const province = String(addr.province || '').trim() || '—';
  const district = String(addr.district || '').trim() || '—';
  const ward = String(addr.ward || '').trim() || '—';
  const street = String(addr.address || '').trim() || '—';

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [exist] = await conn.execute(
      'SELECT id FROM orders WHERE order_code = ? LIMIT 1',
      [orderCode]
    );
    if (exist.length) {
      await conn.commit();
      return res.json({ ok: true, duplicate: true, orderDbId: exist[0].id });
    }

    const [urows] = await conn.execute(
      `SELECT id FROM users WHERE email = ? AND role = 'customer' AND deleted_at IS NULL LIMIT 1`,
      [ownerEmail]
    );

    let customerId;
    if (urows.length) {
      customerId = urows[0].id;
    } else {
      const [insU] = await conn.execute(
        `INSERT INTO users (email, full_name, role, phone, password_hash, password_salt, password_kdf)
         VALUES (?, ?, 'customer', ?, NULL, NULL, NULL)`,
        [ownerEmail, fullName, phone || null]
      );
      customerId = insU.insertId;
    }

    const [insO] = await conn.execute(
      `INSERT INTO orders (
         order_code, customer_id, status, payment_status, paid_at, subtotal, discount, shipping_fee, total,
         payment_method, delivery_method, note, voucher_code
       ) VALUES (?, ?, 'processing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderCode,
        customerId,
        payStatus,
        paidAt,
        subtotal,
        discount,
        shipping,
        total,
        paymentMethod,
        deliveryMethod,
        note,
        voucherCode
      ]
    );
    const orderDbId = insO.insertId;

    await conn.execute(
      `INSERT INTO order_addresses (order_id, province, district, ward, address)
       VALUES (?, ?, ?, ?, ?)`,
      [orderDbId, province, district, ward, street]
    );

    const items = Array.isArray(o.items) ? o.items : [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      const qty = Math.max(1, parseInt(it.qty, 10) || 1);
      const unit = Math.max(0, parseInt(it.price, 10) || 0);
      const lineTotal = qty * unit;
      const productName = String(it.name || 'Sản phẩm').slice(0, 255);
      const variantText = String(it.variant || '').slice(0, 2000);
      const pid = await resolveProductId(conn, it.productId);

      await conn.execute(
        `INSERT INTO order_items (order_id, product_id, variant_id, product_name, variant_text, qty, unit_price, line_total)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`,
        [orderDbId, pid, productName, variantText, qty, unit, lineTotal]
      );
    }

    await conn.commit();
    return res.json({ ok: true, orderDbId });
  } catch (e) {
    try {
      await conn.rollback();
    } catch (e2) {}
    if (e && e.code === 'ER_DUP_ENTRY') {
      return res.json({ ok: true, duplicate: true });
    }
    console.error(e);
    return res.status(500).json({ ok: false, message: String(e.message || e) });
  } finally {
    conn.release();
  }
});

sync.post('/order-payment', async (req, res) => {
  const b = req.body || {};
  const orderCode = String(b.orderId || b.orderCode || '').trim();
  const paidAt = b.paidAt ? new Date(b.paidAt) : new Date();
  if (!orderCode) {
    return res.status(400).json({ ok: false, message: 'Thiếu mã đơn' });
  }
  if (isNaN(paidAt.getTime())) {
    return res.status(400).json({ ok: false, message: 'paidAt không hợp lệ' });
  }

  try {
    const [r] = await pool.execute(
      `UPDATE orders SET payment_status = 'paid', paid_at = ?, status = 'processing'
       WHERE order_code = ? LIMIT 1`,
      [paidAt, orderCode]
    );
    return res.json({ ok: true, affected: r.affectedRows || 0 });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, message: String(e.message || e) });
  }
});

sync.get('/dashboard-snapshot', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [catRows] = await conn.execute(
      'SELECT id, name, parent_id FROM categories ORDER BY id ASC'
    );
    const categories = catRows.map((r) => ({
      id: r.id,
      name: r.name,
      parent: r.parent_id || null
    }));

    const [prodRows] = await conn.execute(
      `SELECT id, name, category_id, price, sale_price, images_count, is_deleted, deleted_at
       FROM products ORDER BY created_at DESC, id ASC`
    );
    const productsById = {};
    prodRows.forEach((r, idx) => {
      productsById[r.id] = {
        id: r.id,
        name: r.name,
        cat: r.category_id || '',
        sizes: [],
        colors: [],
        price: toInt(r.price, 0) || 0,
        salePrice: r.sale_price == null ? null : (toInt(r.sale_price, 0) || 0),
        images: Math.max(0, toInt(r.images_count, 0) || 0),
        imageUrl: '',
        lineLabel: '',
        newest: 1000 - idx,
        isDeleted: !!r.is_deleted,
        deletedAt: r.deleted_at || null
      };
    });

    const [variantRows] = await conn.execute(
      'SELECT id, product_id, size, color, sku FROM product_variants ORDER BY id ASC'
    );
    const variantById = {};
    variantRows.forEach((v) => {
      variantById[v.id] = v;
      const p = productsById[v.product_id];
      if (!p) return;
      if (p.sizes.indexOf(v.size) < 0) p.sizes.push(v.size);
      if (p.colors.indexOf(v.color) < 0) p.colors.push(v.color);
    });

    const products = Object.keys(productsById).map((k) => productsById[k]);

    const [invRows] = await conn.execute(
      `SELECT i.id, i.variant_id, i.qty, i.min_qty
       FROM inventory i
       ORDER BY i.id ASC`
    );
    const inventory = invRows.map((r) => {
      const v = variantById[r.variant_id] || {};
      return {
        id: 'i' + String(r.id),
        productId: v.product_id || '',
        sku: v.sku || ('SKU-' + String(r.id)),
        size: v.size || '',
        color: v.color || '',
        qty: Math.max(0, toInt(r.qty, 0) || 0),
        min: Math.max(0, toInt(r.min_qty, 0) || 0)
      };
    });

    const [lossRows] = await conn.execute(
      `SELECT l.id, l.variant_id, l.qty, l.reason, l.noted_at
       FROM inventory_losses l
       ORDER BY l.noted_at DESC, l.id DESC
       LIMIT 200`
    );
    const losses = lossRows.map((r) => {
      const v = variantById[r.variant_id] || {};
      return {
        id: 'loss-' + String(r.id),
        sku: v.sku || '',
        qty: Math.max(0, toInt(r.qty, 0) || 0),
        reason: r.reason || '',
        at: r.noted_at
      };
    });

    const [voucherRows] = await conn.execute(
      `SELECT code, percent, max_discount, min_order, is_active, expires_at
       FROM vouchers
       ORDER BY id DESC`
    );
    const promos = {
      coupons: voucherRows.map((v) => ({
        code: v.code,
        type: 'percent',
        value: Math.max(0, toInt(v.percent, 0) || 0),
        expiry: v.expires_at ? String(v.expires_at).slice(0, 10) : '',
        active: !!v.is_active,
        minOrder: Math.max(0, toInt(v.min_order, 0) || 0),
        maxDiscount: Math.max(0, toInt(v.max_discount, 0) || 0)
      })),
      flashSales: [],
      combos: []
    };

    return res.json({
      ok: true,
      data: { categories, products, inventory, losses, promos }
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, message: String(e.message || e) });
  } finally {
    conn.release();
  }
});

sync.post('/dashboard-snapshot', async (req, res) => {
  const b = req.body || {};
  const categories = Array.isArray(b.categories) ? b.categories : [];
  const products = Array.isArray(b.products) ? b.products : [];
  const inventory = Array.isArray(b.inventory) ? b.inventory : [];
  const losses = Array.isArray(b.losses) ? b.losses : [];
  const promos = b.promos && typeof b.promos === 'object' ? b.promos : { coupons: [] };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const c of categories) {
      const id = String((c && c.id) || '').trim();
      if (!id) continue;
      const name = String((c && c.name) || '').trim() || id;
      const parent = c && c.parent ? String(c.parent).trim() : null;
      await conn.execute(
        `INSERT INTO categories (id, name, parent_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), parent_id = VALUES(parent_id)`,
        [id, name, parent || null]
      );
    }

    for (const p of products) {
      const id = String((p && p.id) || '').trim();
      if (!id) continue;
      const name = String((p && p.name) || '').trim() || id;
      const categoryId = p && p.cat ? String(p.cat).trim() : null;
      const price = Math.max(0, toInt(p && p.price, 0) || 0);
      const salePrice = p && p.salePrice != null ? Math.max(0, toInt(p.salePrice, 0) || 0) : null;
      const images = Math.max(0, toInt(p && p.images, 0) || 0);
      const isDeleted = !!(p && (p.isDeleted || p.deletedAt));
      const deletedAt = p && p.deletedAt ? new Date(p.deletedAt) : null;
      await conn.execute(
        `INSERT INTO products (id, name, category_id, price, sale_price, images_count, is_deleted, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           category_id = VALUES(category_id),
           price = VALUES(price),
           sale_price = VALUES(sale_price),
           images_count = VALUES(images_count),
           is_deleted = VALUES(is_deleted),
           deleted_at = VALUES(deleted_at)`,
        [id, name, categoryId || null, price, salePrice, images, isDeleted ? 1 : 0, deletedAt]
      );
    }

    await conn.execute('DELETE FROM inventory_losses');
    await conn.execute('DELETE FROM inventory');
    await conn.execute('DELETE FROM product_variants');

    let variantId = 1;
    let inventoryId = 1;
    const variantBySku = {};
    for (const row of inventory) {
      const productId = String((row && row.productId) || '').trim();
      const sku = String((row && row.sku) || '').trim();
      const size = String((row && row.size) || '').trim();
      const color = String((row && row.color) || '').trim();
      if (!productId || !sku || !size || !color) continue;
      if (!variantBySku[sku]) {
        variantBySku[sku] = variantId++;
        await conn.execute(
          `INSERT INTO product_variants (id, product_id, size, color, sku)
           VALUES (?, ?, ?, ?, ?)`,
          [variantBySku[sku], productId, size, color, sku]
        );
      }
      const qty = Math.max(0, toInt(row.qty, 0) || 0);
      const min = Math.max(0, toInt(row.min, 0) || 0);
      await conn.execute(
        `INSERT INTO inventory (id, variant_id, qty, min_qty)
         VALUES (?, ?, ?, ?)`,
        [inventoryId++, variantBySku[sku], qty, min]
      );
    }

    let lossId = 1;
    for (const row of losses) {
      const sku = String((row && row.sku) || '').trim();
      const qty = Math.max(0, toInt(row && row.qty, 0) || 0);
      const reason = String((row && row.reason) || '').trim();
      if (!sku || !qty || !reason) continue;
      const vid = variantBySku[sku];
      if (!vid) continue;
      await conn.execute(
        `INSERT INTO inventory_losses (id, variant_id, qty, reason, noted_by)
         VALUES (?, ?, ?, ?, NULL)`,
        [lossId++, vid, qty, reason]
      );
    }

    const coupons = Array.isArray(promos.coupons) ? promos.coupons : [];
    await conn.execute('DELETE FROM voucher_redemptions');
    await conn.execute('DELETE FROM vouchers');
    let voucherId = 1;
    for (const cp of coupons) {
      const code = String((cp && cp.code) || '').trim().toUpperCase();
      if (!code) continue;
      const percent = Math.max(0, toInt(cp.value != null ? cp.value : cp.percent, 0) || 0);
      const maxDiscount = Math.max(0, toInt(cp.maxDiscount, 0) || 0);
      const minOrder = Math.max(0, toInt(cp.minOrder, 0) || 0);
      const active = cp && cp.active === false ? 0 : 1;
      const expiresAt = cp && cp.expiry ? new Date(cp.expiry) : null;
      await conn.execute(
        `INSERT INTO vouchers (id, code, percent, max_discount, min_order, is_active, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [voucherId++, code, percent, maxDiscount, minOrder, active, expiresAt]
      );
    }

    await conn.commit();
    return res.json({ ok: true });
  } catch (e) {
    try { await conn.rollback(); } catch (e2) {}
    console.error(e);
    return res.status(500).json({ ok: false, message: String(e.message || e) });
  } finally {
    conn.release();
  }
});

app.use('/api/sync', sync);

app.use(express.static(ROOT, { extensions: ['html'] }));

app.use((req, res) => {
  res.status(404).send('Not found');
});

app.listen(PORT, () => {
  console.log('Modeva API + static → http://localhost:' + PORT + '/');
  console.log('Health: http://localhost:' + PORT + '/api/health');
});
