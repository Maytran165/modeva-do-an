/* Modeva — bảng điều khiển Admin / Staff (dữ liệu demo localStorage) */
(function () {
  'use strict';

  var ROLE = document.body.getAttribute('data-dashboard-role') || 'admin';
  var IS_ADMIN = ROLE === 'admin';
  var invUiChoice = {};

  if (!window.ModevaAuth || !ModevaAuth.assertPageRole(ROLE)) return;

  var K = {
    products: 'modeva_dash_products',
    categories: 'modeva_dash_categories',
    inventory: 'modeva_dash_inventory',
    orders: 'modeva_dash_orders',
    customers: 'modeva_dash_customers',
    promos: 'modeva_dash_promos',
    logs: 'modeva_dash_logs',
    losses: 'modeva_dash_inventory_losses'
  };

  var MYSQL_SYNC_KEYS = {};
  MYSQL_SYNC_KEYS[K.products] = true;
  MYSQL_SYNC_KEYS[K.categories] = true;
  MYSQL_SYNC_KEYS[K.inventory] = true;
  MYSQL_SYNC_KEYS[K.losses] = true;
  MYSQL_SYNC_KEYS[K.promos] = true;
  var mysqlSyncTimer = null;

  function read (key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write (key, val) {
    localStorage.setItem(key, JSON.stringify(val));
    if (MYSQL_SYNC_KEYS[key]) schedulePushDashboardSnapshot();
  }

  function buildDashboardSnapshotPayload () {
    return {
      categories: read(K.categories, []),
      products: read(K.products, []),
      inventory: read(K.inventory, []),
      losses: read(K.losses, []),
      promos: read(K.promos, { coupons: [], flashSales: [], combos: [] })
    };
  }

  function schedulePushDashboardSnapshot () {
    if (!window.ModevaApi || typeof ModevaApi.pushDashboardSnapshot !== 'function') return;
    if (mysqlSyncTimer) clearTimeout(mysqlSyncTimer);
    mysqlSyncTimer = setTimeout(function () {
      mysqlSyncTimer = null;
      ModevaApi.pushDashboardSnapshot(buildDashboardSnapshotPayload());
    }, 700);
  }

  function applySnapshotToLocal (snap) {
    if (!snap || typeof snap !== 'object') return false;
    var changed = false;
    if (Array.isArray(snap.categories)) {
      localStorage.setItem(K.categories, JSON.stringify(snap.categories));
      changed = true;
    }
    if (Array.isArray(snap.products)) {
      localStorage.setItem(K.products, JSON.stringify(snap.products));
      changed = true;
    }
    if (Array.isArray(snap.inventory)) {
      localStorage.setItem(K.inventory, JSON.stringify(snap.inventory));
      changed = true;
    }
    if (Array.isArray(snap.losses)) {
      localStorage.setItem(K.losses, JSON.stringify(snap.losses));
      changed = true;
    }
    if (snap.promos && typeof snap.promos === 'object') {
      localStorage.setItem(K.promos, JSON.stringify(snap.promos));
      changed = true;
    }
    return changed;
  }

  function pullDashboardSnapshotOnce () {
    if (!window.ModevaApi || typeof ModevaApi.pullDashboardSnapshot !== 'function') {
      return Promise.resolve({ ok: false, skipped: true });
    }
    return ModevaApi.pullDashboardSnapshot().then(function (res) {
      if (!res || !res.ok || !res.data) return res || { ok: false };
      applySnapshotToLocal(res.data);
      return res;
    });
  }

  function esc (s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money (n) {
    return new Intl.NumberFormat('vi-VN').format(n) + ' đ';
  }

  function uniqueListKeepOrder (arr) {
    var seen = {};
    return (arr || []).filter(function (x) {
      var k = String(x || '').trim().toLowerCase();
      if (!k) return false;
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  function pushLog (message, level) {
    if (window.ModevaLogs && typeof ModevaLogs.append === 'function') {
      ModevaLogs.append(message, level || 'info');
      return;
    }
    var session = ModevaAuth.getSession();
    var logs = read(K.logs, []);
    logs.unshift({
      at: new Date().toISOString(),
      level: level || 'info',
      message: message,
      user: session ? session.email : '—'
    });
    write(K.logs, logs.slice(0, 200));
  }

  function asciiKey (s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '')
      .toUpperCase();
  }

  function uniqueStrList (arr) {
    var seen = {};
    return (arr || []).map(function (x) { return String(x || '').trim(); }).filter(Boolean).filter(function (x) {
      var k = x.toLowerCase();
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  function ensureMinChoices (list, minCount, fallback) {
    var out = uniqueStrList(list);
    var f = uniqueStrList(fallback);
    for (var i = 0; out.length < minCount && i < f.length; i++) {
      var val = f[i];
      if (!out.some(function (x) { return x.toLowerCase() === val.toLowerCase(); })) out.push(val);
    }
    return out;
  }

  function buildInventoryFromProducts (products, existingRows) {
    var rows = Array.isArray(existingRows) ? existingRows : [];
    var bySku = {};
    var maxIdNum = 0;
    rows.forEach(function (r) {
      if (r && r.sku) bySku[String(r.sku)] = r;
      var n = r && r.id ? parseInt(String(r.id).replace(/[^\d]/g, ''), 10) : 0;
      if (!isNaN(n) && n > maxIdNum) maxIdNum = n;
    });
    var out = [];
    var autoId = maxIdNum + 1;
    (products || []).forEach(function (p) {
      if (!p || !p.id) return;
      var sizes = ensureMinChoices(p.sizes, 4, ['S', 'M', 'L', 'XL']).slice(0, 4);
      var colors = ensureMinChoices(p.colors, 3, ['Trắng', 'Đen', 'Be']);
      sizes.forEach(function (sz) {
        colors.forEach(function (col) {
          var sku = asciiKey(p.id) + '-' + asciiKey(sz).slice(0, 6) + '-' + asciiKey(col).slice(0, 6);
          var old = bySku[sku];
          out.push({
            id: old && old.id ? old.id : ('i' + (autoId++)),
            productId: p.id,
            sku: sku,
            size: sz,
            color: col,
            qty: old && old.qty != null ? (parseInt(old.qty, 10) || 0) : 12,
            min: old && old.min != null ? (parseInt(old.min, 10) || 0) : 4
          });
        });
      });
    });
    return out;
  }

  function seed () {
    if (window.ModevaCatalogSync) {
      if (typeof ModevaCatalogSync.ensureProductSeed === 'function') ModevaCatalogSync.ensureProductSeed();
      if (typeof ModevaCatalogSync.ensureCategorySeed === 'function') ModevaCatalogSync.ensureCategorySeed();
    }
    if (!read(K.products, null)) {
      write(K.products, window.ModevaCatalogSync && typeof ModevaCatalogSync.defaultProducts === 'function'
        ? ModevaCatalogSync.defaultProducts()
        : [
          { id: 'p1', name: 'Áo sơ mi linen', cat: 'nam-ao', sizes: ['S', 'M', 'L'], colors: ['Trắng', 'Be'], price: 890000, salePrice: 690000, images: 3 },
          { id: 'p2', name: 'Quần tây slim', cat: 'nam-quan', sizes: ['30', '32', '34'], colors: ['Đen', 'Navy'], price: 1190000, salePrice: null, images: 4 },
          { id: 'p3', name: 'Váy midi lụa', cat: 'nu-vay', sizes: ['S', 'M'], colors: ['Hồng', 'Đen'], price: 1590000, salePrice: 1290000, images: 5 }
        ]);
    }
    if (!read(K.categories, null)) {
      write(K.categories, window.ModevaCatalogSync && typeof ModevaCatalogSync.defaultCategories === 'function'
        ? ModevaCatalogSync.defaultCategories()
        : [
          { id: 'nam', name: 'Thời trang Nam', parent: null },
          { id: 'nam-ao', name: 'Áo nam', parent: 'nam' },
          { id: 'nam-quan', name: 'Quần nam', parent: 'nam' },
          { id: 'nu', name: 'Thời trang Nữ', parent: null },
          { id: 'nu-ao', name: 'Áo nữ', parent: 'nu' },
          { id: 'nu-vay', name: 'Váy', parent: 'nu' },
          { id: 'tre', name: 'Trẻ em', parent: null },
          { id: 'tre-be-trai', name: 'Bé trai', parent: 'tre' },
          { id: 'tre-be-gai', name: 'Bé gái', parent: 'tre' }
        ]);
    }
    var productsForInv = read(K.products, []);
    var invNow = read(K.inventory, null);
    var normalizedInv = buildInventoryFromProducts(productsForInv, invNow || []);
    // Luôn chuẩn hóa kho theo sản phẩm hiện có để hiển thị đủ 12 sản phẩm, đủ size/màu.
    write(K.inventory, normalizedInv);
    if (!read(K.orders, null)) {
      write(K.orders, [
        {
          id: 'DH24001',
          customer: 'Lê Minh',
          email: 'minh@email.com',
          phone: '0912345678',
          total: 1780000,
          subtotal: 1750000,
          discount: 0,
          shipping: 30000,
          status: 'processing',
          date: '2026-03-22',
          items: 'Áo sơ mi linen ×1, Quần tây slim ×1',
          lineItems: [
            { name: 'Áo sơ mi linen', variant: 'M · Trắng', qty: 1, unitPrice: 690000, lineTotal: 690000 },
            { name: 'Quần tây slim', variant: '32 · Đen', qty: 1, unitPrice: 1090000, lineTotal: 1090000 }
          ],
          address: { province: 'Hà Nội', district: 'Cầu Giấy', ward: 'Phường 1', address: '12 Nguyễn Văn Huyên' }
        },
        {
          id: 'DH24002',
          customer: 'Phạm Hà',
          email: 'ha@email.com',
          phone: '0987654321',
          total: 1290000,
          subtotal: 1260000,
          discount: 0,
          shipping: 30000,
          status: 'shipping',
          date: '2026-03-23',
          items: 'Váy midi lụa ×1',
          lineItems: [{ name: 'Váy midi lụa', variant: 'S · Hồng', qty: 1, unitPrice: 1290000, lineTotal: 1290000 }],
          address: { province: 'TP.HCM', district: 'Quận 1', ward: 'Bến Nghé', address: '88 Lê Lợi, tầng 3' }
        },
        {
          id: 'DH24003',
          customer: 'VIP — Trần An',
          email: 'an@email.com',
          phone: '0909090909',
          total: 4500000,
          subtotal: 4470000,
          discount: 0,
          shipping: 30000,
          status: 'completed',
          date: '2026-03-20',
          items: 'Set capsule ×3',
          lineItems: [
            { name: 'Áo sơ mi linen', variant: 'L', qty: 2, unitPrice: 690000, lineTotal: 1380000 },
            { name: 'Quần tây slim', variant: '34 · Navy', qty: 1, unitPrice: 1190000, lineTotal: 1190000 }
          ],
          address: { province: 'Đà Nẵng', district: 'Hải Châu', ward: 'Thạch Thang', address: '5 Trần Phú' }
        },
        {
          id: 'DH24004',
          customer: 'Đỗ Kiệt',
          email: 'kiet@email.com',
          phone: '0933444555',
          total: 560000,
          subtotal: 530000,
          discount: 0,
          shipping: 30000,
          status: 'cancelled',
          date: '2026-03-21',
          items: 'Phụ kiện ×1',
          lineItems: [{ name: 'Phụ kiện', variant: '', qty: 1, unitPrice: 530000, lineTotal: 530000 }],
          address: { province: 'Hà Nội', district: 'Đống Đa', ward: 'Văn Miếu', address: 'Ngõ nhỏ — không giao được' }
        }
      ]);
    }
    if (!read(K.customers, null)) {
      write(K.customers, [
        { id: 'c1', name: 'Trần An', email: 'an@email.com', tier: 'vip', orders: 28, spent: 92000000 },
        { id: 'c2', name: 'Lê Minh', email: 'minh@email.com', tier: 'regular', orders: 5, spent: 8900000 },
        { id: 'c3', name: 'Phạm Hà', email: 'ha@email.com', tier: 'regular', orders: 12, spent: 23100000 }
      ]);
    }
    if (!read(K.promos, null)) {
      write(K.promos, {
        coupons: [
          { code: 'MODEVA20', type: 'percent', value: 20, expiry: '2026-04-30', active: true },
          { code: 'FREESHIP', type: 'ship', value: 0, expiry: '2026-03-31', active: true }
        ],
        flashSales: [
          { id: 'fs1', title: 'Flash áo sơ mi', start: '2026-03-25T08:00', end: '2026-03-25T23:59', discount: 15 },
          { id: 'fs2', title: 'Weekend váy', start: '2026-03-28T00:00', end: '2026-03-30T23:59', discount: 25 }
        ],
        combos: [
          { id: 'cb1', name: 'Set công sở', productIds: ['p1', 'p2'], price: 1890000, note: 'Tiết kiệm 12%' }
        ]
      });
    }
    if (!read(K.logs, null)) {
      write(K.logs, [
        { at: new Date().toISOString(), level: 'info', message: 'Khởi tạo dữ liệu demo bảng điều khiển', user: 'system' }
      ]);
    }
    if (!read(K.losses, null)) {
      write(K.losses, []);
    }
  }

  function catLabel (id) {
    var cats = read(K.categories, []);
    var c = cats.find(function (x) { return x.id === id; });
    return c ? c.name : id;
  }

  /** Options + optgroup cho select danh mục (nhóm theo cấp cha). */
  function buildCategorySelectOptions (cats, selectedId) {
    selectedId = selectedId || '';
    var roots = cats.filter(function (c) { return !c.parent; });
    var html = '';
    var used = {};
    roots.forEach(function (r) {
      var children = cats.filter(function (c) { return c.parent === r.id; });
      if (children.length) {
        html += '<optgroup label="' + esc(r.name) + '">';
        children.forEach(function (ch) {
          used[ch.id] = true;
          html += '<option value="' + esc(ch.id) + '"' + (ch.id === selectedId ? ' selected' : '') + '>' + esc(ch.name) + '</option>';
        });
        html += '</optgroup>';
      } else {
        used[r.id] = true;
        html += '<option value="' + esc(r.id) + '"' + (r.id === selectedId ? ' selected' : '') + '>' + esc(r.name) + '</option>';
      }
    });
    cats.forEach(function (c) {
      if (!used[c.id]) {
        html += '<option value="' + esc(c.id) + '"' + (c.id === selectedId ? ' selected' : '') + '>' + esc(c.name) + '</option>';
      }
    });
    return html || '<option value="">— Chưa có danh mục —</option>';
  }

  function productName (id) {
    var p = read(K.products, []).find(function (x) { return x.id === id; });
    if (!p) return id;
    if (p.deletedAt || p.isDeleted) return p.name + ' (đã xóa)';
    return p.name;
  }

  function productUnitPrice (productId) {
    var p = read(K.products, []).find(function (x) { return x.id === productId; });
    if (!p) return 0;
    var sale = p.salePrice;
    if (sale != null && sale !== '' && !isNaN(Number(sale))) return Number(sale);
    return Number(p.price) || 0;
  }

  function getOrderLineItems (o) {
    if (!o) return [];
    if (Array.isArray(o.lineItems) && o.lineItems.length) {
      return o.lineItems.map(function (l) {
        var q = parseInt(l.qty, 10) || 1;
        var unit = l.unitPrice != null ? Number(l.unitPrice) : 0;
        var lt = l.lineTotal != null ? Number(l.lineTotal) : q * unit;
        if (!unit && lt) unit = Math.round(lt / q);
        return { name: l.name || 'Sản phẩm', variant: l.variant || '', qty: q, unitPrice: unit, lineTotal: lt };
      });
    }
    if (typeof o.items === 'string' && o.items.trim()) {
      return [{ name: o.items.trim(), variant: '', qty: 1, unitPrice: Number(o.total) || 0, lineTotal: Number(o.total) || 0 }];
    }
    return [];
  }

  function formatOrderAddress (o) {
    var a = o && o.address;
    if (!a) return '—';
    if (typeof a === 'string') return a;
    var parts = [];
    if (a.address) parts.push(a.address);
    if (a.ward) parts.push('P/X: ' + a.ward);
    if (a.district) parts.push('Q/H: ' + a.district);
    if (a.province) parts.push(a.province);
    return parts.length ? parts.join(' · ') : '—';
  }

  var LOSS_REASON_VI = {
    damage: 'Hỏng / vỡ',
    expired: 'Hết hạn / lỗi CL',
    theft: 'Thất thoát / mất',
    count: 'Kiểm kê lệch',
    other: 'Khác'
  };

  function lossReasonLabel (code) {
    return LOSS_REASON_VI[code] || code || '—';
  }

  function fillLossSkuSelect () {
    var sel = document.getElementById('lossInvId');
    if (!sel) return;
    var inv = read(K.inventory, []);
    var prev = sel.value;
    if (!inv.length) {
      sel.innerHTML = '<option value="">— Chưa có dòng tồn kho —</option>';
      return;
    }
    sel.innerHTML = inv.map(function (r) {
      var label = productName(r.productId) + ' — ' + r.size + ' / ' + r.color + ' (tồn ' + r.qty + ')';
      return '<option value="' + esc(r.id) + '">' + esc(label) + '</option>';
    }).join('');
    if (prev && inv.some(function (x) { return x.id === prev; })) sel.value = prev;
  }

  function renderLosses () {
    var tbody = document.querySelector('#tableLosses tbody');
    if (!tbody) return;
    var rows = read(K.losses, []);
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="admin-hint">Chưa có bản ghi tổn thất.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      return '<tr><td>' + esc(r.at) + '</td><td>' + esc(r.productName || '') + '</td><td>' + esc(r.size || '') + '</td><td>' +
        esc(r.color || '') + '</td><td>' + esc(String(r.qty)) + '</td><td>' + esc(lossReasonLabel(r.reason)) + '</td><td>' +
        esc(money(r.valueEstimated || 0)) + '</td><td>' + esc(r.note || '') + '</td></tr>';
    }).join('');
  }

  function renderOverview () {
    var products = read(K.products, []);
    var activeProducts = products.filter(function (p) { return !(p.deletedAt || p.isDeleted); });
    var inv = read(K.inventory, []);
    var orders = read(K.orders, []);
    var low = inv.filter(function (r) { return r.qty <= r.min; });
    var revenue = orders.filter(function (o) { return o.status === 'completed'; })
      .reduce(function (s, o) { return s + o.total; }, 0);
    var el = document.getElementById('dashOverview');
    if (!el) return;
    el.innerHTML =
      '<div class="admin-stat-row">' +
      '<article class="admin-stat-card"><span>Doanh thu (hoàn tất)</span><strong>' + esc(money(revenue)) + '</strong></article>' +
      '<article class="admin-stat-card"><span>Sản phẩm</span><strong>' + activeProducts.length + '</strong></article>' +
      '<article class="admin-stat-card"><span>Đơn đang xử lý</span><strong>' +
      orders.filter(function (o) { return o.status === 'processing' || o.status === 'shipping'; }).length +
      '</strong></article>' +
      '<article class="admin-stat-card admin-stat-card--warn"><span>Cảnh báo tồn thấp</span><strong>' + low.length + '</strong></article>' +
      '</div>' +
      '<p class="admin-hint">Dữ liệu lưu cục bộ trên trình duyệt (demo). Thao tác sẽ ghi log hệ thống.</p>';
  }

  function renderProducts () {
    var products = read(K.products, []);
    var tbody = document.querySelector('#tableProducts tbody');
    if (!tbody) return;
    tbody.innerHTML = products.map(function (p) {
      var isDel = !!(p.deletedAt || p.isDeleted);
      var status = isDel ? ' <span class="badge-warn">Đã xóa</span>' : '';
      var actions = '';
      // Staff vẫn có thể "Sửa" nếu SP chưa bị xóa mềm.
      if (!isDel) {
        actions += '<button type="button" class="btn-text" data-act="edit-product" data-id="' + esc(p.id) + '">Sửa</button>';
      }
      if (IS_ADMIN) {
        if (isDel) {
          actions += ' <button type="button" class="btn-text" data-act="restore-product" data-id="' + esc(p.id) + '">Khôi phục</button>';
        } else {
          actions += ' <button type="button" class="btn-text-danger" data-act="del-product" data-id="' + esc(p.id) + '">Xóa</button>';
        }
      }
      return '<tr><td>' + esc(p.id) + '</td><td>' + esc(p.name) + status + '</td><td>' + esc(catLabel(p.cat)) + '</td><td>' +
        esc((p.sizes || []).join(', ')) + '</td><td>' + esc((p.colors || []).join(', ')) + '</td><td>' + esc(money(p.price)) + '</td><td>' +
        (p.salePrice ? esc(money(p.salePrice)) : '—') + '</td><td>' + esc(String(p.images)) + ' ảnh</td><td>' + actions + '</td></tr>';
    }).join('');
  }

  function renderCategories () {
    var cats = read(K.categories, []);
    var roots = cats.filter(function (c) { return !c.parent; });
    var el = document.getElementById('categoryTree');
    if (!el) return;
    el.innerHTML = roots.map(function (r) {
      var children = cats.filter(function (c) { return c.parent === r.id; });
      return '<div class="admin-tree-node"><strong>' + esc(r.name) + '</strong>' +
        '<ul>' + children.map(function (ch) {
          return '<li>' + esc(ch.name) + ' <code>' + esc(ch.id) + '</code></li>';
        }).join('') + '</ul></div>';
    }).join('');
  }

  function renderInventory () {
    var inv = read(K.inventory, []);
    var products = read(K.products, []).filter(function (p) { return !(p.deletedAt || p.isDeleted); });
    var tbody = document.querySelector('#tableInventory tbody');
    if (!tbody) return;
    if (!inv.length || !products.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="admin-hint">Chưa có dòng tồn kho.</td></tr>';
      fillLossSkuSelect();
      renderLosses();
      return;
    }

    function uniq (arr) {
      var seen = {};
      return (arr || []).filter(function (x) {
        var k = String(x || '').trim();
        if (!k) return false;
        if (seen[k]) return false;
        seen[k] = true;
        return true;
      });
    }

    tbody.innerHTML = products.map(function (p) {
      var vars = inv.filter(function (r) { return r.productId === p.id; });
      if (!vars.length) return '';
      var sizes = uniq(vars.map(function (r) { return r.size; }));
      var pick = invUiChoice[p.id] || {};
      var selSize = sizes.indexOf(pick.size) >= 0 ? pick.size : sizes[0];
      var colors = uniq(vars.filter(function (r) { return r.size === selSize; }).map(function (r) { return r.color; }));
      var selColor = colors.indexOf(pick.color) >= 0 ? pick.color : colors[0];
      var current = vars.find(function (r) { return r.size === selSize && r.color === selColor; }) || vars[0];
      if (!current) return '';
      invUiChoice[p.id] = { size: current.size, color: current.color };
      var rowClass = current.qty <= current.min ? 'admin-row-warn' : '';
      var sizeOpts = sizes.map(function (s) {
        return '<option value="' + esc(s) + '"' + (s === current.size ? ' selected' : '') + '>' + esc(s) + '</option>';
      }).join('');
      var colorOpts = colors.map(function (c) {
        return '<option value="' + esc(c) + '"' + (c === current.color ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('');
      return '<tr' + (rowClass ? ' class="' + rowClass + '"' : '') + '><td>' + esc(productName(p.id)) + '</td><td>' +
        '<select class="admin-input-inline admin-inv-size" data-product="' + esc(p.id) + '">' + sizeOpts + '</select></td><td>' +
        '<select class="admin-input-inline admin-inv-color" data-product="' + esc(p.id) + '">' + colorOpts + '</select></td><td>' +
        '<input type="number" min="0" class="admin-input-inline" data-inv-qty-product="' + esc(p.id) + '" value="' + esc(String(current.qty)) + '" aria-label="Tồn"></td><td>' +
        '<input type="number" min="0" class="admin-input-inline" data-inv-min-product="' + esc(p.id) + '" value="' + esc(String(current.min)) + '" aria-label="Ngưỡng"></td><td>' +
        (current.qty === 0 ? '<span class="badge-warn">Hết hàng</span>' : (current.qty <= current.min ? '<span class="badge-warn">Sắp hết</span>' : 'OK')) +
        '</td><td><button type="button" class="btn btn-secondary-modern btn-sm" data-act="save-inventory" data-id="' + esc(p.id) + '">Lưu</button></td></tr>';
    }).join('');
    fillLossSkuSelect();
    renderLosses();
  }

  function saveInventoryRow (productId) {
    var inv = read(K.inventory, []);
    var sizeEl = document.querySelector('.admin-inv-size[data-product="' + String(productId).replace(/"/g, '') + '"]');
    var colorEl = document.querySelector('.admin-inv-color[data-product="' + String(productId).replace(/"/g, '') + '"]');
    if (!sizeEl || !colorEl) return;
    var size = sizeEl.value;
    var color = colorEl.value;
    var idx = inv.findIndex(function (x) { return x.productId === productId && x.size === size && x.color === color; });
    if (idx < 0) return;
    var qEl = document.querySelector('[data-inv-qty-product="' + String(productId).replace(/"/g, '') + '"]');
    var mEl = document.querySelector('[data-inv-min-product="' + String(productId).replace(/"/g, '') + '"]');
    var q = qEl ? parseInt(qEl.value, 10) : inv[idx].qty;
    var m = mEl ? parseInt(mEl.value, 10) : inv[idx].min;
    if (isNaN(q) || q < 0) q = 0;
    if (isNaN(m) || m < 0) m = 0;
    inv[idx].qty = q;
    inv[idx].min = m;
    write(K.inventory, inv);
    pushLog('Cập nhật tồn kho ' + productId + ' [' + size + '/' + color + '] → tồn ' + q + ', ngưỡng ' + m, 'info');
    renderInventory();
    renderLosses();
    renderOverview();
    if (window.showNotification) showNotification('Đã lưu tồn kho', 'success');
  }

  function submitInventoryLoss (ev) {
    ev.preventDefault();
    var sel = document.getElementById('lossInvId');
    var qtyEl = document.getElementById('lossQty');
    var reasonEl = document.getElementById('lossReason');
    var noteEl = document.getElementById('lossNote');
    var dedEl = document.getElementById('lossDeductStock');
    if (!sel || !sel.value || !qtyEl) return;
    var inv = read(K.inventory, []);
    var row = inv.find(function (x) { return x.id === sel.value; });
    if (!row) return;
    var qty = parseInt(qtyEl.value, 10) || 0;
    if (qty < 1) {
      if (window.showNotification) showNotification('Số lượng tổn thất phải ≥ 1', 'error');
      return;
    }
    var unit = productUnitPrice(row.productId);
    var valEst = unit * qty;
    var entry = {
      id: 'loss-' + Date.now(),
      at: new Date().toISOString(),
      invId: row.id,
      productId: row.productId,
      productName: productName(row.productId),
      size: row.size,
      color: row.color,
      qty: qty,
      reason: reasonEl ? reasonEl.value : 'other',
      note: noteEl && noteEl.value.trim() ? noteEl.value.trim() : '',
      valueEstimated: valEst,
      deductedStock: !!(dedEl && dedEl.checked)
    };
    if (entry.deductedStock) {
      row.qty = Math.max(0, (parseInt(row.qty, 10) || 0) - entry.qty);
    }
    write(K.inventory, inv);
    var losses = read(K.losses, []);
    losses.unshift(entry);
    write(K.losses, losses);
    pushLog('Tổn thất kho: ' + entry.productName + ' ×' + qty + ' (' + lossReasonLabel(entry.reason) + ')', 'warning');
    if (ev.target) ev.target.reset();
    var rd = document.getElementById('lossDeductStock');
    if (rd) rd.checked = true;
    var q0 = document.getElementById('lossQty');
    if (q0) q0.value = '1';
    renderInventory();
    renderLosses();
    renderOverview();
    renderReports();
    if (window.showNotification) showNotification('Đã ghi nhận tổn thất', 'success');
  }

  function renderOrders () {
    var orders = read(K.orders, []);
    var tbody = document.querySelector('#tableOrders tbody');
    if (!tbody) return;
    var statuses = ['pending', 'processing', 'shipping', 'completed', 'cancelled'];
    var statusVi = {
      pending: 'Chờ xác nhận',
      processing: 'Đang xử lý',
      shipping: 'Đang giao',
      completed: 'Hoàn tất',
      cancelled: 'Đã hủy'
    };
    ensureOrderFilterControl(statusVi);
    var filterStatus = getOrderFilterValue();
    var filtered = filterStatus === 'all'
      ? orders
      : orders.filter(function (o) { return o.status === filterStatus; });
    tbody.innerHTML = filtered.map(function (o) {
      var opts = statuses.map(function (s) {
        return '<option value="' + esc(s) + '"' + (o.status === s ? ' selected' : '') + '>' + esc(statusVi[s] || s) + '</option>';
      }).join('');
      var confirmBtn = o.status === 'pending'
        ? ' <button type="button" class="btn btn-secondary-modern btn-sm" data-act="order-confirm" data-id="' + esc(o.id) + '">Đã xác nhận</button>'
        : '';
      return '<tr data-order-id="' + esc(o.id) + '"><td>' + esc(o.id) + '</td><td>' + esc(o.customer) + '</td><td>' + esc(o.email) + '</td><td>' +
        esc(money(o.total)) + '</td><td><select class="admin-order-status" data-id="' + esc(o.id) + '">' + opts + '</select></td><td>' + esc(o.date) + '</td>' +
        '<td><button type="button" class="btn btn-secondary-modern btn-sm" data-act="order-detail" data-id="' + esc(o.id) + '">Chi tiết</button> ' +
        '<button type="button" class="btn btn-secondary-modern btn-sm" data-act="print-invoice" data-id="' + esc(o.id) + '">In phiếu giao</button>' +
        confirmBtn + '</td></tr>';
    }).join('');
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="admin-hint">Không có đơn theo bộ lọc đã chọn.</td></tr>';
    }
  }

  function getOrderFilterValue () {
    var sel = document.getElementById('ordersStatusFilter');
    if (!sel) return 'all';
    return String(sel.value || 'all');
  }

  function ensureOrderFilterControl (statusVi) {
    var table = document.getElementById('tableOrders');
    if (!table) return;
    var wrap = table.parentElement;
    if (!wrap) return;
    var existing = document.getElementById('ordersFilterBar');
    if (existing) return;

    var bar = document.createElement('div');
    bar.id = 'ordersFilterBar';
    bar.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px;';
    var sel = document.createElement('select');
    sel.id = 'ordersStatusFilter';
    sel.className = 'admin-input-inline';
    sel.style.minWidth = '220px';
    sel.innerHTML =
      '<option value="all">Tất cả trạng thái</option>' +
      '<option value="pending">' + esc(statusVi.pending) + '</option>' +
      '<option value="processing">' + esc(statusVi.processing) + '</option>' +
      '<option value="shipping">' + esc(statusVi.shipping) + '</option>' +
      '<option value="completed">' + esc(statusVi.completed) + '</option>' +
      '<option value="cancelled">' + esc(statusVi.cancelled) + '</option>';
    sel.addEventListener('change', function () {
      renderOrders();
    });
    bar.appendChild(sel);
    wrap.parentNode.insertBefore(bar, wrap);
  }

  function syncCustomersFromOrders () {
    var customers = read(K.customers, []);
    var orders = read(K.orders, []);
    var byEmail = {};

    customers.forEach(function (c) {
      var em = String(c.email || '').trim().toLowerCase();
      if (!em) return;
      // Reset thống kê mỗi lần đồng bộ để tránh cộng dồn sai.
      byEmail[em] = Object.assign({}, c, {
        orders: 0,
        spent: 0
      });
    });

    orders.forEach(function (o) {
      var em = String(o.email || '').trim().toLowerCase();
      if (!em) return;
      if (!byEmail[em]) {
        byEmail[em] = {
          id: 'c' + Date.now() + Math.floor(Math.random() * 1000),
          name: o.customer || em,
          email: em,
          tier: 'regular',
          orders: 0,
          spent: 0
        };
      }
      // Chỉ cập nhật số đơn + tổng chi khi đơn hoàn tất.
      if (o.status === 'completed') {
        byEmail[em].orders = (Number(byEmail[em].orders) || 0) + 1;
        byEmail[em].spent = (Number(byEmail[em].spent) || 0) + (Number(o.total) || 0);
      }
    });

    var merged = Object.keys(byEmail).map(function (k) { return byEmail[k]; });
    merged.sort(function (a, b) { return (Number(b.spent) || 0) - (Number(a.spent) || 0); });
    write(K.customers, merged);
  }

  function renderCustomers () {
    syncCustomersFromOrders();
    var customers = read(K.customers, []);
    var tbody = document.querySelector('#tableCustomers tbody');
    if (!tbody) return;
    tbody.innerHTML = customers.map(function (c) {
      var tierLabel = c.tier === 'vip' ? 'VIP' : 'Thường';
      var tierSel = IS_ADMIN
        ? '<select class="admin-tier" data-id="' + esc(c.id) + '">' +
          '<option value="regular"' + (c.tier === 'regular' ? ' selected' : '') + '>Thường</option>' +
          '<option value="vip"' + (c.tier === 'vip' ? ' selected' : '') + '>VIP</option></select>'
        : esc(tierLabel);
      return '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.email) + '</td><td>' + tierSel + '</td><td>' + esc(String(c.orders)) + '</td><td>' +
        esc(money(c.spent)) + '</td><td><button type="button" class="btn-text" data-act="cust-history" data-email="' + esc(c.email) + '">Lịch sử & hoạt động</button></td></tr>';
    }).join('');
  }

  function renderPromos () {
    var p = read(K.promos, { coupons: [], flashSales: [], combos: [] });
    var cup = document.getElementById('promoCoupons');
    var fl = document.getElementById('promoFlash');
    var cb = document.getElementById('promoCombos');
    if (cup) {
      cup.innerHTML = '<table class="admin-table"><thead><tr><th>Mã</th><th>Loại</th><th>Giá trị</th><th>Hết hạn</th><th>Trạng thái</th></tr></thead><tbody>' +
        p.coupons.map(function (c) {
          return '<tr><td>' + esc(c.code) + '</td><td>' + esc(c.type) + '</td><td>' + esc(String(c.value)) + '</td><td>' + esc(c.expiry) + '</td><td>' +
            (c.active ? 'Hoạt động' : 'Tắt') + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    if (fl) {
      fl.innerHTML = '<ul class="admin-list">' + p.flashSales.map(function (f) {
        return '<li><strong>' + esc(f.title) + '</strong> — giảm ' + esc(String(f.discount)) + '% · ' + esc(f.start) + ' → ' + esc(f.end) + '</li>';
      }).join('') + '</ul>';
    }
    if (cb) {
      cb.innerHTML = '<ul class="admin-list">' + p.combos.map(function (x) {
        return '<li><strong>' + esc(x.name) + '</strong> — ' + esc(money(x.price)) + ' · ' + esc(x.note) + '</li>';
      }).join('') + '</ul>';
    }
  }

  function renderReports () {
    var orders = read(K.orders, []);
    var products = read(K.products, []);
    var activeProducts = products.filter(function (p) { return !(p.deletedAt || p.isDeleted); });
    var inv = read(K.inventory, []);
    var losses = read(K.losses, []);
    var cancelled = orders.filter(function (o) { return o.status === 'cancelled'; }).length;
    var revenue = orders.filter(function (o) { return o.status === 'completed'; }).reduce(function (s, o) { return s + o.total; }, 0);
    var lossVal = losses.reduce(function (s, x) { return s + (Number(x.valueEstimated) || 0); }, 0);
    var lossQty = losses.reduce(function (s, x) { return s + (parseInt(x.qty, 10) || 0); }, 0);
    var el = document.getElementById('dashReports');
    if (!el) return;
    el.innerHTML =
      '<div class="admin-report-grid">' +
      '<article><h4>Doanh thu (hoàn tất)</h4><p class="admin-report-num">' + esc(money(revenue)) + '</p></article>' +
      '<article><h4>Đơn hủy</h4><p class="admin-report-num">' + cancelled + '</p></article>' +
      '<article><h4>SKU tồn thấp / hết</h4><p class="admin-report-num">' + inv.filter(function (r) { return r.qty <= r.min; }).length + '</p></article>' +
      '<article><h4>Sản phẩm (danh mục)</h4><p class="admin-report-num">' + activeProducts.length + '</p></article>' +
      '<article><h4>Tổn thất (số lần ghi nhận)</h4><p class="admin-report-num">' + losses.length + '</p></article>' +
      '<article><h4>Tổn thất (SL đơn vị)</h4><p class="admin-report-num">' + lossQty + '</p></article>' +
      '<article><h4>Giá trị tổn thất (ước tính)</h4><p class="admin-report-num">' + esc(money(lossVal)) + '</p></article>' +
      '</div>' +
      '<p class="admin-hint">Bán chạy (demo): sắp xếp theo có khuyến mãi — ' +
      activeProducts.filter(function (p) { return p.salePrice; }).map(function (p) { return esc(p.name); }).join(', ') + '</p>';
  }

  function renderCharts () {
    var el = document.getElementById('dashCharts');
    if (!el) return;
    var orders = read(K.orders, []);
    var losses = read(K.losses, []);
    var revenue = orders.filter(function (o) { return o.status === 'completed'; })
      .reduce(function (s, o) { return s + (Number(o.total) || 0); }, 0);
    var lossVal = losses.reduce(function (s, x) { return s + (Number(x.valueEstimated) || 0); }, 0);
    var total = revenue + lossVal;
    var revPct = total > 0 ? Math.round((revenue / total) * 100) : 0;
    var lossPct = total > 0 ? (100 - revPct) : 0;
    var chartBg = total > 0
      ? ('conic-gradient(#10b981 0 ' + revPct + '%, #ef4444 ' + revPct + '% 100%)')
      : 'conic-gradient(#d1d5db 0 100%)';
    var centerText = total > 0 ? (revPct + '%') : '0%';
    var statusMeta = [
      { key: 'pending', label: 'Chờ xác nhận' },
      { key: 'processing', label: 'Đang xử lý' },
      { key: 'shipping', label: 'Đang giao' },
      { key: 'completed', label: 'Hoàn tất' },
      { key: 'cancelled', label: 'Đã hủy' }
    ];
    var statusCounts = statusMeta.map(function (s) {
      return orders.filter(function (o) { return o.status === s.key; }).length;
    });
    var maxY = statusCounts.reduce(function (mx, n) { return Math.max(mx, n); }, 0);
    if (maxY < 1) maxY = 1;
    var svgW = 540;
    var svgH = 220;
    var padL = 36;
    var padR = 20;
    var padT = 20;
    var padB = 44;
    var usableW = svgW - padL - padR;
    var usableH = svgH - padT - padB;
    var points = statusCounts.map(function (v, i) {
      var x = padL + (i * (usableW / Math.max(1, statusCounts.length - 1)));
      var y = padT + ((maxY - v) / maxY) * usableH;
      return { x: x, y: y, v: v };
    });
    var polyline = points.map(function (p) { return p.x.toFixed(2) + ',' + p.y.toFixed(2); }).join(' ');
    var xLabels = statusMeta.map(function (s, i) {
      var x = padL + (i * (usableW / Math.max(1, statusMeta.length - 1)));
      return '<text x="' + x.toFixed(2) + '" y="' + (svgH - 16) + '" text-anchor="middle" font-size="11" fill="#6b7280">' + esc(s.label) + '</text>';
    }).join('');
    var dots = points.map(function (p) {
      return '<circle cx="' + p.x.toFixed(2) + '" cy="' + p.y.toFixed(2) + '" r="4" fill="#2563eb"></circle>' +
        '<text x="' + p.x.toFixed(2) + '" y="' + (p.y - 10).toFixed(2) + '" text-anchor="middle" font-size="11" fill="#111827">' + esc(String(p.v)) + '</text>';
    }).join('');
    var axis =
      '<line x1="' + padL + '" y1="' + (padT + usableH) + '" x2="' + (padL + usableW) + '" y2="' + (padT + usableH) + '" stroke="#d1d5db"></line>' +
      '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (padT + usableH) + '" stroke="#d1d5db"></line>';
    var lineChartHtml =
      '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" width="100%" height="260" role="img" aria-label="Biểu đồ đường số đơn theo trạng thái">' +
        axis +
        '<polyline points="' + polyline + '" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>' +
        dots +
        xLabels +
      '</svg>';

    el.innerHTML =
      '<div class="admin-form-card" style="margin-top:14px">' +
        '<h3 style="margin-top:0">Biểu đồ tròn doanh thu và tổn thất hàng hỏng</h3>' +
        '<div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap">' +
          '<div style="position:relative;width:220px;height:220px;border-radius:50%;background:' + chartBg + '">' +
            '<div style="position:absolute;inset:22px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:28px">' +
              esc(centerText) +
            '</div>' +
          '</div>' +
          '<div style="display:grid;gap:10px;min-width:260px">' +
            '<div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#10b981;margin-right:8px"></span>' +
              'Doanh thu: <strong>' + esc(money(revenue)) + '</strong> (' + esc(String(revPct)) + '%)</div>' +
            '<div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ef4444;margin-right:8px"></span>' +
              'Tổn thất hàng hỏng: <strong>' + esc(money(lossVal)) + '</strong> (' + esc(String(lossPct)) + '%)</div>' +
            '<p class="admin-hint" style="margin:4px 0 0">Tỷ lệ tính trên tổng doanh thu + tổng tổn thất ước tính.</p>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="admin-form-card" style="margin-top:14px">' +
        '<h3 style="margin-top:0">Biểu đồ đường số đơn theo trạng thái</h3>' +
        lineChartHtml +
      '</div>';
  }

  function renderSystem () {
    var logs = read(K.logs, []).slice(0, 50);
    var logEl = document.getElementById('systemLogs');
    if (logEl) {
      logEl.innerHTML = '<table class="admin-table admin-table--compact"><thead><tr><th>Thời gian</th><th>Mức</th><th>Người</th><th>Nội dung</th></tr></thead><tbody>' +
        logs.map(function (l) {
          return '<tr><td>' + esc(l.at) + '</td><td>' + esc(l.level) + '</td><td>' + esc(l.user) + '</td><td>' + esc(l.message) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    var roleNote = document.getElementById('systemRolesNote');
    if (roleNote) {
      roleNote.textContent = IS_ADMIN
        ? 'Bạn đang dùng tài khoản Admin — đầy đủ quyền cấu hình, sao lưu và phân quyền.'
        : 'Bạn đang dùng tài khoản Staff — được thêm và sửa sản phẩm (gán danh mục, giá, ảnh); không xóa sản phẩm, không thêm danh mục/coupon/sao lưu.';
    }
  }

  function renderStaffRoles () {
    var tbody = document.querySelector('#tableStaffRoles tbody');
    if (!tbody) return;
    if (!window.ModevaAuth || typeof ModevaAuth.getStaffUsers !== 'function') return;

    var list = ModevaAuth.getStaffUsers();
    var positions = [
      { id: 'sales', label: 'Bán hàng' },
      { id: 'inventory', label: 'Kho hàng' },
      { id: 'orders', label: 'Đơn hàng' },
      { id: 'support', label: 'CSKH' },
      { id: 'manager', label: 'Trưởng nhóm' }
    ];

    tbody.innerHTML = (list || []).map(function (s) {
      var opts = positions.map(function (p) {
        var selected = (s.staffPosition || 'sales') === p.id ? ' selected' : '';
        return '<option value="' + esc(p.id) + '"' + selected + '>' + esc(p.label) + '</option>';
      }).join('');

      return '<tr>' +
        '<td>' + esc(s.name) + '</td>' +
        '<td>' + esc(s.email) + '</td>' +
        '<td>' +
          '<select class="admin-staff-role" data-email="' + esc(s.email) + '">' + opts + '</select>' +
        '</td>' +
        '<td><span class="badge-warn">Staff</span></td>' +
        '</tr>';
    }).join('');
  }

  function showOrderDetail (id) {
    var o = read(K.orders, []).find(function (x) { return x.id === id; });
    var modal = document.getElementById('adminModal');
    var body = document.getElementById('adminModalBody');
    if (!modal || !body || !o) return;
    var lines = getOrderLineItems(o);
    var rows = lines.map(function (l, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(l.name) + '</td><td>' + esc(l.variant) + '</td><td>' + esc(String(l.qty)) + '</td><td>' +
        esc(money(l.unitPrice)) + '</td><td>' + esc(money(l.lineTotal)) + '</td></tr>';
    }).join('');
    var addrBlock = '<p class="admin-hint"><strong>Địa chỉ giao:</strong> ' + esc(formatOrderAddress(o)) + '</p>';
    var phoneLine = o.phone ? '<p>Điện thoại: ' + esc(o.phone) + '</p>' : '';
    var cancelLine = o.cancelReason
      ? '<p class="admin-hint"><strong>Lý do hủy:</strong> ' + esc(o.cancelReason) + (o.cancelledAt ? (' · ' + esc(o.cancelledAt)) : '') + '</p>'
      : '';
    body.innerHTML = '<h3>Đơn ' + esc(o.id) + '</h3>' +
      '<p>Khách: <strong>' + esc(o.customer) + '</strong> · ' + esc(o.email) + '</p>' + phoneLine + addrBlock +
      '<p>Tổng: ' + esc(money(o.total)) + ' · Trạng thái: ' + esc(o.status) + ' · Ngày: ' + esc(o.date || '') + '</p>' +
      cancelLine +
      (o.note ? '<p>Ghi chú đơn: ' + esc(o.note) + '</p>' : '') +
      '<table class="admin-table admin-table--compact" style="margin-top:12px"><thead><tr><th>#</th><th>Sản phẩm</th><th>Phân loại</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="6">—</td></tr>') + '</tbody></table>';
    modal.hidden = false;
  }

  function showCustomerHistory (email) {
    var em = String(email || '').toLowerCase();
    var dashOrders = read(K.orders, []).filter(function (o) { return String(o.email || '').toLowerCase() === em; });
    var custOrders = [];
    if (window.ModevaAuth && typeof ModevaAuth.getCustomerOrders === 'function') {
      custOrders = ModevaAuth.getCustomerOrders(email);
    }
    var seen = {};
    var merged = [];
    dashOrders.forEach(function (o) {
      var oid = o.id;
      if (seen[oid]) return;
      seen[oid] = true;
      merged.push({ id: oid, total: o.total, status: o.status, date: o.date || '', source: 'Đơn quản trị' });
    });
    (custOrders || []).forEach(function (o) {
      var oid = o.orderId;
      if (seen[oid]) return;
      seen[oid] = true;
      merged.push({ id: oid, total: o.total, status: o.status, date: (o.createdAt || '').slice(0, 10), source: 'Tài khoản khách' });
    });
    merged.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });

    var logs = read(K.logs, []);
    var activity = logs.filter(function (l) {
      var u = String(l.user || '').toLowerCase();
      var m = String(l.message || '').toLowerCase();
      return u.indexOf(em) >= 0 || m.indexOf(em) >= 0;
    }).slice(0, 30);

    var modal = document.getElementById('adminModal');
    var body = document.getElementById('adminModalBody');
    if (!modal || !body) return;
    var ordHtml = merged.length
      ? '<ul class="admin-list">' + merged.map(function (x) {
        return '<li><strong>' + esc(x.id) + '</strong> — ' + esc(money(x.total)) + ' — ' + esc(x.status) + ' — ' + esc(x.date) +
          ' <span class="admin-hint">(' + esc(x.source) + ')</span></li>';
      }).join('') + '</ul>'
      : '<p class="admin-hint">Chưa có đơn trong bảng quản trị / tài khoản khách.</p>';
    var actHtml = activity.length
      ? '<table class="admin-table admin-table--compact"><thead><tr><th>Thời gian</th><th>Mức</th><th>Người</th><th>Nội dung</th></tr></thead><tbody>' +
        activity.map(function (l) {
          return '<tr><td>' + esc(l.at) + '</td><td>' + esc(l.level) + '</td><td>' + esc(l.user) + '</td><td>' + esc(l.message) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<p class="admin-hint">Chưa có dòng nhật ký khớp email này.</p>';

    var profileHint = '';
    if (window.ModevaAuth && typeof ModevaAuth.getCustomerProfile === 'function') {
      var prof = ModevaAuth.getCustomerProfile(email);
      if (prof) {
        profileHint = '<p class="admin-hint">Hồ sơ demo: đã hoàn tất <strong>' + esc(String(prof.ordersCompleted || 0)) + '</strong> đơn (theo thống kê tài khoản).</p>';
      }
    }

    body.innerHTML = '<h3>Khách — ' + esc(email) + '</h3>' + profileHint +
      '<h4 class="admin-subtitle">Đơn đã mua</h4>' + ordHtml +
      '<h4 class="admin-subtitle">Hoạt động &amp; nhật ký (theo email)</h4>' + actHtml;
    modal.hidden = false;
  }

  function printInvoice (id) {
    var o = read(K.orders, []).find(function (x) { return x.id === id; });
    if (!o) return;
    var lines = getOrderLineItems(o);
    var totalQty = (lines || []).reduce(function (s, l) { return s + (parseInt(l.qty, 10) || 0); }, 0);

    try {
      localStorage.setItem('modeva_shipping_label_order', JSON.stringify({
        order: o,
        lineItems: lines,
        totalQty: totalQty
      }));
    } catch (e) {}

    // Chuyển sang trang mới để in nhãn/phiếu theo layout giống hình.
    var w = window.open('shipping-label.html?orderId=' + encodeURIComponent(id), '_blank');
    if (!w) {
      if (window.showNotification) showNotification('Trình duyệt chặn cửa sổ mới', 'warning');
      return;
    }
    pushLog('In phiếu giao (nhãn) ' + id, 'info');
  }

  function addProduct (ev) {
    ev.preventDefault();
    var name = document.getElementById('npName');
    var cat = document.getElementById('npCat');
    var sizes = document.getElementById('npSizes');
    var colors = document.getElementById('npColors');
    var price = document.getElementById('npPrice');
    var sale = document.getElementById('npSale');
    var img = document.getElementById('npImg');
    var imgUrl = document.getElementById('npImageUrl');
    var lineLb = document.getElementById('npLineLabel');
    if (!name || !cat || !price) return;
    var products = read(K.products, []);
    var id = 'p' + (Date.now() % 100000);
    var lineVal = lineLb && lineLb.value.trim();
    if (!lineVal && cat && cat.selectedIndex >= 0) {
      var opt = cat.options[cat.selectedIndex];
      lineVal = opt ? opt.textContent.trim() : '';
    }
    var npBadge = document.getElementById('npBadge');
    var badgeRaw = npBadge && npBadge.value ? npBadge.value.trim() : '';
    var prod = {
      id: id,
      name: name.value.trim(),
      cat: cat.value,
      sizes: (sizes.value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      colors: uniqueListKeepOrder((colors.value || '').split(',').map(function (s) { return s.trim(); })),
      price: parseInt(price.value, 10) || 0,
      salePrice: sale && sale.value ? parseInt(sale.value, 10) : null,
      images: img && img.value ? parseInt(img.value, 10) || 1 : 1,
      imageUrl: imgUrl && imgUrl.value.trim() ? imgUrl.value.trim() : '',
      lineLabel: lineVal || '',
      newest: Math.floor(Date.now() / 1000) % 100000
    };
    if (badgeRaw) prod.badge = badgeRaw;
    products.push(prod);
    write(K.products, products);
    pushLog('Thêm sản phẩm ' + id, 'info');
    ev.target.reset();
    renderProducts();
    renderOverview();
    if (window.showNotification) showNotification('Đã thêm sản phẩm', 'success');
  }

  function addCategory (ev) {
    ev.preventDefault();
    if (!IS_ADMIN) return;
    var n = document.getElementById('ncName');
    var p = document.getElementById('ncParent');
    if (!n) return;
    var cats = read(K.categories, []);
    var id = 'cat-' + (Date.now() % 100000);
    cats.push({ id: id, name: n.value.trim(), parent: p.value || null });
    write(K.categories, cats);
    pushLog('Thêm danh mục ' + id, 'info');
    ev.target.reset();
    renderCategories();
    fillCategorySelects();
    if (window.showNotification) showNotification('Đã thêm danh mục', 'success');
  }

  function fillCategorySelects () {
    var cats = read(K.categories, []);
    var sel = document.getElementById('npCat');
    var np = document.getElementById('ncParent');
    if (sel) {
      var cur = sel.value;
      sel.innerHTML = buildCategorySelectOptions(cats, cur);
      if (cur && !cats.some(function (c) { return c.id === cur; })) {
        sel.value = sel.options[0] ? sel.options[0].value : '';
      }
    }
    if (np) {
      np.innerHTML = '<option value="">— Cấp gốc (Nam/Nữ/Trẻ em) —</option>' +
        cats.filter(function (c) { return !c.parent; }).map(function (c) {
          return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
        }).join('');
    }
  }

  function openEditProductModal (id) {
    var products = read(K.products, []);
    var p = products.find(function (x) { return x.id === id; });
    if (!p) return;
    var cats = read(K.categories, []);
    var catInner = buildCategorySelectOptions(cats, p.cat);
    var b = p.badge;
    function optSel (val) {
      if (val === '') return b == null || b === '' || b === undefined;
      return b === val;
    }
    var badgeOpts =
      '<option value=""' + (optSel('') ? ' selected' : '') + '>Tự động (hiện % giảm nếu có KM)</option>' +
      '<option value="none"' + (optSel('none') ? ' selected' : '') + '>Không nhãn</option>' +
      '<option value="new"' + (optSel('new') ? ' selected' : '') + '>NEW</option>' +
      '<option value="hot"' + (optSel('hot') ? ' selected' : '') + '>HOT</option>' +
      '<option value="bestseller"' + (optSel('bestseller') ? ' selected' : '') + '>BEST SELLER</option>';

    var modal = document.getElementById('adminModal');
    var body = document.getElementById('adminModalBody');
    if (!modal || !body) return;

    body.innerHTML =
      '<h3>Cập nhật sản phẩm</h3>' +
      '<p class="admin-hint">Mã <code>' + esc(p.id) + '</code>. Đổi danh mục hoặc giá sẽ hiển thị trên trang Danh mục sau khi tải lại trang.</p>' +
      '<form id="formEditProduct" class="profile-form admin-edit-product-form">' +
      '<input type="hidden" id="epId" value="' + esc(p.id) + '">' +
      '<div class="grid-two">' +
      '<label>Tên <input type="text" id="epName" required value="' + esc(p.name) + '"></label>' +
      '<label>Danh mục <select id="epCat" required>' + catInner + '</select></label>' +
      '</div>' +
      '<div class="grid-two">' +
      '<label>Size (phẩy) <input type="text" id="epSizes" value="' + esc((p.sizes || []).join(', ')) + '"></label>' +
      '<label>Màu <input type="text" id="epColors" value="' + esc((p.colors || []).join(', ')) + '"></label>' +
      '</div>' +
      '<div class="grid-two">' +
      '<label>Giá (VNĐ) <input type="number" id="epPrice" min="0" required value="' + esc(String(Number(p.price) || 0)) + '"></label>' +
      '<label>Giá KM <input type="number" id="epSale" min="0" placeholder="Không KM" value="' +
      (p.salePrice != null && p.salePrice !== '' ? esc(String(Number(p.salePrice))) : '') + '"></label>' +
      '</div>' +
      '<div class="grid-two">' +
      '<label>URL ảnh <input type="url" id="epImageUrl" value="' + esc(p.imageUrl || '') + '"></label>' +
      '<label>Dòng phụ (catalog) <input type="text" id="epLineLabel" placeholder="VD: Nam • Áo nam" value="' + esc(p.lineLabel || '') + '"></label>' +
      '</div>' +
      '<div class="grid-two">' +
      '<label>Số ảnh <input type="number" id="epImg" min="1" value="' + esc(String(p.images != null ? p.images : 3)) + '"></label>' +
      '<label>Nhãn trên thẻ SP <select id="epBadge">' + badgeOpts + '</select></label>' +
      '</div>' +
      '<div class="admin-edit-actions" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:16px">' +
      '<button type="button" class="btn btn-secondary-modern" id="epCancel">Huỷ</button>' +
      '<button type="submit" class="btn btn-primary-modern">Lưu cập nhật</button>' +
      '</div></form>';

    modal.hidden = false;
    var cancel = document.getElementById('epCancel');
    if (cancel) {
      cancel.addEventListener('click', function () {
        modal.hidden = true;
      });
    }
  }

  function saveEditedProduct () {
    var idEl = document.getElementById('epId');
    if (!idEl) return;
    var id = idEl.value;
    var products = read(K.products, []);
    var idx = products.findIndex(function (x) { return x.id === id; });
    if (idx < 0) return;
    var p = products[idx];
    var name = document.getElementById('epName');
    var cat = document.getElementById('epCat');
    var sizes = document.getElementById('epSizes');
    var colors = document.getElementById('epColors');
    var price = document.getElementById('epPrice');
    var sale = document.getElementById('epSale');
    var imgUrl = document.getElementById('epImageUrl');
    var lineLb = document.getElementById('epLineLabel');
    var img = document.getElementById('epImg');
    var badgeEl = document.getElementById('epBadge');
    if (!name || !cat || !price) return;

    p.name = name.value.trim();
    p.cat = cat.value;
    p.sizes = (sizes && sizes.value ? sizes.value : '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    p.colors = uniqueListKeepOrder((colors && colors.value ? colors.value : '').split(',').map(function (s) { return s.trim(); }));
    p.price = parseInt(price.value, 10) || 0;
    p.salePrice = sale && sale.value !== '' ? parseInt(sale.value, 10) : null;
    p.imageUrl = imgUrl && imgUrl.value.trim() ? imgUrl.value.trim() : '';
    p.lineLabel = lineLb && lineLb.value.trim() ? lineLb.value.trim() : '';
    p.images = img && img.value ? parseInt(img.value, 10) || 1 : 1;
    var br = badgeEl ? badgeEl.value : '';
    if (br === '') delete p.badge;
    else p.badge = br;

    products[idx] = p;
    write(K.products, products);
    pushLog('Cập nhật sản phẩm ' + id + ' (danh mục: ' + catLabel(p.cat) + ')', 'info');
    var modal = document.getElementById('adminModal');
    if (modal) modal.hidden = true;
    renderProducts();
    renderOverview();
    renderReports();
    if (window.showNotification) showNotification('Đã cập nhật sản phẩm', 'success');
  }

  function addCoupon (ev) {
    ev.preventDefault();
    if (!IS_ADMIN) return;
    var code = document.getElementById('couponCode');
    var val = document.getElementById('couponVal');
    var exp = document.getElementById('couponExp');
    var promos = read(K.promos, { coupons: [], flashSales: [], combos: [] });
    promos.coupons.push({
      code: (code.value || '').trim().toUpperCase(),
      type: 'percent',
      value: parseInt(val.value, 10) || 10,
      expiry: exp.value || '2026-12-31',
      active: true
    });
    write(K.promos, promos);
    pushLog('Thêm coupon ' + code.value, 'info');
    ev.target.reset();
    renderPromos();
    if (window.showNotification) showNotification('Đã thêm coupon', 'success');
  }

  function backupData () {
    var bundle = {
      exportedAt: new Date().toISOString(),
      products: read(K.products, []),
      categories: read(K.categories, []),
      inventory: read(K.inventory, []),
      losses: read(K.losses, []),
      orders: read(K.orders, []),
      customers: read(K.customers, []),
      promos: read(K.promos, {}),
      logs: read(K.logs, [])
    };
    var blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'modeva-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    pushLog('Sao lưu dữ liệu (tải file JSON)', 'info');
    renderSystem();
    if (window.showNotification) showNotification('Đã tạo file sao lưu', 'success');
  }

  function navigate (target) {
    document.querySelectorAll('.admin-nav__item').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-dash-target') === target);
    });
    document.querySelectorAll('.admin-panel').forEach(function (p) {
      p.classList.toggle('is-active', p.id === 'panel-' + target);
    });
    if (target === 'overview') renderOverview();
    if (target === 'products') { renderProducts(); fillCategorySelects(); }
    if (target === 'categories') renderCategories();
    if (target === 'inventory') renderInventory();
    if (target === 'orders') {
      if (window.ModevaAuth && typeof ModevaAuth.reconcileAdminOrdersFromCustomerStore === 'function') {
        ModevaAuth.reconcileAdminOrdersFromCustomerStore();
      }
      renderOrders();
    }
    if (target === 'customers') renderCustomers();
    if (target === 'promos') renderPromos();
    if (target === 'reports') renderReports();
    if (target === 'charts') renderCharts();
    if (target === 'staff-roles') renderStaffRoles();
    if (target === 'system') renderSystem();
  }

  function bind () {
    var session = ModevaAuth.getSession();
    var hi = document.getElementById('dashUserHello');
    if (hi && session) {
      var pos = session.staffPosition ? (' · ' + session.staffPosition) : '';
      hi.textContent = session.name + ' · ' + session.email + pos;
    }
    var badge = document.getElementById('dashRoleBadge');
    if (badge) badge.textContent = IS_ADMIN ? 'Admin' : 'Staff';

    document.querySelectorAll('.admin-nav__item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        navigate(btn.getAttribute('data-dash-target'));
      });
    });

    document.getElementById('btnLogoutDash')?.addEventListener('click', function () {
      pushLog('Đăng xuất bảng điều khiển', 'info');
      ModevaAuth.logout();
    });

    document.getElementById('formNewProduct')?.addEventListener('submit', addProduct);

    document.body.addEventListener('submit', function (e) {
      if (e.target && e.target.id === 'formEditProduct') {
        e.preventDefault();
        saveEditedProduct();
      }
    });
    document.getElementById('formNewCategory')?.addEventListener('submit', addCategory);
    document.getElementById('formNewCoupon')?.addEventListener('submit', addCoupon);
    document.getElementById('formInventoryLoss')?.addEventListener('submit', submitInventoryLoss);
    document.getElementById('btnBackup')?.addEventListener('click', backupData);

    document.getElementById('adminModalClose')?.addEventListener('click', function () {
      var m = document.getElementById('adminModal');
      if (m) m.hidden = true;
    });

    document.body.addEventListener('click', function (e) {
      var t = e.target.closest('[data-act]');
      if (!t) return;
      var act = t.getAttribute('data-act');
      var id = t.getAttribute('data-id');
      if (act === 'edit-product') {
        openEditProductModal(id);
      }
      if (act === 'del-product' && IS_ADMIN) {
        var products = read(K.products, []);
        var list = products.map(function (p) {
          if (p.id === id) {
            p.deletedAt = new Date().toISOString();
            p.isDeleted = true;
          }
          return p;
        });
        write(K.products, list);
        pushLog('Xóa mềm sản phẩm ' + id, 'warning');
        renderProducts();
        renderOverview();
        renderReports();
        if (window.showNotification) showNotification('Đã xóa mềm sản phẩm', 'info');
      }
      if (act === 'restore-product' && IS_ADMIN) {
        var products = read(K.products, []);
        var list = products.map(function (p) {
          if (p.id === id) {
            delete p.deletedAt;
            delete p.isDeleted;
          }
          return p;
        });
        write(K.products, list);
        pushLog('Khôi phục sản phẩm ' + id, 'info');
        renderProducts();
        renderOverview();
        renderReports();
        if (window.showNotification) showNotification('Đã khôi phục sản phẩm', 'success');
      }
      if (act === 'order-detail') showOrderDetail(id);
      if (act === 'print-invoice') printInvoice(id);
      if (act === 'order-confirm') {
        var s = document.querySelector('.admin-order-status[data-id="' + id.replace(/"/g, '') + '"]');
        if (s) {
          s.value = 'shipping';
          s.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      if (act === 'cust-history') showCustomerHistory(t.getAttribute('data-email'));
      if (act === 'save-inventory') saveInventoryRow(t.getAttribute('data-id'));
    });

    document.body.addEventListener('change', function (e) {
      if (e.target.classList.contains('admin-order-status')) {
        var oid = e.target.getAttribute('data-id');
        var orders = read(K.orders, []);
        var o = orders.find(function (x) { return x.id === oid; });
        if (o) {
          var prevStatus = o.status;
          o.status = e.target.value;
          if (!o.adminConfirmedAt && prevStatus === 'pending' && o.status !== 'pending' && o.status !== 'cancelled') {
            o.adminConfirmedAt = new Date().toISOString();
          }
          write(K.orders, orders);
          if (window.ModevaAuth && o.email && typeof ModevaAuth.setCustomerOrderStatus === 'function') {
            var custSt = typeof ModevaAuth.mapAdminStatusToCustomer === 'function'
              ? ModevaAuth.mapAdminStatusToCustomer(o.status)
              : o.status;
            ModevaAuth.setCustomerOrderStatus(o.email, oid, custSt, {
              adminConfirmedAt: o.adminConfirmedAt || null
            });
            if (o.adminConfirmedAt && typeof ModevaAuth.setCustomerOrderAdminConfirmed === 'function') {
              ModevaAuth.setCustomerOrderAdminConfirmed(o.email, oid, o.adminConfirmedAt);
            }
          }
          pushLog('Cập nhật trạng thái đơn ' + oid + ' → ' + o.status, 'info');
          syncCustomersFromOrders();
          renderOverview();
          renderCustomers();
          renderReports();
          renderCharts();
        }
      }
      if (e.target.classList.contains('admin-inv-size') || e.target.classList.contains('admin-inv-color')) {
        var pid = e.target.getAttribute('data-product');
        if (pid) {
          var szEl = document.querySelector('.admin-inv-size[data-product="' + pid.replace(/"/g, '') + '"]');
          var clEl = document.querySelector('.admin-inv-color[data-product="' + pid.replace(/"/g, '') + '"]');
          invUiChoice[pid] = {
            size: szEl ? szEl.value : '',
            color: clEl ? clEl.value : ''
          };
          renderInventory();
        }
      }
      if (e.target.classList.contains('admin-tier') && IS_ADMIN) {
        var cid = e.target.getAttribute('data-id');
        var customers = read(K.customers, []);
        var c = customers.find(function (x) { return x.id === cid; });
        if (c) {
          c.tier = e.target.value;
          write(K.customers, customers);
          pushLog('Đổi phân loại khách ' + cid + ' → ' + c.tier, 'info');
        }
      }
      if (e.target.classList.contains('admin-staff-role') && IS_ADMIN) {
        var se = e.target.getAttribute('data-email');
        var pos = e.target.value;
        if (window.ModevaAuth && typeof ModevaAuth.setStaffPosition === 'function') {
          var res = ModevaAuth.setStaffPosition(se, pos);
          if (res && res.ok) {
            pushLog('Phân bổ chức vụ staff ' + se + ' → ' + pos, 'info');
            if (window.showNotification) showNotification('Đã cập nhật chức vụ staff', 'success');
            renderStaffRoles();
          } else {
            if (window.showNotification) showNotification((res && res.message) ? res.message : 'Không lưu được chức vụ', 'error');
          }
        }
      }
    });

    setInterval(function () {
      var sys = document.getElementById('panel-system');
      if (sys && sys.classList.contains('is-active')) {
        renderSystem();
      }
    }, 2000);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      var sys = document.getElementById('panel-system');
      if (sys && sys.classList.contains('is-active')) {
        renderSystem();
      }
      var ordPanel = document.getElementById('panel-orders');
      if (ordPanel && ordPanel.classList.contains('is-active') && window.ModevaAuth &&
        typeof ModevaAuth.reconcileAdminOrdersFromCustomerStore === 'function') {
        ModevaAuth.reconcileAdminOrdersFromCustomerStore();
        renderOrders();
        renderOverview();
      }
    });

    window.addEventListener('storage', function (e) {
      if (!e || !e.key) return;
      if (e.key !== K.orders && e.key !== 'modeva_customer_orders') return;
      if (window.ModevaAuth && typeof ModevaAuth.reconcileAdminOrdersFromCustomerStore === 'function') {
        ModevaAuth.reconcileAdminOrdersFromCustomerStore();
      }
      syncCustomersFromOrders();
      renderOrders();
      renderOverview();
      renderCustomers();
      renderReports();
      renderCharts();
    });
  }

  function startDashboard () {
    seed();
    if (window.ModevaCatalogSync && typeof ModevaCatalogSync.mergeCatalogDefaults === 'function') {
      ModevaCatalogSync.mergeCatalogDefaults();
    }
    if (window.ModevaAuth && typeof ModevaAuth.reconcileAdminOrdersFromCustomerStore === 'function') {
      ModevaAuth.reconcileAdminOrdersFromCustomerStore();
    }
    syncCustomersFromOrders();
    bind();
    navigate('overview');
  }

  pullDashboardSnapshotOnce().finally(function () {
    startDashboard();
  });
})();
