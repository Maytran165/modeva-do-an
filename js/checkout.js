// ===================================
// Checkout JavaScript
// ===================================

let checkoutData = {
    subtotal: 0,
    discount: 0,
    shipping: 30000,
    voucherCode: null,
    paymentMethod: 'cod',
    deliveryMethod: 'standard'
};

const BANK_QR_CONFIG = {
    bankCode: 'MB',
    accountNo: '160513041704',
    accountNameDisplay: 'TRẦN BẢO NGỌC',
    accountNameQr: 'TRAN BAO NGOC'
};

let checkoutPreviewOrderCode = 'ĐH' + Math.floor(100000 + Math.random() * 900000);
let pendingBankOrderId = null;
let isPlacingOrder = false;
const PENDING_PAYMENT_KEY = 'modeva_pending_payment';

function getPendingPaymentDraft () {
    try {
        var raw = localStorage.getItem(PENDING_PAYMENT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function setPendingPaymentDraft (draft) {
    try {
        localStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(draft || null));
    } catch (e) {}
}

function clearPendingPaymentDraft () {
    try {
        localStorage.removeItem(PENDING_PAYMENT_KEY);
    } catch (e) {}
}

function cancelPendingPaymentRequest () {
    clearPendingPaymentDraft();
    pendingBankOrderId = null;
    try {
        var paidBtn = document.getElementById('bankPaidBtn');
        if (paidBtn) paidBtn.style.display = 'none';
        var cancelBtn = document.getElementById('bankCancelPendingBtn');
        if (cancelBtn) cancelBtn.style.display = 'none';
    } catch (e) {}
    showNotification('Thanh toán không thành công. Yêu cầu thanh toán đang chờ đã được hủy.', 'error');
}

function buildCheckoutFingerprint (orderData) {
    if (!orderData) return '';
    var owner = String(orderData.ownerEmail || '').toLowerCase();
    var method = String(orderData.paymentMethod || '');
    var total = String(orderData.total || 0);
    var items = Array.isArray(orderData.items) ? orderData.items.map(function (it) {
        return [it.productId || '', it.name || '', it.variant || '', it.qty || 0, it.price || 0].join('|');
    }).join(';') : '';
    return [owner, method, total, items].join('::');
}

function finalizeConfirmedOrder (orderData) {
    if (!orderData || !orderData.orderId) {
        return { ok: false, message: 'Thiếu dữ liệu đơn hàng.' };
    }
    var sess = window.ModevaAuth && ModevaAuth.getSession ? ModevaAuth.getSession() : null;
    var owner = orderData.ownerEmail || (sess && sess.email) || '';
    if (!window.ModevaAuth || !owner) {
        return { ok: false, message: 'Không thể xác thực tài khoản khách.' };
    }

    if (typeof ModevaAuth.appendCustomerOrder === 'function') {
        ModevaAuth.appendCustomerOrder(owner, orderData);
    }
    if (orderData.voucherCode && typeof ModevaAuth.consumeVoucher === 'function') {
        ModevaAuth.consumeVoucher(owner, orderData.voucherCode);
    }
    if (typeof ModevaAuth.recordOrderCompleted === 'function') {
        ModevaAuth.recordOrderCompleted(owner);
    }
    if (window.ModevaApi && typeof ModevaApi.syncOrder === 'function') {
        ModevaApi.syncOrder(orderData);
    }
    if (window.ModevaLogs) {
        ModevaLogs.append('Checkout: xác nhận thanh toán thành công — ' + orderData.orderId, 'info');
    }
    return markOrderAsPaid(orderData);
}

function resolveApiUrl (path) {
    var p = String(path || '');
    if (p && p.charAt(0) !== '/') p = '/' + p;
    var base = '';
    if (window.ModevaApi && typeof window.MODEVA_API_BASE === 'string' && window.MODEVA_API_BASE.trim()) {
        base = window.MODEVA_API_BASE.trim().replace(/\/$/, '');
    } else if (typeof window.MODEVA_API_BASE === 'string' && window.MODEVA_API_BASE.trim()) {
        base = window.MODEVA_API_BASE.trim().replace(/\/$/, '');
    } else {
        base = '';
    }
    return base ? (base + p) : p;
}

function getApiBaseCandidates () {
    if (typeof window === 'undefined' || !window.location) return [''];
    var loc = window.location;
    var candidates = [];
    if (typeof window.MODEVA_API_BASE === 'string' && window.MODEVA_API_BASE.trim()) {
        candidates.push(window.MODEVA_API_BASE.trim().replace(/\/$/, ''));
    }
    candidates.push(loc.origin || '');
    var proto = loc.protocol || 'http:';
    var host = loc.hostname || 'localhost';
    candidates.push('http://127.0.0.1:3000');
    candidates.push(proto + '//' + host + ':3000');
    candidates.push('http://localhost:3000');
    candidates.push('http://127.0.0.1:5000');
    candidates.push(proto + '//' + host + ':5000');
    candidates.push('http://localhost:5000');
    var uniq = [];
    var seen = {};
    candidates.forEach(function (x) {
        var k = String(x || '').trim();
        if (seen[k]) return;
        seen[k] = true;
        uniq.push(k);
    });
    return uniq;
}

function createMomoPaymentAtBase (apiBase, orderData) {
    var p = '/api/pay/momo/create';
    var alt = '/payment';
    var url = apiBase ? (apiBase + p) : p;
    function callUrl (targetUrl) {
        return fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            orderId: orderData.orderId,
            requestId: orderData.orderId,
            orderInfo: 'Thanh toan don ' + orderData.orderId,
            amount: orderData.total,
            requestType: 'payWithMethod',
            lang: 'vi',
            extraData: orderData.ownerEmail || ''
        })
        }).then(function (res) {
        return res.text().then(function (raw) {
            var data = null;
            try { data = raw ? JSON.parse(raw) : {}; } catch (e) { data = null; }
            var momoPayload = data && data.momo ? data.momo : data;
            if (!res.ok || !data || !momoPayload) {
                return {
                    ok: false,
                    message: (data && data.message) ? data.message : ('HTTP ' + res.status),
                    endpoint: targetUrl,
                    errorType: 'http'
                };
            }
            return { ok: true, momo: momoPayload, endpoint: targetUrl };
        });
    }).catch(function (e) {
            return { ok: false, message: String((e && e.message) || 'network error'), endpoint: targetUrl };
        });
    }
    return callUrl(url).then(function (r) {
        if (r && r.ok) return r;
        var url2 = apiBase ? (apiBase + alt) : alt;
        return callUrl(url2).then(function (r2) {
            if (r2 && r2.ok) return r2;
            return r2 || r;
        });
    });
}

