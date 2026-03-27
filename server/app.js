'use strict';

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const PORT = parseInt(process.env.PORT || '5000', 10);

function sanitizeMomoId (raw, fallbackPrefix) {
  const s = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '');
  if (s) return s.slice(0, 40);
  return String((fallbackPrefix || 'MDV') + Date.now()).slice(0, 40);
}

function getMomoConfig () {
  return {
    accessKey: process.env.MOMO_ACCESS_KEY || 'F8BBA842ECF85',
    secretKey: process.env.MOMO_SECRET_KEY || 'K951B6PE1waDMi640xX08PD3vg6EkVlz',
    partnerCode: process.env.MOMO_PARTNER_CODE || 'MOMO',
    endpoint: (process.env.MOMO_ENDPOINT_URL || 'https://test-payment.momo.vn/v2/gateway/api/create').trim(),
    redirectUrl: process.env.MOMO_REDIRECT_URL || 'http://127.0.0.1:8080/pages/checkout.html',
    ipnUrl: process.env.MOMO_IPN_URL || 'http://127.0.0.1:5000/momo/ipn',
    requestType: process.env.MOMO_REQUEST_TYPE || 'payWithMethod',
    lang: process.env.MOMO_LANG || 'vi'
  };
}

function buildMomoPayload (input) {
  const cfg = getMomoConfig();
  const orderInfo = String(input.orderInfo || 'pay with MoMo');
  const amount = String(Math.max(0, parseInt(input.amount, 10) || 0));
  const orderId = sanitizeMomoId(input.orderId || (cfg.partnerCode + Date.now()), cfg.partnerCode || 'MOMO');
  const requestId = sanitizeMomoId(input.requestId || orderId, 'REQ');
  const extraData = input.extraData != null ? String(input.extraData) : '';
  const orderGroupId = input.orderGroupId != null ? String(input.orderGroupId) : '';
  const autoCapture = input.autoCapture !== false;
  const paymentCode = input.paymentCode != null ? String(input.paymentCode) : '';
  let requestType = String(input.requestType || cfg.requestType || 'captureWallet').trim();

  if (!cfg.accessKey || !cfg.secretKey || !cfg.partnerCode || !cfg.redirectUrl || !cfg.ipnUrl) {
    return { ok: false, message: 'Thiếu cấu hình MOMO_* trong server/.env' };
  }
  if (!amount || amount === '0') {
    return { ok: false, message: 'Số tiền không hợp lệ' };
  }

  // payWithMethod thường yêu cầu paymentCode. Nếu không có, fallback về captureWallet
  // để tạo payUrl browser redirect ổn định.
  if (requestType === 'payWithMethod' && !paymentCode) {
    requestType = 'captureWallet';
  }

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
  const requestBody = {
    partnerCode: cfg.partnerCode,
    partnerName: 'Modeva',
    storeId: 'ModevaStore',
    requestId: requestId,
    amount: amount,
    orderId: orderId,
    orderInfo: orderInfo,
    redirectUrl: cfg.redirectUrl,
    ipnUrl: cfg.ipnUrl,
    lang: cfg.lang,
    requestType: requestType,
    autoCapture: autoCapture,
    extraData: extraData,
    signature: signature
  };
  if (orderGroupId) requestBody.orderGroupId = orderGroupId;
  if (paymentCode) requestBody.paymentCode = paymentCode;

  return { ok: true, cfg, requestBody };
}

async function createMomoPayment (input) {
  const built = buildMomoPayload(input || {});
  if (!built.ok) return built;

  const options = {
    method: 'POST',
    url: built.cfg.endpoint,
    headers: { 'Content-Type': 'application/json' },
    data: built.requestBody,
    timeout: 20000
  };

  try {
    const result = await axios(options);
    return { ok: true, momo: result.data || {} };
  } catch (error) {
    const payload = error && error.response && error.response.data ? error.response.data : null;
    const msg = payload && payload.message ? payload.message : ((error && error.message) ? error.message : 'server error');
    return { ok: false, message: msg, detail: payload || null };
  }
}

app.get('/health', function (req, res) {
  return res.json({ ok: true });
});

// Endpoint theo đúng kiểu trong hình
app.post('/payment', async function (req, res) {
  const out = await createMomoPayment(req.body || {});
  if (!out.ok) return res.status(500).json(out);
  return res.status(200).json(out.momo);
});

// Endpoint tương thích với frontend đang dùng
app.post('/api/pay/momo/create', async function (req, res) {
  const out = await createMomoPayment(req.body || {});
  if (!out.ok) return res.status(500).json(out);
  return res.status(200).json({ ok: true, momo: out.momo });
});

// IPN demo
app.post('/momo/ipn', function (req, res) {
  return res.json({ ok: true, received: true, payload: req.body || {} });
});

app.listen(PORT, function () {
  console.log('server run at port ' + PORT);
});
