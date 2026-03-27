/* Modeva — phân quyền & phiên đăng nhập (demo front-end, localStorage) */
(function () {
  'use strict';

  var SESSION_KEY = 'modeva_session';
  var USERS_KEY = 'modeva_auth_users';
  var PROFILE_KEY = 'modeva_customer_profiles';
  var ORDERS_KEY = 'modeva_customer_orders';
  /** Đồng bộ với bảng đơn Admin (js/admin-app.js, cùng key). */
  var ADMIN_ORDERS_KEY = 'modeva_dash_orders';
  var CUSTOMER_RESET_ONCE_KEY = 'modeva_customer_reset_once_done';
  /** Lịch sử reset khách (xóa mềm): mỗi lần admin reset append 1 bản ghi, dữ liệu gốc không mất hẳng. */
  var SOFT_RESET_ARCHIVE_KEY = 'modeva_admin_customer_soft_archive';
  var CUSTOMER_RELOAD_GUARD_KEY = 'modeva_customer_reload_guard';
  var LOCKOUT_KEY = 'modeva_login_lockout';
  var CUSTOMER_RELOAD_MAX = 10;
  var SYSTEM_ADMIN_EMAIL = 'admin.secure@modeva.vn';
  var SYSTEM_STAFF_EMAIL = 'staff.secure@modeva.vn';
  var SYSTEM_CUSTOMER_EMAIL = 'customer.secure@modeva.vn';
  var LEGACY_ADMIN_EMAIL = 'admin@modeva.vn';
  var LEGACY_STAFF_EMAIL = 'staff@modeva.vn';
  var LEGACY_CUSTOMER_EMAIL = 'customer@modeva.vn';

  /** Thời gian phiên (ms) — hết hạn phải đăng nhập lại */
  var SESSION_TTL_MS = 8 * 60 * 60 * 1000;
  /** Phiên ghi nhớ đăng nhập (mặc định) */
  var REMEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  var LOGIN_MAX_FAILS = 5;
  var LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
  var PBKDF2_ITERATIONS = 120000;

  function timingSafeEqualHex (a, b) {
    if (!a || !b || a.length !== b.length) return false;
    var out = 0;
    for (var i = 0; i < a.length; i++) {
      out |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return out === 0;
  }

  function bytesToB64 (u8) {
    var s = '';
    for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }

  function b64ToBytes (b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** SHA-256 hex — tương thích tài khoản demo cũ; tự nâng cấp PBKDF2 sau khi đăng nhập */
  function sha256Hex (text) {
    if (!window.crypto || !crypto.subtle) {
      return Promise.reject(new Error('Trình duyệt không hỗ trợ mã hóa'));
    }
    var buf = new TextEncoder().encode(text);
    return crypto.subtle.digest('SHA-256', buf).then(function (hash) {
      return Array.from(new Uint8Array(hash))
        .map(function (b) { return b.toString(16).padStart(2, '0'); })
        .join('');
    });
  }

  function pbkdf2Sha256Hex (password, saltUint8) {
    if (!window.crypto || !crypto.subtle) {
      return Promise.reject(new Error('Trình duyệt không hỗ trợ mã hóa'));
    }
    var enc = new TextEncoder();
    return crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    ).then(function (key) {
      return crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: saltUint8,
          iterations: PBKDF2_ITERATIONS,
          hash: 'SHA-256'
        },
        key,
        256
      );
    }).then(function (bits) {
      return Array.from(new Uint8Array(bits))
        .map(function (b) { return b.toString(16).padStart(2, '0'); })
        .join('');
    });
  }

  function hashPasswordCredential (password) {
    var salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    return pbkdf2Sha256Hex(password, salt).then(function (hashHex) {
      return { hashHex: hashHex, saltB64: bytesToB64(salt) };
    });
  }

  /**
   * @returns {Promise<{ ok: boolean, migrate: boolean }>}
   */
  function verifyStoredPassword (password, user) {
    if (user.passwordSalt && user.passwordKdf === 'pbkdf2-sha256') {
      var salt;
      try {
        salt = b64ToBytes(user.passwordSalt);
      } catch (e) {
        return Promise.resolve({ ok: false, migrate: false });
      }
      return pbkdf2Sha256Hex(password, salt).then(function (hash) {
        return { ok: timingSafeEqualHex(hash, user.passwordHash), migrate: false };
      });
    }
    return sha256Hex(password).then(function (hash) {
      var ok = timingSafeEqualHex(hash, user.passwordHash);
      return { ok: ok, migrate: ok };
    });
  }

  function getLockoutMap () {
    try {
      return JSON.parse(localStorage.getItem(LOCKOUT_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveLockoutMap (obj) {
    localStorage.setItem(LOCKOUT_KEY, JSON.stringify(obj));
  }

  function getLockState (id) {
    var m = getLockoutMap();
    var e = m[id];
    if (!e || !e.until) return { locked: false };
    if (Date.now() >= e.until) {
      delete e.until;
      if (!e.fails) delete m[id];
      else m[id] = e;
      saveLockoutMap(m);
      return { locked: false };
    }
    return { locked: true, until: e.until };
  }

  function recordLoginFailure (id) {
    var m = getLockoutMap();
    var e = m[id] || { fails: 0 };
    if (e.until && Date.now() < e.until) return;
    e.fails = (e.fails || 0) + 1;
    if (e.fails >= LOGIN_MAX_FAILS) {
      e.until = Date.now() + LOGIN_LOCKOUT_MS;
      e.fails = 0;
      if (window.ModevaLogs) {
        ModevaLogs.append('Khoá đăng nhập tạm thời do sai quá nhiều lần: ' + id, 'warning');
      }
    }
    m[id] = e;
    saveLockoutMap(m);
  }

  function clearLoginFailure (id) {
    var m = getLockoutMap();
    delete m[id];
    saveLockoutMap(m);
  }

  /** Giỏ lưu localStorage — xoá khi bắt đầu phiên khách mới (đăng nhập / đăng ký). */
  function clearSessionShoppingCart () {
    try {
      localStorage.removeItem('cartData');
      localStorage.setItem('modeva_cart', '0');
      try {
        sessionStorage.removeItem('cartData');
        sessionStorage.removeItem('modeva_cart');
      } catch (e2) {}
      if (typeof window.updateBadges === 'function') {
        window.updateBadges(0);
      }
    } catch (e) {}
  }

  function appendSoftResetArchive (entry) {
    try {
      var arr = JSON.parse(localStorage.getItem(SOFT_RESET_ARCHIVE_KEY) || '[]');
      if (!Array.isArray(arr)) arr = [];
      arr.push(entry);
      if (arr.length > 40) arr = arr.slice(-40);
      localStorage.setItem(SOFT_RESET_ARCHIVE_KEY, JSON.stringify(arr));
    } catch (e) {}
  }

  function getReloadGuardMap () {
    try {
      return JSON.parse(localStorage.getItem(CUSTOMER_RELOAD_GUARD_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveReloadGuardMap (obj) {
    localStorage.setItem(CUSTOMER_RELOAD_GUARD_KEY, JSON.stringify(obj || {}));
  }

  function resetCustomerReloadCount (email) {
    var id = normalizeId(email);
    if (!id) return;
    var map = getReloadGuardMap();
    map[id] = 0;
    saveReloadGuardMap(map);
  }

  function clearCustomerReloadCount (email) {
    var id = normalizeId(email);
    if (!id) return;
    var map = getReloadGuardMap();
    delete map[id];
    saveReloadGuardMap(map);
  }

  function enforceCustomerReloadLimit () {
    // Tắt cơ chế auto-logout theo số lần reload cho khách.
    // Yêu cầu hiện tại: khách hàng luôn giữ phiên đăng nhập.
    return;
    var raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    var sess = null;
    try { sess = JSON.parse(raw); } catch (e) { return; }
    if (!sess || sess.role !== 'customer' || !sess.email) return;
    var email = normalizeId(sess.email);
    var map = getReloadGuardMap();
    var count = parseInt(map[email], 10) || 0;
    count += 1;
    map[email] = count;
    saveReloadGuardMap(map);

    if (count === CUSTOMER_RELOAD_MAX) {
      setTimeout(function () {
        if (typeof window.showNotification === 'function') {
          window.showNotification('Bạn đã tải lại trang đủ 10 lần. Lần tiếp theo hệ thống sẽ tự đăng xuất.', 'warning');
        } else {
          alert('Bạn đã tải lại trang đủ 10 lần. Lần tiếp theo hệ thống sẽ tự đăng xuất.');
        }
      }, 0);
      if (window.ModevaLogs) {
        ModevaLogs.append('Cảnh báo reload lần 10: ' + email, 'warning');
      }
      return;
    }

    if (count > CUSTOMER_RELOAD_MAX) {
      localStorage.removeItem(SESSION_KEY);
      clearCustomerReloadCount(email);
      if (window.ModevaLogs) {
        ModevaLogs.append('Tự đăng xuất do vượt quá giới hạn reload: ' + email, 'warning');
      }
      setTimeout(function () {
        if (typeof window.showNotification === 'function') {
          window.showNotification('Bạn đã vượt quá 10 lần tải lại trang. Hệ thống đã tự đăng xuất.', 'error');
        } else {
          alert('Bạn đã vượt quá 10 lần tải lại trang. Hệ thống đã tự đăng xuất.');
        }
        window.location.href = 'account.html';
      }, 0);
    }
  }

  function completeLoginSession (self, user, id) {
    if (user.role === 'customer') {
      clearSessionShoppingCart();
      self.ensureCustomerProfile(id);
      resetCustomerReloadCount(id);
    }
    self.setSession({
      email: id,
      name: user.name,
      role: user.role,
      staffPosition: user.staffPosition || '',
      remember: true,
      at: Date.now()
    });
    if (window.ModevaLogs) {
      ModevaLogs.append('Đăng nhập thành công — ' + id + ' (' + user.role + ')', 'info');
    }
    var redirect = 'customer-profile.html';
    if (user.role === 'admin') redirect = 'admin-dashboard.html';
    else if (user.role === 'staff') redirect = 'staff-dashboard.html';
    return { ok: true, role: user.role, redirect: redirect };
  }

  function getUsers () {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveUsers (users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function seedUsersIfNeeded () {
    var users = getUsers();
    var changed = false;
    function migrateLegacyEmail (legacyEmail, nextEmail) {
      if (!users[legacyEmail]) return;
      if (!users[nextEmail]) users[nextEmail] = users[legacyEmail];
      delete users[legacyEmail];
      changed = true;
    }
    migrateLegacyEmail(LEGACY_ADMIN_EMAIL, SYSTEM_ADMIN_EMAIL);
    migrateLegacyEmail(LEGACY_STAFF_EMAIL, SYSTEM_STAFF_EMAIL);
    migrateLegacyEmail(LEGACY_CUSTOMER_EMAIL, SYSTEM_CUSTOMER_EMAIL);

    users[SYSTEM_ADMIN_EMAIL] = Object.assign({}, users[SYSTEM_ADMIN_EMAIL] || {}, {
      passwordHash: '911fde626bc1b51f9b17790de6eb5e5f27badb71d4c47eef154d75da6fad1242',
      passwordSalt: null,
      passwordKdf: null,
      role: 'admin',
      name: 'Quản trị viên'
    });
    changed = true;

    users[SYSTEM_STAFF_EMAIL] = Object.assign({}, users[SYSTEM_STAFF_EMAIL] || {}, {
      passwordHash: '99c7ce97c25119af291d42ae2c98c77c097d448ee565d9740b5a6bcf6c1cc2da',
      passwordSalt: null,
      passwordKdf: null,
      role: 'staff',
      name: 'Nhân viên bán hàng',
      staffPosition: 'sales'
    });
    changed = true;

    users[SYSTEM_CUSTOMER_EMAIL] = Object.assign({}, users[SYSTEM_CUSTOMER_EMAIL] || {}, {
      passwordHash: '11aaf0a6e99b32863763407f67dba26fe47970eb55a9ae6773f206dcba65f146',
      passwordSalt: null,
      passwordKdf: null,
      role: 'customer',
      name: 'Khách hàng demo'
    });
    changed = true;

    if (changed) saveUsers(users);
  }

  function normalizeId (raw) {
    var s = (raw || '').trim().toLowerCase();
    return s;
  }

  function readAdminOrdersList () {
    try {
      var a = JSON.parse(localStorage.getItem(ADMIN_ORDERS_KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return [];
    }
  }

  function writeAdminOrdersList (arr) {
    localStorage.setItem(ADMIN_ORDERS_KEY, JSON.stringify(arr));
  }

  /** Trạng thái hiển thị bên khách (theo dõi đơn) ↔ trạng thái bảng Admin. */
  function mapCustomerStatusToAdmin (s) {
    if (s === 'delivered' || s === 'completed') return 'completed';
    return s || 'processing';
  }

  function mapAdminStatusToCustomer (s) {
    if (s === 'completed') return 'delivered';
    return s;
  }

  function syncAdminOrderStatusFromCustomer (orderId, customerStatus, meta) {
    var list = readAdminOrdersList();
    var idx = list.findIndex(function (x) { return x.id === orderId; });
    if (idx < 0) return;
    list[idx].status = mapCustomerStatusToAdmin(customerStatus);
    if (meta && typeof meta === 'object') {
      if (meta.cancelReason != null) list[idx].cancelReason = meta.cancelReason;
      if (meta.cancelledAt != null) list[idx].cancelledAt = meta.cancelledAt;
      if (meta.adminConfirmedAt != null) list[idx].adminConfirmedAt = meta.adminConfirmedAt;
    }
    writeAdminOrdersList(list);
  }

  function findCustomerOrderIndex (store, emailKey, orderId) {
    var list = store[emailKey];
    if (!Array.isArray(list)) return -1;
    return list.findIndex(function (x) { return x && x.orderId === orderId; });
  }

  function findCustomerOrderByIdAnyOwner (store, orderId) {
    var owners = Object.keys(store || {});
    for (var i = 0; i < owners.length; i++) {
      var emailKey = owners[i];
      var idx = findCustomerOrderIndex(store, emailKey, orderId);
      if (idx >= 0) {
        return { emailKey: emailKey, idx: idx };
      }
    }
    return null;
  }

  function isWithinFirst24Hours (createdAtIso) {
    if (!createdAtIso) return false;
    var created = new Date(createdAtIso).getTime();
    if (!created || isNaN(created)) return false;
    return (Date.now() - created) <= 24 * 60 * 60 * 1000;
  }

  function buildAdminOrderRecord (raw) {
    var rawItems = raw.items || [];
    var lineItems = rawItems.map(function (it) {
      var q = parseInt(it.qty, 10) || 1;
      var unit = parseInt(it.price, 10) || 0;
      return {
        name: it.name || 'Sản phẩm',
        variant: it.variant || '',
        qty: q,
        unitPrice: unit,
        lineTotal: q * unit
      };
    });
    var itemsStr = lineItems.map(function (l) {
      return l.name + ' ×' + l.qty;
    }).join(', ');
    var cust = raw.customer || {};
    var addr = cust.address || {};
    var total = Number(raw.total) || 0;
    var sub = raw.subtotal != null ? Number(raw.subtotal) : lineItems.reduce(function (s, l) { return s + l.lineTotal; }, 0);
    var disc = Number(raw.discount) || 0;
    var ship = raw.shipping != null ? Number(raw.shipping) : Math.max(0, total - sub + disc);
    return {
      id: raw.orderId,
      customer: cust.fullName || '',
      email: cust.email || '',
      phone: cust.phone || '',
      total: total,
      subtotal: sub,
      discount: disc,
      shipping: ship,
      date: (raw.createdAt || new Date().toISOString()).slice(0, 10),
      items: itemsStr,
      lineItems: lineItems,
      address: addr,
      paymentMethod: raw.paymentMethod,
      deliveryMethod: raw.deliveryMethod,
      note: raw.note || '',
      cancelReason: raw.cancelReason || '',
      cancelledAt: raw.cancelledAt || null,
      adminConfirmedAt: raw.adminConfirmedAt || null
    };
  }

  function upsertAdminDashboardOrder (raw) {
    var oid = raw.orderId;
    if (!oid) return;
    var list = readAdminOrdersList();
    var rec = buildAdminOrderRecord(raw);
    var idx = list.findIndex(function (x) { return x.id === oid; });
    if (idx >= 0) {
      var prev = list[idx];
      list[idx] = Object.assign({}, prev, rec, { status: prev.status });
    } else {
      rec.status = 'pending';
      list.unshift(rec);
    }
    writeAdminOrdersList(list);
  }

  function escHtml (s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function moneyVi (n) {
    return new Intl.NumberFormat('vi-VN').format(n) + ' đ';
  }

  window.ModevaAuth = {
    SESSION_KEY: SESSION_KEY,
    USERS_KEY: USERS_KEY,
    PROFILE_KEY: PROFILE_KEY,

    init: function () {
      seedUsersIfNeeded();
    },

    getProfiles: function () {
      try {
        return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
      } catch (e) {
        return {};
      }
    },

    saveProfiles: function (obj) {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(obj));
    },

    getWelcomeVouchers: function () {
      return [
        {
          id: 'wv-15',
          code: 'WELCOME15',
          percent: 15,
          maxDiscount: 200000,
          minOrder: 1000000,
          used: false
        },
        {
          id: 'wv-30',
          code: 'WELCOME30',
          percent: 30,
          maxDiscount: 500000,
          minOrder: 5000000,
          used: false
        }
      ];
    },

    /** Lấy danh sách voucher còn dùng được của khách (ẩn voucher đã used). */
    getActiveCustomerVouchers: function (email) {
      var key = normalizeId(email);
      var p = this.ensureCustomerProfile(key);
      var list = Array.isArray(p.vouchers) ? p.vouchers : [];
      return list.filter(function (v) { return v && !v.used; }).map(function (v) { return Object.assign({}, v); });
    },

    /**
     * Tính giảm giá theo voucher (không tự "consume").
     * @returns {{ ok: boolean, message?: string, discount?: number, voucher?: any }}
     */
    calcVoucherDiscount: function (email, code, subtotal) {
      var key = normalizeId(email);
      var c = String(code || '').trim().toUpperCase();
      if (!c) return { ok: false, message: 'Vui lòng nhập mã voucher.' };
      var p = this.ensureCustomerProfile(key);
      var list = Array.isArray(p.vouchers) ? p.vouchers : [];
      var v = list.find(function (x) { return x && String(x.code || '').toUpperCase() === c; });
      if (!v) return { ok: false, message: 'Voucher không tồn tại trong tài khoản.' };
      if (v.used) return { ok: false, message: 'Voucher này đã được sử dụng.' };
      var sub = Number(subtotal) || 0;
      var minOrder = Number(v.minOrder) || 0;
      if (sub < minOrder) {
        return { ok: false, message: 'Voucher yêu cầu đơn tối thiểu ' + moneyVi(minOrder) + '.' };
      }
      var percent = Number(v.percent) || 0;
      var maxDisc = Number(v.maxDiscount) || 0;
      var disc = Math.floor(sub * percent / 100);
      if (maxDisc > 0) disc = Math.min(disc, maxDisc);
      disc = Math.max(0, disc);
      return { ok: true, discount: disc, voucher: Object.assign({}, v) };
    },

    /** Đánh dấu voucher đã sử dụng (gọi sau khi đặt hàng thành công). */
    consumeVoucher: function (email, code) {
      var key = normalizeId(email);
      var c = String(code || '').trim().toUpperCase();
      if (!c) return { ok: false, message: 'Thiếu mã voucher.' };
      var p = this.ensureCustomerProfile(key);
      var list = Array.isArray(p.vouchers) ? p.vouchers : [];
      var idx = list.findIndex(function (x) { return x && String(x.code || '').toUpperCase() === c; });
      if (idx < 0) return { ok: false, message: 'Voucher không tồn tại trong tài khoản.' };
      if (list[idx].used) return { ok: true, alreadyUsed: true };
      list[idx].used = true;
      p.vouchers = list;
      this.setCustomerProfile(key, p);
      if (window.ModevaLogs) {
        ModevaLogs.append('Voucher đã được sử dụng: ' + c + ' — ' + key, 'info');
      }
      return { ok: true };
    },

    createDefaultCustomerProfile: function () {
      return {
        ordersCompleted: 0,
        addressesSaved: 0,
        vouchers: this.getWelcomeVouchers()
      };
    },

    getCustomerProfile: function (email) {
      var key = normalizeId(email);
      var all = this.getProfiles();
      return all[key] || null;
    },

    setCustomerProfile: function (email, profile) {
      var key = normalizeId(email);
      var all = this.getProfiles();
      all[key] = profile;
      this.saveProfiles(all);
    },

    /** Tạo hồ sơ nếu chưa có (không ghi đè voucher đã có). */
    ensureCustomerProfile: function (email) {
      var key = normalizeId(email);
      var existing = this.getCustomerProfile(key);
      if (existing) return existing;
      var created = this.createDefaultCustomerProfile();
      this.setCustomerProfile(key, created);
      return created;
    },

    /** Ghi nhận đơn hoàn tất: tăng đơn & địa chỉ đã lưu (demo). */
    recordOrderCompleted: function (email) {
      var key = normalizeId(email);
      var p = this.ensureCustomerProfile(key);
      p.ordersCompleted = (p.ordersCompleted || 0) + 1;
      p.addressesSaved = (p.addressesSaved || 0) + 1;
      this.setCustomerProfile(key, p);
      if (window.ModevaLogs) {
        ModevaLogs.append('Cập nhật thống kê khách sau đơn: ' + key + ' (đơn hoàn tất +1)', 'info');
      }
    },

    getOrdersStore: function () {
      try {
        return JSON.parse(localStorage.getItem(ORDERS_KEY) || '{}');
      } catch (e) {
        return {};
      }
    },

    saveOrdersStore: function (obj) {
      localStorage.setItem(ORDERS_KEY, JSON.stringify(obj));
    },

    getCustomerOrders: function (email) {
      var key = normalizeId(email);
      var list = this.getOrdersStore()[key];
      return Array.isArray(list) ? list.slice() : [];
    },

    appendCustomerOrder: function (email, raw) {
      var key = normalizeId(email);
      var store = this.getOrdersStore();
      if (!store[key]) store[key] = [];
      var items = (raw.items || []).map(function (it) {
        return {
          name: it.name || 'Sản phẩm',
          variant: it.variant || '',
          qty: it.qty || 1,
          price: it.price || 0,
          image: it.image || ''
        };
      });
      store[key].unshift({
        orderId: raw.orderId,
        status: 'pending',
        createdAt: raw.createdAt || new Date().toISOString(),
        total: raw.total,
        subtotal: raw.subtotal,
        discount: raw.discount,
        shipping: raw.shipping,
        paymentStatus: raw.paymentStatus || 'pending',
        paidAt: raw.paidAt || null,
        adminConfirmedAt: raw.adminConfirmedAt || null,
        items: items,
        customer: raw.customer || {},
        paymentMethod: raw.paymentMethod,
        deliveryMethod: raw.deliveryMethod,
        note: raw.note
      });
      this.saveOrdersStore(store);
      upsertAdminDashboardOrder(raw);
      if (window.ModevaLogs) {
        ModevaLogs.append('Tạo đơn hàng khách: ' + (raw.orderId || '') + ' — ' + key + ' — ' + (items.length || 0) + ' dòng hàng', 'info');
      }
    },

    /** Gộp đơn từ kho khách vào bảng Admin (đơn cũ / thiếu đồng bộ). */
    reconcileAdminOrdersFromCustomerStore: function () {
      var store = this.getOrdersStore();
      var list = readAdminOrdersList();
      var seen = {};
      list.forEach(function (o) {
        if (o && o.id) seen[o.id] = true;
      });
      Object.keys(store).forEach(function (emailKey) {
        var arr = store[emailKey];
        if (!Array.isArray(arr)) return;
        arr.forEach(function (co) {
          var oid = co.orderId;
          if (!oid || seen[oid]) return;
          var cust = co.customer || {};
          if (!cust.email) cust = Object.assign({}, cust, { email: emailKey });
          var raw = {
            orderId: oid,
            customer: cust,
            items: co.items || [],
            total: co.total,
            subtotal: co.subtotal,
            discount: co.discount,
            shipping: co.shipping,
            createdAt: co.createdAt,
            paymentMethod: co.paymentMethod,
            deliveryMethod: co.deliveryMethod,
            note: co.note
          };
          var rec = buildAdminOrderRecord(raw);
          rec.status = mapCustomerStatusToAdmin(co.status || 'processing');
          list.unshift(rec);
          seen[oid] = true;
        });
      });
      writeAdminOrdersList(list);
    },

    mapAdminStatusToCustomer: function (status) {
      return mapAdminStatusToCustomer(status);
    },

    markCustomerOrderPaidOnce: function (email, orderId, extra) {
      var key = normalizeId(email);
      var store = this.getOrdersStore();
      var idx = findCustomerOrderIndex(store, key, orderId);
      if (idx < 0) return { ok: false, message: 'Không tìm thấy đơn hàng.' };
      var order = store[key][idx];
      if (order.paymentStatus === 'paid' || order.paidAt) {
        return { ok: false, code: 'ALREADY_PAID', message: 'Đơn hàng này đã được thanh toán trước đó.' };
      }
      if (order.status === 'cancelled' || order.status === 'delivered' || order.status === 'completed') {
        return { ok: false, code: 'ORDER_LOCKED', message: 'Không thể thanh toán cho đơn ở trạng thái hiện tại.' };
      }
      order.paymentStatus = 'paid';
      order.paidAt = new Date().toISOString();
      // Chỉ khi thanh toán thành công mới chuyển sang "đang xử lý".
      order.status = 'processing';
      if (extra && typeof extra === 'object') {
        if (extra.method) order.paymentMethod = extra.method;
        if (extra.note != null) order.note = extra.note;
        if (extra.customer && typeof extra.customer === 'object') {
          order.customer = Object.assign({}, order.customer || {}, extra.customer);
        }
      }
      this.saveOrdersStore(store);
      upsertAdminDashboardOrder(order);
      syncAdminOrderStatusFromCustomer(orderId, 'processing');
      return { ok: true, order: order };
    },

    canCustomerEditOrder: function (email, orderId) {
      var key = normalizeId(email);
      var store = this.getOrdersStore();
      var idx = findCustomerOrderIndex(store, key, orderId);
      if (idx < 0) return { ok: false, message: 'Không tìm thấy đơn hàng.' };
      var order = store[key][idx];
      if (order.adminConfirmedAt) {
        return { ok: false, code: 'ADMIN_CONFIRMED', message: 'Đơn đã được Admin/Staff xác nhận, không thể chỉnh sửa.' };
      }
      if (!isWithinFirst24Hours(order.createdAt)) {
        return { ok: false, code: 'EXPIRED_24H', message: 'Chỉ được chỉnh sửa trong 24 giờ đầu kể từ lúc tạo đơn.' };
      }
      if (order.status === 'cancelled' || order.status === 'delivered' || order.status === 'completed') {
        return { ok: false, code: 'ORDER_LOCKED', message: 'Trạng thái đơn hiện tại không cho phép chỉnh sửa.' };
      }
      return { ok: true, order: order };
    },

    updateCustomerOrderInFirst24h: function (email, orderId, patch) {
      var check = this.canCustomerEditOrder(email, orderId);
      if (!check.ok) return check;
      var key = normalizeId(email);
      var store = this.getOrdersStore();
      var idx = findCustomerOrderIndex(store, key, orderId);
      if (idx < 0) return { ok: false, message: 'Không tìm thấy đơn hàng.' };
      var order = store[key][idx];
      var data = patch || {};

      if (data.paymentMethod) {
        order.paymentMethod = String(data.paymentMethod);
      }
      if (data.customer && typeof data.customer === 'object') {
        var old = order.customer || {};
        var addr = Object.assign({}, old.address || {}, (data.customer.address || {}));
        order.customer = Object.assign({}, old, data.customer, { address: addr });
      }
      if (typeof data.note === 'string') {
        order.note = data.note;
      }
      order.updatedAt = new Date().toISOString();

      this.saveOrdersStore(store);
      upsertAdminDashboardOrder(order);
      return { ok: true, order: order };
    },

    setCustomerOrderAdminConfirmed: function (email, orderId, confirmedAt) {
      var key = normalizeId(email);
      var store = this.getOrdersStore();
      var idx = findCustomerOrderIndex(store, key, orderId);
      var ownerKey = key;
      if (idx < 0) {
        var hit = findCustomerOrderByIdAnyOwner(store, orderId);
        if (!hit) return { ok: false, message: 'Không tìm thấy đơn hàng.' };
        ownerKey = hit.emailKey;
        idx = hit.idx;
      }
      var order = store[ownerKey][idx];
      order.adminConfirmedAt = confirmedAt || new Date().toISOString();
      this.saveOrdersStore(store);
      upsertAdminDashboardOrder(order);
      return { ok: true, order: order };
    },

    setCustomerOrderStatus: function (email, orderId, status, meta) {
      var key = normalizeId(email);
      var store = this.getOrdersStore();
      var list = store[key];
      var ownerKey = key;
      if (!Array.isArray(list)) {
        var hit0 = findCustomerOrderByIdAnyOwner(store, orderId);
        if (!hit0) return;
        ownerKey = hit0.emailKey;
        list = store[ownerKey];
      }
      var found = false;
      for (var i = 0; i < list.length; i++) {
        if (list[i].orderId === orderId) {
          list[i].status = status;
          if (meta && typeof meta === 'object') {
            if (meta.cancelReason != null) list[i].cancelReason = meta.cancelReason;
            if (meta.cancelledAt != null) list[i].cancelledAt = meta.cancelledAt;
            if (meta.adminConfirmedAt != null) list[i].adminConfirmedAt = meta.adminConfirmedAt;
          }
          if (window.ModevaLogs) {
            var msg = 'Cập nhật trạng thái đơn khách: ' + orderId + ' → ' + status + ' (' + ownerKey + ')';
            if (meta && meta.cancelReason) msg += ' · lý do: ' + meta.cancelReason;
            ModevaLogs.append(msg, 'info');
          }
          found = true;
          break;
        }
      }
      if (!found) {
        var hit = findCustomerOrderByIdAnyOwner(store, orderId);
        if (hit) {
          ownerKey = hit.emailKey;
          var o = store[ownerKey][hit.idx];
          o.status = status;
          if (meta && typeof meta === 'object') {
            if (meta.cancelReason != null) o.cancelReason = meta.cancelReason;
            if (meta.cancelledAt != null) o.cancelledAt = meta.cancelledAt;
            if (meta.adminConfirmedAt != null) o.adminConfirmedAt = meta.adminConfirmedAt;
          }
        } else {
          return;
        }
      }
      this.saveOrdersStore(store);
      syncAdminOrderStatusFromCustomer(orderId, status, meta);
    },

    /**
     * @returns {Promise<{ ok: boolean, message?: string }>}
     */
    registerCustomer: function (data) {
      var self = this;
      var email = normalizeId(data.email);
      var name = (data.name || '').trim();
      var phone = (data.phone || '').replace(/\D/g, '');
      var password = data.password;

      if (!name) {
        return Promise.resolve({ ok: false, message: 'Vui lòng nhập họ tên.' });
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return Promise.resolve({ ok: false, message: 'Email không hợp lệ.' });
      }
      if (!/^[^\s@]+@gmail\.com$/.test(email)) {
        return Promise.resolve({ ok: false, message: 'Chỉ chấp nhận đăng ký bằng email @gmail.com.' });
      }
      if (!/^\d{10}$/.test(phone)) {
        return Promise.resolve({ ok: false, message: 'Số điện thoại phải đúng 10 chữ số.' });
      }

      var users = getUsers();
      if (users[email]) {
        return Promise.resolve({ ok: false, message: 'Email này đã được đăng ký.' });
      }
      if (email === SYSTEM_ADMIN_EMAIL || email === SYSTEM_STAFF_EMAIL ||
          email === LEGACY_ADMIN_EMAIL || email === LEGACY_STAFF_EMAIL) {
        return Promise.resolve({ ok: false, message: 'Không thể đăng ký bằng email hệ thống.' });
      }

      return hashPasswordCredential(password).then(function (cred) {
        users[email] = {
          passwordHash: cred.hashHex,
          passwordSalt: cred.saltB64,
          passwordKdf: 'pbkdf2-sha256',
          role: 'customer',
          name: name,
          phone: phone
        };
        saveUsers(users);
        self.setCustomerProfile(email, self.createDefaultCustomerProfile());
        self.setSession({
          email: email,
          name: name,
          role: 'customer',
          remember: true,
          at: Date.now()
        });
        clearSessionShoppingCart();
        if (window.ModevaLogs) {
          ModevaLogs.append('Đăng ký tài khoản khách mới: ' + email, 'info');
        }
        if (window.ModevaApi && typeof ModevaApi.syncRegisterUser === 'function') {
          ModevaApi.syncRegisterUser({
            email: email,
            fullName: name,
            phone: phone,
            passwordHash: cred.hashHex,
            passwordSalt: cred.saltB64,
            passwordKdf: 'pbkdf2-sha256'
          });
        }
        return { ok: true };
      }).catch(function () {
        return { ok: false, message: 'Đăng ký thất bại, thử lại sau.' };
      });
    },

    /** Email đã có trong hệ thống (đăng ký). */
    isEmailRegistered: function (email) {
      return !!getUsers()[normalizeId(email)];
    },

    /**
     * Khách có thể đặt lại mật khẩu qua OTP (không áp dụng admin/staff).
     * @returns {{ ok: boolean, message?: string }}
     */
    canResetPasswordViaOtp: function (email) {
      var id = normalizeId(email);
      if (!id) return { ok: false, message: 'Vui lòng nhập email.' };
      if (!getUsers()[id]) {
        return { ok: false, message: 'Email chưa đăng ký trong hệ thống.' };
      }
      if (id === SYSTEM_ADMIN_EMAIL || id === SYSTEM_STAFF_EMAIL ||
          id === LEGACY_ADMIN_EMAIL || id === LEGACY_STAFF_EMAIL) {
        return { ok: false, message: 'Tài khoản nội bộ: liên hệ quản trị để đặt lại mật khẩu.' };
      }
      var u = getUsers()[id];
      if (u.role && u.role !== 'customer') {
        return { ok: false, message: 'Không hỗ trợ đặt lại mật khẩu qua trang này.' };
      }
      return { ok: true };
    },

    /**
     * Đặt lại mật khẩu sau khi đã xác minh OTP ở giao diện.
     * @returns {Promise<{ ok: boolean, message?: string }>}
     */
    resetPasswordForEmail: function (email, newPassword) {
      var chk = this.canResetPasswordViaOtp(email);
      if (!chk.ok) return Promise.resolve(chk);
      var id = normalizeId(email);
      var users = getUsers();
      return hashPasswordCredential(newPassword).then(function (cred) {
        users[id].passwordHash = cred.hashHex;
        users[id].passwordSalt = cred.saltB64;
        users[id].passwordKdf = 'pbkdf2-sha256';
        saveUsers(users);
        if (window.ModevaLogs) {
          ModevaLogs.append('Đặt lại mật khẩu (OTP): ' + id, 'info');
        }
        return { ok: true };
      }).catch(function () {
        return { ok: false, message: 'Không lưu được mật khẩu mới.' };
      });
    },

    /**
     * Reset toàn bộ tài khoản khách (xóa mềm đối với dữ liệu):
     * - gỡ khách khỏi hoạt động (user / hồ sơ / đơn hiển thị)
     * - snapshot toàn bộ phần gỡ bỏ vào modeva_admin_customer_soft_archive (có thể tra cứu / export)
     * Giữ nguyên admin/staff.
     */
    resetCustomerAccounts: function () {
      if (localStorage.getItem(CUSTOMER_RESET_ONCE_KEY) === '1') {
        return { ok: false, message: 'Chức năng reset tài khoản khách chỉ được phép dùng 1 lần duy nhất.' };
      }
      var users = getUsers();
      var removedEmails = {};
      var keptUsers = {};
      var removedUserEntries = {};

      Object.keys(users).forEach(function (email) {
        var u = users[email] || {};
        var id = normalizeId(email);
        if (u.role === 'customer') {
          removedEmails[id] = true;
          removedUserEntries[id] = u;
          return;
        }
        keptUsers[id] = u;
      });

      var fullProfiles = this.getProfiles();
      var profSnap = {};
      var fullOrders = this.getOrdersStore();
      var ordSnap = {};
      Object.keys(removedEmails).forEach(function (em) {
        if (fullProfiles[em]) profSnap[em] = fullProfiles[em];
        if (fullOrders[em]) ordSnap[em] = fullOrders[em];
      });

      var dashOrdersAll = readAdminOrdersList();
      var removedDashOrders = (Array.isArray(dashOrdersAll) ? dashOrdersAll : []).filter(function (o) {
        var em = normalizeId(o && o.email ? o.email : '');
        return removedEmails[em];
      });

      var removedDashCustomers = [];
      try {
        var dashCustomersRaw = localStorage.getItem('modeva_dash_customers');
        var dashCustomers = dashCustomersRaw ? JSON.parse(dashCustomersRaw) : [];
        removedDashCustomers = (Array.isArray(dashCustomers) ? dashCustomers : []).filter(function (c) {
          var em = normalizeId(c && c.email ? c.email : '');
          return removedEmails[em];
        });
      } catch (e) {}

      var lastOrderSnap = null;
      try {
        var lr = localStorage.getItem('lastOrder');
        if (lr) lastOrderSnap = JSON.parse(lr);
      } catch (e) {}

      appendSoftResetArchive({
        at: new Date().toISOString(),
        kind: 'admin_customer_reset',
        removedEmails: Object.keys(removedEmails),
        users: removedUserEntries,
        profiles: profSnap,
        customerOrders: ordSnap,
        dashOrdersRemoved: removedDashOrders,
        dashCustomersRemoved: removedDashCustomers,
        lastOrder: lastOrderSnap
      });

      saveUsers(keptUsers);

      // Hồ sơ khách (active)
      this.saveProfiles({});
      // Đơn khách (active)
      this.saveOrdersStore({});

      // Đồng bộ bảng đơn + khách của dashboard
      try {
        var cleanedOrders = (Array.isArray(dashOrdersAll) ? dashOrdersAll : []).filter(function (o) {
          var em = normalizeId(o && o.email ? o.email : '');
          return !removedEmails[em];
        });
        writeAdminOrdersList(cleanedOrders);
      } catch (e) {}

      try {
        var dashCustomersRaw2 = localStorage.getItem('modeva_dash_customers');
        var dashCustomers2 = dashCustomersRaw2 ? JSON.parse(dashCustomersRaw2) : [];
        var cleanedCustomers = (Array.isArray(dashCustomers2) ? dashCustomers2 : []).filter(function (c) {
          var em = normalizeId(c && c.email ? c.email : '');
          return !removedEmails[em];
        });
        localStorage.setItem('modeva_dash_customers', JSON.stringify(cleanedCustomers));
      } catch (e) {}

      try { localStorage.removeItem('lastOrder'); } catch (e) {}

      var sess = this.getSession();
      if (sess && sess.role === 'customer') {
        this.clearSession();
      }

      if (window.ModevaLogs) {
        ModevaLogs.append('Reset toàn bộ tài khoản khách hàng', 'warning');
      }

      localStorage.setItem(CUSTOMER_RESET_ONCE_KEY, '1');
      return { ok: true };
    },

    /** Cập nhật số liệu & voucher trên trang tài khoản (gọi khi đã đăng nhập khách). */
    applyCustomerDashboard: function () {
      var s = this.getSession();
      if (!s || s.role !== 'customer') return;

      var cardTitle = document.querySelector('.profile-card h3');
      var cardEmail = document.querySelector('.profile-card p');
      var av = document.querySelector('.profile-avatar');
      var tier = document.querySelector('.profile-tier');
      if (cardTitle) cardTitle.textContent = s.name || '';
      if (cardEmail) cardEmail.textContent = s.email || '';
      if (av && s.name) av.textContent = String(s.name).slice(0, 2).toUpperCase();
      if (tier) tier.textContent = 'Thành viên';

      var user = getUsers()[normalizeId(s.email)] || {};
      var p = this.ensureCustomerProfile(s.email);
      var vouchers = p.vouchers || [];
      var active = vouchers.filter(function (v) { return !v.used; });

      var elOrders = document.getElementById('statOrdersCompleted');
      var elVouchers = document.getElementById('statVouchersCount');
      var elAddr = document.getElementById('statAddressesSaved');
      if (elOrders) elOrders.textContent = String(p.ordersCompleted || 0);
      if (elVouchers) elVouchers.textContent = String(active.length);
      if (elAddr) elAddr.textContent = String(p.addressesSaved || 0);

      var listEl = document.getElementById('customerVoucherList');
      if (listEl) {
        if (!active.length) {
          listEl.innerHTML = '<li class="customer-voucher-empty">Bạn không còn voucher khả dụng.</li>';
        } else {
          listEl.innerHTML = active.map(function (v) {
            return (
              '<li class="customer-voucher-item"><strong>' + escHtml(v.code) + '</strong> — Giảm ' +
              escHtml(String(v.percent)) + '%, tối đa ' + escHtml(moneyVi(v.maxDiscount)) +
              ' — đơn từ ' + escHtml(moneyVi(v.minOrder)) + '</li>'
            );
          }).join('');
        }
      }

      var addrBlock = document.getElementById('customerAddressBlock');
      if (addrBlock) {
        var n = p.addressesSaved || 0;
        if (n === 0) {
          addrBlock.innerHTML =
            '<p class="address-empty-hint">Chưa có địa chỉ đã lưu. Số địa chỉ sẽ tăng khi bạn hoàn tất mua hàng (thanh toán đơn thành công).</p>';
        } else {
          addrBlock.innerHTML =
            '<p class="address-saved-hint">Bạn đã lưu <strong>' + n + '</strong> địa chỉ giao hàng từ các đơn đặt mua.</p>';
        }
      }

      var pn = document.getElementById('profileFullName');
      var pe = document.getElementById('profileEmail');
      var pt = document.getElementById('profilePhone');
      if (pn) pn.value = s.name || '';
      if (pe) pe.value = s.email || '';
      if (pt) pt.value = user.phone || '';
    },

    syncCustomerProfileVisibility: function () {
      var profile = document.getElementById('profile');
      if (!profile) return;
      var s = this.getSession();
      var show = !!(s && s.role === 'customer');
      profile.hidden = !show;
      if (show) {
        this.applyCustomerDashboard();
      }
    },

    getSession: function () {
      try {
        var s = localStorage.getItem(SESSION_KEY);
        if (!s) return null;
        var p = JSON.parse(s);
        if (!p || typeof p.at !== 'number') {
          localStorage.removeItem(SESSION_KEY);
          return null;
        }
        // Không tự hết hạn phiên: giữ trạng thái đăng nhập cho đến khi user chủ động đăng xuất.
        return p;
      } catch (e) {
        return null;
      }
    },

    /** TTL phiên (ms), dùng cho giao diện / tài liệu */
    sessionTtlMs: SESSION_TTL_MS,

    setSession: function (payload) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    },

    clearSession: function () {
      localStorage.removeItem(SESSION_KEY);
    },

    logout: function () {
      var prev = this.getSession();
      if (window.ModevaLogs) {
        ModevaLogs.append('Đăng xuất — ' + (prev && prev.email ? prev.email + ' (' + prev.role + ')' : 'guest'), 'info');
      }
      this.clearSession();
      if (prev && prev.role === 'customer' && prev.email) {
        clearCustomerReloadCount(prev.email);
      }
      window.location.href = 'account.html';
    },

    /** Lấy danh sách staff để Admin phân bổ chức vụ. */
    getStaffUsers: function () {
      var users = getUsers();
      return Object.keys(users)
        .filter(function (k) { return users[k] && users[k].role === 'staff'; })
        .map(function (k) {
          return {
            email: k,
            name: users[k].name || '',
            role: users[k].role,
            staffPosition: users[k].staffPosition || 'sales'
          };
        })
        .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    },

    /** Admin cập nhật chức vụ của staff. */
    setStaffPosition: function (email, position) {
      if (!email) return { ok: false, message: 'Thiếu email staff.' };
      var id = normalizeId(email);
      var pos = String(position || '').trim();
      if (!pos) pos = 'sales';
      var users = getUsers();
      var u = users[id];
      if (!u || u.role !== 'staff') return { ok: false, message: 'Không tìm thấy staff.' };
      u.staffPosition = pos;
      users[id] = u;
      saveUsers(users);
      // đồng bộ session (nếu đang là staff đó)
      var cur = this.getSession();
      if (cur && cur.role === 'staff' && normalizeId(cur.email) === id) {
        this.setSession({
          email: cur.email,
          name: cur.name,
          role: cur.role,
          staffPosition: pos,
          at: Date.now()
        });
      }
      return { ok: true };
    },

    /**
     * @returns {Promise<{ ok: boolean, message?: string, role?: string, redirect?: string }>}
     */
    attemptLogin: function (identifier, password) {
      var self = this;
      var id = normalizeId(identifier);
      var genericMsg = 'Email hoặc mật khẩu không đúng.';
      if (!id || !password) {
        return Promise.resolve({ ok: false, message: 'Vui lòng nhập đủ thông tin.' });
      }

      var lock = getLockState(id);
      if (lock.locked) {
        var mins = Math.max(1, Math.ceil((lock.until - Date.now()) / 60000));
        if (window.ModevaLogs) {
          ModevaLogs.append('Thử đăng nhập khi tài khoản đang khoá: ' + id + ' (~' + mins + ' phút)', 'warning');
        }
        return Promise.resolve({
          ok: false,
          message: 'Đăng nhập tạm khoá do thử sai quá nhiều lần. Thử lại sau khoảng ' + mins + ' phút.'
        });
      }

      var users = getUsers();
      var user = users[id];
      if (!user) {
        recordLoginFailure(id);
        if (window.ModevaLogs) {
          ModevaLogs.append('Đăng nhập thất bại — không tìm thấy tài khoản', 'info');
        }
        return Promise.resolve({ ok: false, message: genericMsg });
      }

      return verifyStoredPassword(password, user).then(function (result) {
        if (!result.ok) {
          recordLoginFailure(id);
          if (window.ModevaLogs) {
            ModevaLogs.append('Đăng nhập thất bại — sai mật khẩu', 'info');
          }
          return { ok: false, message: genericMsg };
        }
        clearLoginFailure(id);
        if (result.migrate) {
          return hashPasswordCredential(password).then(function (cred) {
            users[id].passwordHash = cred.hashHex;
            users[id].passwordSalt = cred.saltB64;
            users[id].passwordKdf = 'pbkdf2-sha256';
            saveUsers(users);
            return completeLoginSession(self, users[id], id);
          });
        }
        return completeLoginSession(self, user, id);
      }).catch(function () {
        return { ok: false, message: 'Lỗi xác thực. Thử lại sau.' };
      });
    },

    /**
     * Cập nhật họ tên & SĐT (chỉ khách). SĐT: đúng 10 chữ số sau khi bỏ ký tự không phải số.
     * @returns {{ ok: boolean, message?: string }}
     */
    updateCustomerContact: function (name, phoneRaw) {
      var s = this.getSession();
      if (!s || s.role !== 'customer') {
        return { ok: false, message: 'Vui lòng đăng nhập tài khoản khách để lưu hồ sơ.' };
      }
      var email = normalizeId(s.email);
      var nameTrim = (name || '').trim();
      var phone = String(phoneRaw || '').replace(/\D/g, '');
      if (!nameTrim) {
        return { ok: false, message: 'Vui lòng nhập họ tên.' };
      }
      if (!/^\d{10}$/.test(phone)) {
        return { ok: false, message: 'Số điện thoại phải đúng 10 chữ số.' };
      }
      var users = getUsers();
      if (!users[email]) {
        return { ok: false, message: 'Không tìm thấy tài khoản.' };
      }
      users[email].name = nameTrim;
      users[email].phone = phone;
      saveUsers(users);
      var cur = this.getSession();
      var atKeep = (cur && typeof cur.at === 'number') ? cur.at : Date.now();
      this.setSession({
        email: email,
        name: nameTrim,
        role: 'customer',
        at: atKeep
      });
      this.applyCustomerDashboard();
      if (window.ModevaLogs) {
        ModevaLogs.append('Cập nhật hồ sơ khách: ' + email, 'info');
      }
      return { ok: true };
    },

    assertPageRole: function (expected) {
      var session = this.getSession();
      if (!session) {
        window.location.href = 'account.html?next=' + encodeURIComponent(window.location.pathname.split('/').pop() || '');
        return false;
      }
      if (expected === 'admin' && session.role !== 'admin') {
        if (session.role === 'staff') {
          window.location.href = 'staff-dashboard.html';
        } else {
          window.location.href = 'account.html';
        }
        return false;
      }
      if (expected === 'staff') {
        if (session.role === 'admin') {
          window.location.href = 'admin-dashboard.html';
          return false;
        }
        if (session.role !== 'staff') {
          window.location.href = 'account.html';
          return false;
        }
        return true;
      }
      return true;
    }
  };

  enforceCustomerReloadLimit();
  window.ModevaAuth.init();
})();