function createMomoPayment (orderData) {
    if (!orderData || !orderData.orderId) {
        return Promise.resolve({ ok: false, message: 'Thiếu dữ liệu đơn hàng để tạo thanh toán MoMo.' });
    }
    var bases = getApiBaseCandidates();
    var i = 0;
    var lastErr = null;
    function next () {
        if (i >= bases.length) {
            return Promise.resolve({
                ok: false,
                message: 'Không kết nối được API MoMo. Kiểm tra server Node (cổng 5000 hoặc 3000) và MOMO_* trong server/.env.',
                detail: lastErr
            });
        }
        var base = bases[i++];
        return createMomoPaymentAtBase(base, orderData).then(function (r) {
            if (r && r.ok) {
                if (base) window.MODEVA_API_BASE = base;
                return r;
            }
            // Nếu endpoint đã phản hồi HTTP nhưng bị lỗi nghiệp vụ/config,
            // dừng ngay để hiển thị đúng lỗi từ server (không retry vòng vo).
            if (r && r.errorType === 'http') {
                return {
                    ok: false,
                    message: r.message || 'Server MoMo trả lỗi.',
                    detail: r
                };
            }
            lastErr = r;
            return next();
        });
    }
    return next().catch(function () {
        return { ok: false, message: 'Không tạo được thanh toán MoMo.' };
    });
}

function handleMomoReturnResult () {
    const q = new URLSearchParams(window.location.search);
    const orderId = String(q.get('orderId') || '').trim();
    if (!orderId) return;

    const resultCode = String(q.get('resultCode') || '').trim();
    if (!resultCode) return;

    var draft = getPendingPaymentDraft();
    var draftOrder = (draft && draft.orderData && draft.orderData.orderId === orderId) ? draft.orderData : null;

    if (resultCode === '0') {
        const paidRes = finalizeConfirmedOrder(draftOrder || { orderId: orderId, customer: {}, paymentMethod: 'momo' });
        if (paidRes && paidRes.ok) {
            clearPendingPaymentDraft();
            showSuccessModal(orderId);
            showNotification('Thanh toán MoMo thành công.', 'success');
        } else {
            showNotification((paidRes && paidRes.message) ? paidRes.message : 'Không thể cập nhật thanh toán MoMo.', 'error');
        }
    } else {
        clearPendingPaymentDraft();
        const msg = q.get('message') || 'Thanh toán MoMo chưa thành công.';
        showNotification(msg, 'error');
    }

    if (window.history && window.history.replaceState) {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
    }
}

