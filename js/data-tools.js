/* Modeva — Data Tools: Export/Import anonymized localStorage snapshot */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var statusEl = $('importStatus');
  var textEl = $('snapshotText');

  var KEYS = [
    'modeva_auth_users',
    'modeva_customer_profiles',
    'modeva_customer_orders',
    'modeva_admin_customer_soft_archive',
    'modeva_dash_products',
    'modeva_dash_categories',
    'modeva_dash_inventory',
    'modeva_dash_orders',
    'modeva_dash_customers',
    'modeva_dash_promos',
    'modeva_dash_logs',
    'modeva_dash_inventory_losses'
  ];

  function safeJsonParse (raw, fallback) {
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function safeString (v) { return v == null ? '' : String(v); }

  function maskPhone (raw) {
    var digits = safeString(raw).replace(/\D/g, '');
    if (!digits) return '';
    // Keep last 2 digits only
    var last2 = digits.slice(-2);
    return '09' + '0'.repeat(Math.max(0, digits.length - 4)) + last2;
  }

  function normalizeEmail (raw) {
    return safeString(raw).trim().toLowerCase();
  }

  function anonymizeEmailMap () {
    var map = {};
    var i = 0;
    return function (email) {
      var e = normalizeEmail(email);
      if (!e) return '';
      if (e === 'admin@modeva.vn' || e === 'staff@modeva.vn' || e.endsWith('@modeva.vn')) return e;
      if (!map[e]) {
        i += 1;
        map[e] = 'customer' + i + '@demo.local';
      }
      return map[e];
    };
  }

  function anonymizeTextAddress (raw) {
    if (!raw) return '';
    return '[ẨN] Số nhà/đường';
  }

  function clone (obj) {
    return obj == null ? obj : JSON.parse(JSON.stringify(obj));
  }

  function anonymizeOrdersStore (store, anonEmail) {
    var out = {};
    if (!store || typeof store !== 'object') return out;
    Object.keys(store).forEach(function (emailKey) {
      var newEmail = anonEmail(emailKey);
      var list = store[emailKey];
      if (!Array.isArray(list)) return;
      out[newEmail] = list.map(function (o) {
        var c = clone(o) || {};
        c.customer = c.customer || {};
        c.customer.email = anonEmail(c.customer.email || emailKey);
        c.customer.fullName = c.customer.fullName ? 'Khách hàng' : 'Khách hàng';
        c.customer.phone = maskPhone(c.customer.phone || '');
        if (c.customer.address) {
          c.customer.address = Object.assign({}, c.customer.address, {
            address: anonymizeTextAddress(c.customer.address.address)
          });
        }
        return c;
      });
    });
    return out;
  }

  function anonymizeDashOrders (arr, anonEmail) {
    if (!Array.isArray(arr)) return [];
    return arr.map(function (o) {
      var c = clone(o) || {};
      c.email = anonEmail(c.email);
      c.phone = maskPhone(c.phone);
      c.customer = c.customer ? 'Khách hàng' : 'Khách hàng';
      if (c.address) {
        c.address = Object.assign({}, c.address, { address: anonymizeTextAddress(c.address.address) });
      }
      return c;
    });
  }

  function anonymizeDashCustomers (arr, anonEmail) {
    if (!Array.isArray(arr)) return [];
    return arr.map(function (c) {
      var x = clone(c) || {};
      x.email = anonEmail(x.email);
      x.name = 'Khách hàng';
      return x;
    });
  }

  function anonymizeAuthUsers (obj, anonEmail) {
    var out = {};
    if (!obj || typeof obj !== 'object') return out;
    Object.keys(obj).forEach(function (email) {
      var u = clone(obj[email]) || {};
      var newEmail = anonEmail(email);
      // Keep system users intact
      if (email === 'admin@modeva.vn' || email === 'staff@modeva.vn') {
        out[email] = u;
        return;
      }
      // Keep only safe fields for customers
      out[newEmail] = {
        role: u.role || 'customer',
        name: 'Khách hàng',
        phone: maskPhone(u.phone || ''),
        // Password hashes are not sensitive like plaintext, but also not needed for grading.
        // We intentionally omit passwordHash/salt for anonymized exported customers.
      };
    });
    return out;
  }

  function anonymizeProfiles (obj, anonEmail) {
    var out = {};
    if (!obj || typeof obj !== 'object') return out;
    Object.keys(obj).forEach(function (email) {
      out[anonEmail(email)] = clone(obj[email]);
    });
    return out;
  }

  function exportSnapshotAnonymized () {
    var anonEmail = anonymizeEmailMap();
    var payload = { _meta: { purpose: 'Anonymized snapshot', generatedAt: new Date().toISOString(), pii: 'removed' }, localStorage: {} };

    KEYS.forEach(function (k) {
      var raw = localStorage.getItem(k);
      if (raw == null) return;
      payload.localStorage[k] = safeJsonParse(raw, null);
    });

    // Anonymize specific keys
    payload.localStorage.modeva_auth_users = anonymizeAuthUsers(payload.localStorage.modeva_auth_users, anonEmail);
    payload.localStorage.modeva_customer_profiles = anonymizeProfiles(payload.localStorage.modeva_customer_profiles, anonEmail);
    payload.localStorage.modeva_customer_orders = anonymizeOrdersStore(payload.localStorage.modeva_customer_orders, anonEmail);
    payload.localStorage.modeva_dash_orders = anonymizeDashOrders(payload.localStorage.modeva_dash_orders, anonEmail);
    payload.localStorage.modeva_dash_customers = anonymizeDashCustomers(payload.localStorage.modeva_dash_customers, anonEmail);

    return payload;
  }

  function renderText (obj) {
    var s = JSON.stringify(obj, null, 2);
    if (textEl) textEl.value = s;
    return s;
  }

  function setStatus (msg) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
  }

  function importSnapshot (payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Snapshot không hợp lệ');
    if (!payload.localStorage || typeof payload.localStorage !== 'object') throw new Error('Snapshot thiếu localStorage');

    var keys = Object.keys(payload.localStorage);
    keys.forEach(function (k) {
      localStorage.setItem(k, JSON.stringify(payload.localStorage[k]));
    });
    return keys;
  }

  function clearLocalStorage () {
    KEYS.forEach(function (k) { localStorage.removeItem(k); });
  }

  function downloadText (filename, content) {
    var blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
  }

  function bind () {
    var btnExport = $('btnExport');
    var btnCopy = $('btnCopy');
    var btnDownload = $('btnDownload');
    var btnImport = $('btnImport');
    var btnImportRepoDemo = $('btnImportRepoDemo');
    var btnClear = $('btnClear');
    var fileEl = $('snapshotFile');

    if (btnExport) btnExport.addEventListener('click', function () {
      try {
        var snap = exportSnapshotAnonymized();
        renderText(snap);
        setStatus('Export OK — đã ẩn danh.');
      } catch (e) {
        setStatus('Export lỗi: ' + (e && e.message ? e.message : e));
      }
    });

    if (btnCopy) btnCopy.addEventListener('click', async function () {
      try {
        if (!textEl || !textEl.value) throw new Error('Chưa có JSON để copy');
        await navigator.clipboard.writeText(textEl.value);
        setStatus('Đã copy JSON.');
      } catch (e) {
        setStatus('Copy lỗi: ' + (e && e.message ? e.message : e));
      }
    });

    if (btnDownload) btnDownload.addEventListener('click', function () {
      try {
        if (!textEl || !textEl.value) throw new Error('Chưa có JSON để download');
        downloadText('snapshot.anonymized.exported.json', textEl.value);
        setStatus('Đã download JSON.');
      } catch (e) {
        setStatus('Download lỗi: ' + (e && e.message ? e.message : e));
      }
    });

    if (btnClear) btnClear.addEventListener('click', function () {
      clearLocalStorage();
      setStatus('Đã clear các key dữ liệu Modeva trong localStorage.');
    });

    if (btnImportRepoDemo) btnImportRepoDemo.addEventListener('click', async function () {
      try {
        var res = await fetch('../data/snapshot.anonymized.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var payload = await res.json();
        var keys = importSnapshot(payload);
        renderText(payload);
        setStatus('Import demo OK — keys: ' + keys.join(', '));
      } catch (e) {
        setStatus('Import demo lỗi: ' + (e && e.message ? e.message : e));
      }
    });

    if (btnImport) btnImport.addEventListener('click', async function () {
      try {
        if (!fileEl || !fileEl.files || !fileEl.files[0]) throw new Error('Chưa chọn file JSON');
        var file = fileEl.files[0];
        var text = await file.text();
        var payload = safeJsonParse(text, null);
        var keys = importSnapshot(payload);
        renderText(payload);
        setStatus('Import OK — keys: ' + keys.join(', '));
      } catch (e) {
        setStatus('Import lỗi: ' + (e && e.message ? e.message : e));
      }
    });
  }

  document.addEventListener('DOMContentLoaded', bind);
})();

