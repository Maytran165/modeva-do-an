/* Modeva — trang hiển thị nhãn vận chuyển (phiếu giao) */
(function () {
  'use strict';

  var KEY = 'modeva_shipping_label_order';

  function canPrintShippingLabel () {
    if (!window.ModevaAuth || typeof ModevaAuth.getSession !== 'function') return false;
    var sess = ModevaAuth.getSession();
    return !!(sess && (sess.role === 'admin' || sess.role === 'staff'));
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
    try {
      return new Intl.NumberFormat('vi-VN').format(Number(n) || 0) + '₫';
    } catch (e) {
      return String(Number(n) || 0) + '₫';
    }
  }

  function formatAddress (addr) {
    if (!addr) return '—';
    if (typeof addr === 'string') return addr;
    var parts = [];
    if (addr.address) parts.push(addr.address);
    if (addr.ward) parts.push('P/X: ' + addr.ward);
    if (addr.district) parts.push('Q/H: ' + addr.district);
    if (addr.province) parts.push(addr.province);
    return parts.length ? parts.join(', ') : '—';
  }

  function drawPseudoBarcode (canvas, text) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Tạo "barcode" giả từ hash đơn giản để có hình dạng như mã vạch.
    var s = String(text || '');
    var seed = 0;
    for (var i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) >>> 0;

    var x = 0;
    while (x < w) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      var bit = seed % 2;
      var barW = 1 + (seed % 3); // 1..3px
      ctx.fillStyle = bit === 1 ? '#111' : '#fff';
      if (bit === 1) {
        ctx.fillRect(x, 0, barW, h);
      } else {
        // nền trắng
      }
      x += barW;
    }
    // viền và chữ dưới
    ctx.strokeStyle = '#111';
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }

  function renderLabel (payload) {
    var root = document.getElementById('shipLabelRoot');
    var note = document.getElementById('shipNoDataNote');
    if (!root) return;

    if (!payload || !payload.order) {
      if (note) {
        note.style.display = 'block';
        note.textContent = 'Không có dữ liệu phiếu giao.';
      }
      root.innerHTML = '';
      return;
    }

    var o = payload.order;
    var lineItems = payload.lineItems || [];
    var shipToAddr = o.address || {};
    var recipientName = o.customer || '';
    var recipientPhone = o.phone || '';

    // Dữ liệu "Từ" có thể chỉnh theo thực tế kho của bạn
    var fromName = 'MODEVA';
    var fromAddr = 'Kho Modeva, Việt Nam';

    // Barcode
    var barcodeText = o.orderId || o.id || '—';

    root.innerHTML =
      '<div class="ship-top">' +
        '<div class="ship-brand">Shopee<small>&amp;T Express</small></div>' +
        '<div style="text-align:right">' +
          '<div class="ship-lbl">Mã vận đơn</div>' +
          '<div class="ship-val">' + esc(barcodeText) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ship-barcode">' +
        '<canvas id="shipBarcodeCanvas" width="560" height="120" style="width:100%;height:auto;display:block;"></canvas>' +
      '</div>' +

      '<div class="ship-grid">' +
        '<div class="ship-row">' +
          '<div><span class="ship-lbl">Từ</span><div class="ship-val" style="font-size:12px">' + esc(fromName) + '</div><div class="ship-val" style="font-size:11px">' + esc(fromAddr) + '</div></div>' +
          '<div style="text-align:right"><span class="ship-lbl">Đến</span><div class="ship-val" style="font-size:12px">' + esc(recipientName) + '</div><div class="ship-val" style="font-size:11px">' + esc(recipientPhone) + '</div></div>' +
        '</div>' +
        '<div><span class="ship-lbl">Địa chỉ</span><div class="ship-val" style="font-size:12px;margin-top:2px">' + esc(formatAddress(shipToAddr)) + '</div></div>' +
      '</div>' +

      '<div class="ship-items">' +
        '<div class="ship-items-title">Nội dung hàng (Tổng SL sản phẩm: ' + esc(payload.totalQty || 0) + ')</div>' +
        '<ul>' +
          (lineItems.length ? lineItems.map(function (l) {
            return '<li>' + esc(l.name) + (l.variant ? (' — ' + l.variant) : '') + ' ×' + esc(String(l.qty || 1)) + '</li>';
          }).join('') : '<li>—</li>') +
        '</ul>' +
      '</div>' +

      '<div class="ship-bottom">' +
        '<div>Trị giá hàng</div>' +
        '<div class="ship-amount ship-amount__value">' + esc(money(o.total)) + '</div>' +
      '</div>';

    var canvas = document.getElementById('shipBarcodeCanvas');
    drawPseudoBarcode(canvas, barcodeText);
  }

  function getPayloadFromStorage () {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.order) return null;
      return obj;
    } catch (e) {
      return null;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Chặn khách hàng: chỉ Admin/Staff mới được in phiếu giao.
    if (!canPrintShippingLabel()) {
      var note = document.getElementById('shipNoDataNote');
      var root = document.getElementById('shipLabelRoot');
      if (root) root.innerHTML = '';
      if (note) {
        note.style.display = 'block';
        note.textContent = 'Chỉ Admin/Staff mới được in phiếu giao.';
      }
      return;
    }

    var payload = getPayloadFromStorage();
    renderLabel(payload);
    // Tự động in để đúng yêu cầu "chuyển sang trang khác"
    setTimeout(function () {
      try { window.print(); } catch (e) {}
    }, 350);
  });
})();