function renderCheckoutVouchers () {
    const host = document.getElementById('checkoutVoucherList');
    if (!host) return;

    const sess = window.ModevaAuth && ModevaAuth.getSession && ModevaAuth.getSession();
    if (!sess || sess.role !== 'customer') {
        host.innerHTML = '<div class="admin-hint">Đăng nhập tài khoản khách để xem voucher.</div>';
        return;
    }

    const list = (ModevaAuth.getActiveCustomerVouchers && ModevaAuth.getActiveCustomerVouchers(sess.email)) || [];
    if (!list.length) {
        host.innerHTML = '<div class="admin-hint">Bạn không còn voucher khả dụng.</div>';
        return;
    }

    host.innerHTML = list.map(function (v) {
        var code = String(v.code || '');
        var min = Number(v.minOrder) || 0;
        var max = Number(v.maxDiscount) || 0;
        var active = checkoutData.voucherCode && String(checkoutData.voucherCode).toUpperCase() === code.toUpperCase();
        var disabled = (checkoutData.subtotal || 0) < min;
        return (
            '<button type="button" class="voucher-chip' + (active ? ' is-active' : '') + '" ' + (disabled ? 'disabled' : '') +
            ' data-voucher-code="' + code.replace(/"/g, '&quot;') + '">' +
            '<strong>' + code + '</strong>' +
            '<span>Giảm ' + String(v.percent || 0) + '%</span>' +
            '<small>Max ' + formatCurrency(max) + ' · Đơn từ ' + formatCurrency(min) + '</small>' +
            '</button>'
        );
    }).join('');
}

function applyCheckoutVoucher (code) {
    const sess = window.ModevaAuth && ModevaAuth.getSession && ModevaAuth.getSession();
    if (!sess || sess.role !== 'customer') {
        showNotification('Vui lòng đăng nhập tài khoản khách để dùng voucher', 'error');
        return;
    }
    if (!window.ModevaAuth || !ModevaAuth.calcVoucherDiscount) {
        showNotification('Không thể áp dụng voucher. Vui lòng tải lại trang.', 'error');
        return;
    }

    const res = ModevaAuth.calcVoucherDiscount(sess.email, code, checkoutData.subtotal);
    if (!res || !res.ok) {
        showNotification(res && res.message ? res.message : 'Voucher không hợp lệ', 'error');
        return;
    }

    checkoutData.discount = res.discount || 0;
    checkoutData.voucherCode = String(code || '').trim().toUpperCase();

    const appliedVoucher = document.getElementById('appliedVoucher');
    const voucherText = document.getElementById('voucherText');
    if (voucherText) voucherText.textContent = checkoutData.voucherCode;
    if (appliedVoucher) appliedVoucher.style.display = 'flex';

    updateCheckoutSummary();
    renderCheckoutVouchers();
    showNotification('Áp dụng voucher thành công!', 'success');
}

// Select payment method
function selectPayment(element, method) {
    // Remove active class from all payment methods
    document.querySelectorAll('.payment-method').forEach(item => {
        item.classList.remove('active');
    });
    
    // Add active class to selected payment method
    element.classList.add('active');
    
    // Update radio button
    element.querySelector('input[type="radio"]').checked = true;
    
    // Update checkout data
    checkoutData.paymentMethod = method;
    
    // Show/hide bank transfer info
    const bankInfo = document.getElementById('bankInfo');
    if (method === 'bank') {
        bankInfo.style.display = 'block';
        updateBankTransferInfo();
    } else {
        bankInfo.style.display = 'none';
    }
}

// Select delivery method
function selectDelivery(element, shippingFee) {
    // Remove active class from all delivery methods
    document.querySelectorAll('.delivery-method').forEach(item => {
        item.classList.remove('active');
    });
    
    // Add active class to selected delivery method
    element.classList.add('active');
    
    // Update radio button
    element.querySelector('input[type="radio"]').checked = true;
    
    // Update checkout data
    checkoutData.shipping = shippingFee;
    checkoutData.deliveryMethod = element.querySelector('input').value;
    
    // Update summary
    updateCheckoutSummary();
}

// Update checkout summary
function updateCheckoutSummary() {
    const total = checkoutData.subtotal - checkoutData.discount + checkoutData.shipping;
    
    const subEl = document.getElementById('subtotalCheckout');
    if (subEl) subEl.textContent = formatCurrency(checkoutData.subtotal);

    document.getElementById('shippingCheckout').textContent = formatCurrency(checkoutData.shipping);
    document.getElementById('totalCheckout').textContent = formatCurrency(total);
    
    // Show/hide discount row
    const discountRow = document.getElementById('discountRow');
    if (checkoutData.discount > 0) {
        discountRow.style.display = 'flex';
        document.getElementById('discountCheckout').textContent = `-${formatCurrency(checkoutData.discount)}`;
    } else {
        discountRow.style.display = 'none';
    }

    updateBankTransferInfo();
}

function buildBankQrUrl (amount, orderCode) {
    const info = 'thanh toan don hang ' + String(orderCode || '').trim();
    const base = 'https://img.vietqr.io/image/' + BANK_QR_CONFIG.bankCode + '-' + BANK_QR_CONFIG.accountNo + '-compact2.png';
    const query =
        '?amount=' + encodeURIComponent(String(Math.max(0, Math.round(Number(amount) || 0)))) +
        '&addInfo=' + encodeURIComponent(info) +
        '&accountName=' + encodeURIComponent(BANK_QR_CONFIG.accountNameQr);
    return base + query;
}

function updateBankTransferInfo (orderCodeOverride) {
    const total = checkoutData.subtotal - checkoutData.discount + checkoutData.shipping;
    const orderCode = String(orderCodeOverride || checkoutPreviewOrderCode || '').trim();

    const amountText = formatCurrency(total);
    const amountEl = document.getElementById('bankTransferAmount');
    if (amountEl) amountEl.textContent = amountText;

    const orderCodeEl = document.getElementById('orderCode');
    if (orderCodeEl) orderCodeEl.textContent = orderCode;

    const qrCaptionEl = document.getElementById('bankQrCaption');
    if (qrCaptionEl) qrCaptionEl.textContent = 'Quét mã để thanh toán đơn ' + orderCode;

    const qrAmountBadgeEl = document.getElementById('bankQrAmountBadge');
    if (qrAmountBadgeEl) qrAmountBadgeEl.textContent = amountText;

    const qrImg = document.getElementById('bankQrImage');
    if (qrImg) {
        qrImg.src = buildBankQrUrl(total, orderCode);
    }

    const paidBtn = document.getElementById('bankPaidBtn');
    if (paidBtn) {
        paidBtn.style.display = pendingBankOrderId ? 'inline-flex' : 'none';
    }
    const cancelBtn = document.getElementById('bankCancelPendingBtn');
    if (cancelBtn) {
        cancelBtn.style.display = pendingBankOrderId ? 'inline-flex' : 'none';
    }
}

function markOrderAsPaid (orderData) {
    if (!orderData || !orderData.orderId) return { ok: false };
    const sess = window.ModevaAuth && ModevaAuth.getSession ? ModevaAuth.getSession() : null;
    const customerEmail = orderData.ownerEmail
        ? String(orderData.ownerEmail).trim().toLowerCase()
        : (sess && sess.email
            ? String(sess.email).trim().toLowerCase()
            : (orderData.customer && orderData.customer.email
                ? String(orderData.customer.email).trim().toLowerCase()
                : ''));
    const paidAt = new Date().toISOString();

    try {
        const raw = localStorage.getItem('lastOrder');
        const src = raw ? JSON.parse(raw) : null;
        const merged = (src && src.orderId === orderData.orderId) ? src : orderData;
        merged.paidAt = paidAt;
        merged.paymentStatus = 'paid';
        localStorage.setItem('lastOrder', JSON.stringify(merged));
    } catch (e) {}

    if (window.ModevaAuth && customerEmail && typeof ModevaAuth.markCustomerOrderPaidOnce === 'function') {
        const res = ModevaAuth.markCustomerOrderPaidOnce(customerEmail, orderData.orderId, {
            method: orderData.paymentMethod || ''
        });
        if (!res || !res.ok) return res || { ok: false, message: 'Không thể xác nhận thanh toán.' };
    } else if (window.ModevaAuth && customerEmail && typeof ModevaAuth.setCustomerOrderStatus === 'function') {
        ModevaAuth.setCustomerOrderStatus(customerEmail, orderData.orderId, 'completed');
    }
    if (window.ModevaApi && typeof ModevaApi.syncOrderPayment === 'function') {
        ModevaApi.syncOrderPayment({ orderId: orderData.orderId, paidAt: paidAt });
    }
    return { ok: true };
}

function formatVariantForCheckout (variantRaw) {
    const v = String(variantRaw || '').trim();
    // Format mặc định từ cart: "Màu: Đen | Size: M"
    var m = v.match(/Màu:\s*([^|]+)\|\s*Size:\s*(.+)$/i);
    if (m) {
        return (m[1] ? m[1].trim() : '') + (m[2] ? (', ' + m[2].trim()) : '');
    }
    return v || '—';
}

function renderCheckoutOrderItems (items) {
    var host = document.querySelector('.order-summary-sidebar .order-items') || document.querySelector('.order-items');
    if (!host) return;

    var list = Array.isArray(items) ? items : [];
    if (!list.length) {
        host.innerHTML = '<div class="admin-hint">Chưa có sản phẩm để thanh toán.</div>';
        return;
    }

    host.innerHTML = list.map(function (it) {
        var qty = parseInt(it.qty, 10) || 1;
        var unit = parseInt(it.price, 10) || 0;
        var img = it.image || 'https://via.placeholder.com/80x80?text=Product';
        var name = it.name || 'Sản phẩm';
        var variant = formatVariantForCheckout(it.variant);
        var lineTotal = qty * unit;
        var priceText = formatCurrency(lineTotal);

        return (
            '<div class="order-item">' +
              '<div class="item-image">' +
                '<img src="' + String(img).replace(/"/g, '&quot;') + '" alt="' + String(name).replace(/"/g, '&quot;') + '">' +
                '<span class="item-quantity">' + String(qty) + '</span>' +
              '</div>' +
              '<div class="item-info">' +
                '<h4>' + String(name) + '</h4>' +
                '<p>' + String(variant) + '</p>' +
              '</div>' +
              '<div class="item-price">' + priceText + '</div>' +
            '</div>'
        );
    }).join('');
}

// Remove voucher
function removeVoucher() {
    checkoutData.discount = 0;
    checkoutData.voucherCode = null;
    
    const appliedVoucher = document.getElementById('appliedVoucher');
    if (appliedVoucher) {
        appliedVoucher.style.display = 'none';
    }
    
    updateCheckoutSummary();
    renderCheckoutVouchers();
    showNotification('Đã xóa mã giảm giá', 'info');
}

// Toggle saved addresses
function toggleSavedAddresses() {
    showNotification('Tính năng đang được phát triển', 'info');
}

// Place order — chỉ thành công khi đã đăng nhập khách + có sản phẩm từ giỏ hàng
function placeOrder() {
    if (isPlacingOrder) {
        showNotification('Đơn đang được xử lý, vui lòng không bấm nhiều lần.', 'info');
        return;
    }
    isPlacingOrder = true;
    if (!window.ModevaAuth) {
        if (window.ModevaLogs) ModevaLogs.append('Checkout: đặt hàng thất bại — thiếu module xác thực', 'error');
        showNotification('Không thể xác thực. Vui lòng tải lại trang.', 'error');
        isPlacingOrder = false;
        return;
    }
    const sess = ModevaAuth.getSession();
    if (!sess || sess.role !== 'customer') {
        if (window.ModevaLogs) ModevaLogs.append('Checkout: đặt hàng bị từ chối — chưa đăng nhập khách', 'warning');
        showNotification('Vui lòng đăng nhập tài khoản khách để đặt hàng thành công.', 'error');
        setTimeout(function () {
            window.location.href = 'account.html';
        }, 1600);
        isPlacingOrder = false;
        return;
    }

    const lineItems = checkoutData.items || [];
    if (!lineItems.length) {
        if (window.ModevaLogs) ModevaLogs.append('Checkout: đặt hàng bị từ chối — giỏ không có dòng hàng', 'warning');
        showNotification('Chưa có sản phẩm thanh toán. Hãy thêm hàng vào giỏ, chọn sản phẩm rồi vào thanh toán.', 'error');
        isPlacingOrder = false;
        return;
    }

    // Validate form
    const fullName = document.getElementById('fullName').value;
    const phoneRaw = document.getElementById('phone').value;
    const phone = String(phoneRaw || '').replace(/\D/g, '');
    const province = document.getElementById('province').value;
    const district = document.getElementById('district').value;
    const ward = document.getElementById('ward').value;
    const address = document.getElementById('address').value;
    
    if (!fullName || !phoneRaw || !province || !district || !ward || !address) {
        showNotification('Vui lòng điền đầy đủ thông tin giao hàng', 'error');
        isPlacingOrder = false;
        return;
    }
    
    if (!/^\d{10}$/.test(phone)) {
        showNotification('Số điện thoại phải đúng 10 chữ số', 'error');
        document.getElementById('phone').focus();
        isPlacingOrder = false;
        return;
    }
    document.getElementById('phone').value = phone;

    const emailEl = document.getElementById('email');
    const emailRaw = (emailEl && emailEl.value || '').trim().toLowerCase();
    if (!emailRaw) {
        showNotification('Vui lòng nhập email @gmail.com để nhận thông tin đơn hàng', 'error');
        if (emailEl) emailEl.focus();
        isPlacingOrder = false;
        return;
    }
    if (!/^[^\s@]+@gmail\.com$/.test(emailRaw)) {
        showNotification('Email nhận đơn phải là địa chỉ @gmail.com', 'error');
        if (emailEl) emailEl.focus();
        isPlacingOrder = false;
        return;
    }
    if (emailEl) emailEl.value = emailRaw;

    // Create order
    const orderData = {
        orderId: 'ĐH' + Math.floor(Math.random() * 1000000),
        ownerEmail: sess.email,
        customer: {
            fullName,
            phone,
            email: emailRaw,
            address: {
                province,
                district,
                ward,
                address
            }
        },
        paymentMethod: checkoutData.paymentMethod,
        deliveryMethod: checkoutData.deliveryMethod,
        note: document.getElementById('note').value,
        items: checkoutData.items || [],
        subtotal: checkoutData.subtotal,
        discount: checkoutData.discount,
        voucherCode: checkoutData.voucherCode,
        shipping: checkoutData.shipping,
        total: checkoutData.subtotal - checkoutData.discount + checkoutData.shipping,
        createdAt: new Date().toISOString(),
        paymentStatus: (checkoutData.paymentMethod === 'bank' || checkoutData.paymentMethod === 'momo') ? 'pending' : 'paid'
    };
    const checkoutFingerprint = buildCheckoutFingerprint(orderData);
    const existingPending = getPendingPaymentDraft();
    if (existingPending && existingPending.status === 'pending' &&
        existingPending.fingerprint === checkoutFingerprint &&
        (Date.now() - (existingPending.at || 0) < 15 * 60 * 1000)) {
        showNotification('Đang có một yêu cầu thanh toán cho giỏ hàng này. Hoàn tất hoặc chờ hết phiên trước khi tạo yêu cầu mới.', 'warning');
        isPlacingOrder = false;
        return;
    }

    // Update "nội dung chuyển khoản" so khách thanh toán theo đúng đơn mới tạo
    const bankInfoEl = document.getElementById('bankInfo');
    if (checkoutData.paymentMethod === 'bank' && bankInfoEl) {
        bankInfoEl.style.display = 'block';
    }

    const orderCodeEl = document.getElementById('orderCode');
    if (orderCodeEl) orderCodeEl.textContent = orderData.orderId;

    const bankAmountEl = document.getElementById('bankTransferAmount');
    if (bankAmountEl) bankAmountEl.textContent = formatCurrency(orderData.total);

    const bankQrCaptionEl = document.getElementById('bankQrCaption');
    if (bankQrCaptionEl) bankQrCaptionEl.textContent = 'Quét mã để thanh toán đơn #' + orderData.orderId;
    updateBankTransferInfo(orderData.orderId);
    
    // Bank transfer flow: wait for user to pay in banking app, then confirm.
    if (checkoutData.paymentMethod === 'bank') {
        setPendingPaymentDraft({
            at: Date.now(),
            status: 'pending',
            fingerprint: checkoutFingerprint,
            orderData: orderData
        });
        localStorage.setItem('lastOrder', JSON.stringify(orderData));
        pendingBankOrderId = orderData.orderId;
        updateBankTransferInfo(orderData.orderId);
        const bankInfoEl2 = document.getElementById('bankInfo');
        if (bankInfoEl2) {
            bankInfoEl2.style.display = 'block';
            bankInfoEl2.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        showNotification('Đơn đã tạo. Vui lòng quét QR và bấm Thanh toán trong app MB Bank, sau đó bấm "Tôi đã thanh toán".', 'info');
        isPlacingOrder = false;
        return;
    }

    // MoMo flow: chuyển hướng sang cổng thanh toán
    if (checkoutData.paymentMethod === 'momo') {
        setPendingPaymentDraft({
            at: Date.now(),
            status: 'pending',
            fingerprint: checkoutFingerprint,
            orderData: orderData
        });
        localStorage.setItem('lastOrder', JSON.stringify(orderData));
        createMomoPayment(orderData).then(function (r) {
            if (!r || !r.ok || !r.momo) {
                clearPendingPaymentDraft();
                var msg = (r && r.message) ? r.message : 'Không thể tạo thanh toán MoMo.';
                if (r && r.detail && r.detail.endpoint) {
                    msg += ' Endpoint cuối: ' + r.detail.endpoint;
                }
                showNotification(msg, 'error');
                isPlacingOrder = false;
                return;
            }
            const payUrl = r.momo.payUrl || r.momo.deeplink || r.momo.qrCodeUrl || '';
            if (!payUrl) {
                showNotification('MoMo chưa trả về link thanh toán.', 'error');
                isPlacingOrder = false;
                return;
            }
            if (window.ModevaLogs) {
                ModevaLogs.append('Checkout: tạo link MoMo thành công — ' + orderData.orderId, 'info');
            }
            showNotification('Đang chuyển đến cổng thanh toán MoMo...', 'info');
            window.location.href = payUrl;
        });
        return;
    }

    // Other methods: complete immediately (demo)
    localStorage.setItem('lastOrder', JSON.stringify(orderData));
    const paidRes = finalizeConfirmedOrder(orderData);
    if (!paidRes || !paidRes.ok) {
        showNotification((paidRes && paidRes.message) ? paidRes.message : 'Không thể xác nhận thanh toán.', 'error');
        isPlacingOrder = false;
        return;
    }
    showSuccessModal(orderData.orderId);
    isPlacingOrder = false;
}

// Show success modal
function showSuccessModal(orderId) {
    const successPanel = document.getElementById('successModal');
    if (successPanel) {
        successPanel.style.display = 'block';
        successPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    // Update order code
    const orderCodeElements = document.querySelectorAll('.order-code strong');
    orderCodeElements.forEach(element => {
        element.textContent = orderId;
    });
    
    // Clear cart (localStorage — đồng bộ với giỏ trang chủ / danh mục)
    try {
        localStorage.removeItem('cartData');
        localStorage.setItem('modeva_cart', '0');
        sessionStorage.removeItem('cartData');
        sessionStorage.removeItem('modeva_cart');
    } catch (e) {}
    if (typeof window.updateBadges === 'function') {
        window.updateBadges(0);
    }
}

// View order
function viewOrder() {
    window.location.href = 'order-tracking.html';
}

// Continue shopping
function continueShopping() {
    window.location.href = '../index.html';
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN').format(amount) + '₫';
}

function escNotifyText (s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#3B82F6'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        animation: slideInRight 0.3s ease;
        max-width: 300px;
    `;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span style="margin-left: 10px;">${escNotifyText(message)}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Populate districts/wards based on province (full list via dataset)
document.addEventListener('DOMContentLoaded', function() {
    const provinceSelect = document.getElementById('province');
    const districtSelect = document.getElementById('district');
    const wardSelect = document.getElementById('ward');

    var provinceCache = {};
    var indexCache = null;

    function normalizeText (s) {
        return String(s || '').trim().toLowerCase();
    }

    function fillOptions (selectEl, optionsArr, placeholder) {
        if (!selectEl) return;
        selectEl.innerHTML = '<option value="">' + (placeholder || '') + '</option>';
        (optionsArr || []).forEach(function (opt) {
            var text = opt && opt.text ? opt.text : '';
            var val = opt && opt.value != null ? opt.value : text;
            var o = document.createElement('option');
            o.value = String(val);
            o.textContent = String(text);
            selectEl.appendChild(o);
        });
    }

    async function loadProvinceDataset (provinceCode) {
        if (!provinceCode) return null;
        if (provinceCache[provinceCode]) return provinceCache[provinceCode];
        var url = 'https://cdn.jsdelivr.net/gh/thien0291/vietnam_dataset@1.0.0/data/' + provinceCode + '.json';
        try {
            var res = await fetch(url);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var data = await res.json();
            provinceCache[provinceCode] = data;
            return data;
        } catch (e) {
            return null;
        }
    }

    if (provinceSelect) {
        function getSelectedProvinceCode () {
            var opt = provinceSelect.selectedOptions && provinceSelect.selectedOptions[0];
            if (!opt) return '';
            if (opt.dataset && opt.dataset.code) return opt.dataset.code;

            // Fallback cho các option HTML cũ (hanoi/hcm/...)
            var v = String(opt.value || '').trim().toLowerCase();
            var legacy = {
                hanoi: 'HN',
                hcm: 'SG',
                danang: 'DDN',
                haiphong: 'HP',
                cantho: 'CT'
            };
            return legacy[v] || '';
        }

        async function loadAndFillProvinces () {
            // Thay toàn bộ danh sách tỉnh/thành bằng dữ liệu đầy đủ từ Index.json
            try {
                var restoreCode = getSelectedProvinceCode();
                if (!indexCache) {
                    var idxRes = await fetch('https://cdn.jsdelivr.net/gh/thien0291/vietnam_dataset@1.0.0/Index.json');
                    if (!idxRes.ok) throw new Error('HTTP ' + idxRes.status);
                    indexCache = await idxRes.json();
                }
                var items = Object.keys(indexCache).map(function (provinceName) {
                    var info = indexCache[provinceName] || {};
                    return { name: provinceName, code: info.code || '' };
                }).filter(function (x) { return x.name && x.code; });

                // Sort theo tên để dễ tìm
                items.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'vi'); });

                provinceSelect.innerHTML = '<option value="">Chọn Tỉnh/Thành phố</option>';
                items.forEach(function (x) {
                    var o = document.createElement('option');
                    o.value = x.name; // value dùng để lưu vào đơn -> hiển thị đúng tên
                    o.textContent = x.name;
                    o.dataset.code = x.code; // dùng để nạp dataset quận/phường
                    provinceSelect.appendChild(o);
                });

                // Khôi phục lựa chọn cũ nếu trước đó user đã chọn
                if (restoreCode) {
                    var match = Array.prototype.find.call(provinceSelect.options, function (opt) {
                        return opt && opt.dataset && opt.dataset.code === restoreCode;
                    });
                    if (match && match.value) provinceSelect.value = match.value;
                }
            } catch (e) {
                // Nếu load Index.json lỗi thì giữ nguyên danh sách HTML cũ (fallback)
            }
        }

        // Fill tỉnh/thành ngay khi vào trang (async)
        loadAndFillProvinces();

        provinceSelect.addEventListener('change', async function() {
            districtSelect.innerHTML = '<option value="">Chọn Quận/Huyện</option>';
            wardSelect.innerHTML = '<option value="">Chọn Phường/Xã</option>';

            var code = getSelectedProvinceCode();
            if (!code) return;

            var dataset = await loadProvinceDataset(code);
            if (!dataset || !Array.isArray(dataset.district)) return;

            var distOptions = dataset.district.map(function (d) {
                return { text: d.name, value: d.name };
            });
            fillOptions(districtSelect, distOptions, 'Chọn Quận/Huyện');
        });

        districtSelect.addEventListener('change', async function() {
            wardSelect.innerHTML = '<option value="">Chọn Phường/Xã</option>';
            var provinceCode = getSelectedProvinceCode();
            if (!provinceCode) return;

            var dataset = await loadProvinceDataset(provinceCode);
            if (!dataset || !Array.isArray(dataset.district)) return;

            var districtName = this.value;
            var districtObj = dataset.district.find(function (d) {
                return normalizeText(d.name) === normalizeText(districtName);
            });
            if (!districtObj || !Array.isArray(districtObj.ward)) return;

            var wardOptions = districtObj.ward.map(function (w) {
                return { text: w.name, value: w.name };
            });
            fillOptions(wardSelect, wardOptions, 'Chọn Phường/Xã');
        });
    }

    // Load cart (localStorage; fallback migrate từ sessionStorage cũ)
    try {
        if (!localStorage.getItem('cartData') && sessionStorage.getItem('cartData')) {
            localStorage.setItem('cartData', sessionStorage.getItem('cartData'));
            sessionStorage.removeItem('cartData');
            const b = sessionStorage.getItem('modeva_cart');
            if (b != null) localStorage.setItem('modeva_cart', b);
            sessionStorage.removeItem('modeva_cart');
        }
    } catch (e) {}
    const cartData = localStorage.getItem('cartData');
    if (cartData) {
        const data = JSON.parse(cartData);
        checkoutData = { ...checkoutData, ...data };
        updateCheckoutSummary();
        renderCheckoutOrderItems(checkoutData.items || []);
    }

    // Bind voucher clicks (always visible during checkout prep)
    const voucherHost = document.getElementById('checkoutVoucherList');
    if (voucherHost && !voucherHost.dataset.bound) {
        voucherHost.dataset.bound = '1';
        voucherHost.addEventListener('click', function (e) {
            const btn = e.target && e.target.closest ? e.target.closest('[data-voucher-code]') : null;
            if (!btn) return;
            const code = btn.getAttribute('data-voucher-code');
            if (!code) return;
            applyCheckoutVoucher(code);
        });
    }
    renderCheckoutVouchers();
    updateBankTransferInfo();
    handleMomoReturnResult();

    // Restore pending bank order state (if user refreshed page)
    try {
        const pending = getPendingPaymentDraft();
        if (pending && pending.status === 'pending' && pending.orderData && pending.orderData.paymentMethod === 'bank') {
            const last = pending.orderData;
            pendingBankOrderId = last.orderId;
            updateBankTransferInfo(last.orderId);
        }
    } catch (e) {}

    // Bank paid confirmation button
    const paidBtn = document.getElementById('bankPaidBtn');
    if (paidBtn && !paidBtn.dataset.bound) {
        paidBtn.dataset.bound = '1';
        paidBtn.addEventListener('click', function () {
            if (!pendingBankOrderId) {
                showNotification('Chưa có đơn chuyển khoản đang chờ thanh toán.', 'error');
                return;
            }
            if (paidBtn.disabled) return;
            paidBtn.disabled = true;
            let paidOrderData = null;
            try {
                const lastRaw = localStorage.getItem('lastOrder');
                if (lastRaw) {
                    const last = JSON.parse(lastRaw);
                    if (last && last.orderId === pendingBankOrderId) {
                        last.paidAt = new Date().toISOString();
                        last.paymentStatus = 'paid';
                        localStorage.setItem('lastOrder', JSON.stringify(last));
                        paidOrderData = last;
                    }
                }
            } catch (e) {}
            const doneId = pendingBankOrderId;
            pendingBankOrderId = null;
            const draft = getPendingPaymentDraft();
            const orderData = (draft && draft.orderData && draft.orderData.orderId === doneId)
                ? Object.assign({}, draft.orderData, { paidAt: new Date().toISOString(), paymentStatus: 'paid' })
                : (paidOrderData || { orderId: doneId, customer: {}, paymentMethod: 'bank' });
            const paidRes = finalizeConfirmedOrder(orderData);
            if (!paidRes || !paidRes.ok) {
                showNotification((paidRes && paidRes.message) ? paidRes.message : 'Đơn đã được thanh toán trước đó.', 'error');
                paidBtn.disabled = false;
                return;
            }
            clearPendingPaymentDraft();
            updateBankTransferInfo(doneId);
            showSuccessModal(doneId);
            paidBtn.disabled = false;
        });
    }

    const cancelPendingBtn = document.getElementById('bankCancelPendingBtn');
    if (cancelPendingBtn && !cancelPendingBtn.dataset.bound) {
        cancelPendingBtn.dataset.bound = '1';
        cancelPendingBtn.addEventListener('click', function () {
            cancelPendingPaymentRequest();
        });
    }

    console.log('Checkout page initialized');
});