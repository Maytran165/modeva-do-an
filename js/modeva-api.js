/* Modeva — gọi API Node đồng bộ MySQL (khi chạy server/server). Không chặn luồng nếu API lỗi. */
(function () {
  'use strict';

  var API_BASE = typeof window !== 'undefined' && window.MODEVA_API_BASE !== undefined
    ? window.MODEVA_API_BASE
    : '/api';

  function apiUrl (path) {
    var p = String(path || '');
    if (!p.startsWith('/')) p = '/' + p;
    var b = String(API_BASE || '').replace(/\/$/, '');
    if (!b) return p;
    return b + p;
  }

  function syncHeaders () {
    var h = { 'Content-Type': 'application/json' };
    if (typeof window !== 'undefined' && window.MODEVA_SYNC_SECRET) {
      h['X-Modeva-Sync'] = String(window.MODEVA_SYNC_SECRET);
    }
    return h;
  }

  function postJson (path, body) {
    return fetch(apiUrl(path), {
      method: 'POST',
      headers: syncHeaders(),
      body: JSON.stringify(body || {})
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.message) || res.statusText || 'API lỗi');
          err.status = res.status;
          err.payload = data;
          throw err;
        }
        return data;
      });
    });
  }

  function getJson (path) {
    return fetch(apiUrl(path), {
      method: 'GET',
      headers: syncHeaders()
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.message) || res.statusText || 'API lỗi');
          err.status = res.status;
          err.payload = data;
          throw err;
        }
        return data;
      });
    });
  }

  window.ModevaApi = {
    /** Ghi đè base, ví dụ: http://localhost:3000/api */
    setBase: function (base) {
      API_BASE = base;
    },

    isEnabled: function () {
      if (typeof window === 'undefined' || !window.location) return false;
      if (window.location.protocol === 'file:') return false;
      return true;
    },

    /** Kiểm tra MySQL (GET /api/health) */
    ping: function () {
      if (!this.isEnabled()) return Promise.resolve({ ok: false, skipped: true });
      return fetch(apiUrl('/health'))
        .then(function (r) { return r.json(); })
        .catch(function () { return { ok: false }; });
    },

    /**
     * Đăng ký khách → bảng users
     */
    syncRegisterUser: function (payload) {
      if (!this.isEnabled()) return Promise.resolve({ ok: false, skipped: true });
      return postJson('/sync/register', payload).catch(function (e) {
        if (window.ModevaLogs) ModevaLogs.append('MySQL: đồng bộ đăng ký lỗi — ' + (e.message || e), 'warning');
        return { ok: false, error: String(e.message || e) };
      });
    },

    /**
     * Đơn mới → orders + order_addresses + order_items
     */
    syncOrder: function (orderData) {
      if (!this.isEnabled()) return Promise.resolve({ ok: false, skipped: true });
      return postJson('/sync/order', orderData).catch(function (e) {
        if (window.ModevaLogs) ModevaLogs.append('MySQL: đồng bộ đơn lỗi — ' + (e.message || e), 'warning');
        return { ok: false, error: String(e.message || e) };
      });
    },

    /**
     * Xác nhận thanh toán (chuyển khoản)
     */
    syncOrderPayment: function (payload) {
      if (!this.isEnabled()) return Promise.resolve({ ok: false, skipped: true });
      return postJson('/sync/order-payment', payload).catch(function (e) {
        if (window.ModevaLogs) ModevaLogs.append('MySQL: đồng bộ thanh toán lỗi — ' + (e.message || e), 'warning');
        return { ok: false, error: String(e.message || e) };
      });
    },

    pullDashboardSnapshot: function () {
      if (!this.isEnabled()) return Promise.resolve({ ok: false, skipped: true });
      return getJson('/sync/dashboard-snapshot').catch(function (e) {
        if (window.ModevaLogs) ModevaLogs.append('MySQL: tải snapshot dashboard lỗi — ' + (e.message || e), 'warning');
        return { ok: false, error: String(e.message || e) };
      });
    },

    pushDashboardSnapshot: function (payload) {
      if (!this.isEnabled()) return Promise.resolve({ ok: false, skipped: true });
      return postJson('/sync/dashboard-snapshot', payload).catch(function (e) {
        if (window.ModevaLogs) ModevaLogs.append('MySQL: đẩy snapshot dashboard lỗi — ' + (e.message || e), 'warning');
        return { ok: false, error: String(e.message || e) };
      });
    }
  };
})();
