// ===================================
// Shopping Cart JavaScript
// Giỏ lưu localStorage (bền); migrate 1 lần từ sessionStorage cũ — không seed demo mặc định
// ===================================

var MODEVA_CART_KEY = 'cartData';
var MODEVA_CART_BADGE_KEY = 'modeva_cart';

function modevaMigrateCartSessionToLocal () {
    try {
        if (localStorage.getItem(MODEVA_CART_KEY)) return;
        var sess = sessionStorage.getItem(MODEVA_CART_KEY);
        if (!sess) return;
        localStorage.setItem(MODEVA_CART_KEY, sess);
        sessionStorage.removeItem(MODEVA_CART_KEY);
        var b = sessionStorage.getItem(MODEVA_CART_BADGE_KEY);
        if (b != null) localStorage.setItem(MODEVA_CART_BADGE_KEY, b);
        sessionStorage.removeItem(MODEVA_CART_BADGE_KEY);
    } catch (e) {}
}

let cartData = {
    items: [],
    subtotal: 0,
    discount: 0,
    shipping: 30000,
    voucherCode: null
};

function normalizeCartShape (src) {
    var base = {
        items: [],
        subtotal: 0,
        discount: 0,
        shipping: 30000,
        voucherCode: null
    };
    var out = Object.assign({}, base, src || {});
    if (!Array.isArray(out.items)) out.items = [];
    out.items = out.items.map(function (it) {
        var x = it || {};
        return {
            lineId: x.lineId || (String(x.productId || '') + '|' + String(x.variant || '')),
            productId: x.productId || '',
            name: x.name || 'Sản phẩm',
            variant: x.variant || '',
            qty: Math.max(1, parseInt(x.qty, 10) || 1),
            price: Math.max(0, parseInt(x.price, 10) || 0),
            priceOriginal: x.priceOriginal != null ? (parseInt(x.priceOriginal, 10) || null) : null,
            image: x.image || ''
        };
    });
    return out;
}

function escHtml (s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function loadCartDataFromStorage () {
    try {
        modevaMigrateCartSessionToLocal();
        if (window.ModevaCartStore && typeof window.ModevaCartStore.read === 'function') {
            cartData = normalizeCartShape(window.ModevaCartStore.read());
            return;
        }
        const raw = localStorage.getItem(MODEVA_CART_KEY);
        if (!raw) {
            cartData = normalizeCartShape(cartData);
            return;
        }
        const parsed = JSON.parse(raw);
        cartData = normalizeCartShape(parsed);
    } catch (e) {
        cartData = normalizeCartShape({});
        return;
    }
}

function persistCartToStorage () {
    try {
        modevaMigrateCartSessionToLocal();
        localStorage.setItem(MODEVA_CART_KEY, JSON.stringify(cartData));
        const totalQty = (cartData.items || []).reduce((s, i) => s + (parseInt(i.qty, 10) || 0), 0);
        localStorage.setItem(MODEVA_CART_BADGE_KEY, String(totalQty));
        if (typeof window.updateBadges === 'function') {
            window.updateBadges(totalQty);
        }
    } catch (e) {
        return;
    }
}

function renderCartRowHTML (item, idx) {
    const name = escHtml(item.name);
    const variant = escHtml(item.variant);
    const img = escHtml(item.image);
    const qty = parseInt(item.qty, 10) || 1;
    const price = parseInt(item.price, 10) || 0;
    const total = qty * price;
    const po = item.priceOriginal != null ? parseInt(item.priceOriginal, 10) : null;
    const showOrig = po && po > price;
    const origHtml = showOrig ? `<p class="price-original">${formatCurrency(po)}</p>` : '';
    const priceMobile = showOrig
        ? `<div class="item-price-mobile">${formatCurrency(price)}</div>`
        : `<div class="item-price-mobile">${formatCurrency(price)}</div>`;

    return (
        '<div class="cart-item" data-row-index="' + idx + '" data-line-id="' + escHtml(item.lineId) + '">' +
        '<div class="item-checkbox">' +
        '<input type="checkbox" class="item-select" checked onchange="updateCart()">' +
        '</div>' +
        '<div class="item-image">' +
        '<img src="' + img + '" alt="' + name + '">' +
        '</div>' +
        '<div class="item-details">' +
        '<h3 class="item-name">' + name + '</h3>' +
        '<p class="item-variant">' + variant + '</p>' +
        priceMobile +
        '<div class="item-actions-mobile">' +
        '<div class="quantity-selector-small">' +
        '<button type="button" class="cart-qty-minus">-</button>' +
        '<input type="number" value="' + qty + '" min="1" max="999" data-price="' + price + '" data-row-index="' + idx + '">' +
        '<button type="button" class="cart-qty-plus">+</button>' +
        '</div>' +
        '<button type="button" class="btn-remove cart-remove" aria-label="Xóa sản phẩm"><i class="fas fa-trash"></i></button>' +
        '</div>' +
        '</div>' +
        '<div class="item-price">' + origHtml + '<p class="price-current">' + formatCurrency(price) + '</p></div>' +
        '<div class="item-quantity">' +
        '<div class="quantity-selector">' +
        '<button type="button" class="qty-btn minus cart-qty-minus"><i class="fas fa-minus"></i></button>' +
        '<input type="number" value="' + qty + '" min="1" max="999" data-price="' + price + '" data-row-index="' + idx + '">' +
        '<button type="button" class="qty-btn plus cart-qty-plus"><i class="fas fa-plus"></i></button>' +
        '</div>' +
        '</div>' +
        '<div class="item-total"><p class="total-price">' + formatCurrency(total) + '</p></div>' +
        '<div class="item-remove">' +
        '<button type="button" class="btn-remove cart-remove" aria-label="Xóa sản phẩm"><i class="fas fa-trash-alt"></i></button>' +
        '</div>' +
        '</div>'
    );
}

function renderCartPage () {
    const cartItems = document.querySelector('.cart-items');
    const headerEl = document.querySelector('.cart-header');
    if (!cartItems) return;

    loadCartDataFromStorage();
    const items = cartData.items || [];

    if (!items.length) {
        showEmptyCart();
        return;
    }

    if (headerEl) headerEl.style.display = '';
    cartItems.innerHTML = items.map((item, idx) => renderCartRowHTML(item, idx)).join('');

    const selectAll = document.getElementById('selectAll');
    if (selectAll) selectAll.checked = true;

    updateCart();
    persistCartToStorage();
}

// Toggle select all items
function toggleSelectAll () {
    const selectAllCheckbox = document.getElementById('selectAll');
    const itemCheckboxes = document.querySelectorAll('.item-select');

    itemCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });

    updateCart();
}

function updateQuantity (rowIndex, change) {
    loadCartDataFromStorage();
    const items = cartData.items || [];
    const item = items[rowIndex];
    if (!item) return;

    const newQty = (parseInt(item.qty, 10) || 1) + change;
    if (newQty < 1 || newQty > 999) return;

    item.qty = newQty;
    cartData.items = items;
    if (window.ModevaCartStore) {
        ModevaCartStore.write(cartData);
    } else {
        persistCartToStorage();
    }
    renderCartPage();
}

function syncQtyFromInput (rowIndex, sourceInput) {
    loadCartDataFromStorage();
    const items = cartData.items || [];
    const item = items[rowIndex];
    if (!item) return;

    const row = document.querySelector('.cart-item[data-row-index="' + rowIndex + '"]');
    if (!row) return;
    const desktop = row.querySelector('.quantity-selector input');
    const mobile = row.querySelector('.quantity-selector-small input');
    const raw = sourceInput ? sourceInput.value : ((desktop && desktop.value) || (mobile && mobile.value));
    let v = parseInt(raw, 10) || 1;
    v = Math.max(1, Math.min(999, v));
    item.qty = v;
    cartData.items = items;

    if (desktop) desktop.value = v;
    if (mobile) mobile.value = v;

    if (window.ModevaCartStore) {
        ModevaCartStore.write(cartData);
    } else {
        persistCartToStorage();
    }
    updateItemTotal(rowIndex);
    updateCart();
}

function updateItemTotal (rowIndex) {
    const row = document.querySelector('.cart-item[data-row-index="' + rowIndex + '"]');
    if (!row) return;
    const input = row.querySelector('.quantity-selector input');
    const quantity = parseInt(input.value, 10) || 1;
    const price = parseInt(input.getAttribute('data-price'), 10) || 0;
    const total = quantity * price;
    const totalElement = row.querySelector('.total-price');
    if (totalElement) {
        totalElement.textContent = formatCurrency(total);
    }
}

function removeItem (rowIndex) {
    if (!confirm('Bạn có chắc muốn xóa sản phẩm này khỏi giỏ hàng?')) {
        return;
    }

    loadCartDataFromStorage();
    const items = cartData.items || [];
    if (!items[rowIndex]) return;

    items.splice(rowIndex, 1);
    cartData.items = items;
    if (window.ModevaCartStore) {
        ModevaCartStore.write(cartData);
    } else {
        persistCartToStorage();
    }

    if (window.ModevaLogs) {
        ModevaLogs.append('Giỏ hàng: xóa dòng ' + rowIndex, 'info');
    }
    showNotification('Đã xóa sản phẩm khỏi giỏ hàng', 'info');

    renderCartPage();
}

function showEmptyCart () {
    const cartItems = document.querySelector('.cart-items');
    const headerEl = document.querySelector('.cart-header');
    if (!cartItems) return;

    if (headerEl) headerEl.style.display = 'none';

    cartData = {
        items: [],
        subtotal: 0,
        discount: 0,
        shipping: 30000,
        voucherCode: null
    };
    const voucherInput = document.getElementById('voucherCode');
    if (voucherInput) voucherInput.value = '';

    modevaMigrateCartSessionToLocal();
    localStorage.setItem(MODEVA_CART_KEY, JSON.stringify(cartData));
    localStorage.setItem(MODEVA_CART_BADGE_KEY, '0');

    if (typeof window.updateBadges === 'function') {
        window.updateBadges(0);
    } else {
        document.querySelectorAll('.nav-icon .badge, .fashion-icon-link .badge').forEach(badge => {
            badge.textContent = '0';
        });
    }

    cartItems.innerHTML = `
        <div class="empty-cart">
            <i class="fas fa-shopping-cart"></i>
            <h3>Giỏ hàng của bạn đang trống</h3>
            <p>Thêm sản phẩm từ trang Danh mục (nút «Thêm vào giỏ») để xem tại đây.</p>
            <a href="catalog.html" class="btn btn-primary">Đi tới danh mục</a>
        </div>
    `;

    const subEl = document.getElementById('subtotal');
    const discEl = document.getElementById('discount');
    const shipEl = document.getElementById('shipping');
    const totEl = document.getElementById('totalAmount');
    if (subEl) subEl.textContent = formatCurrency(0);
    if (discEl) discEl.textContent = '-' + formatCurrency(0);
    if (shipEl) shipEl.textContent = formatCurrency(0);
    if (totEl) totEl.textContent = formatCurrency(0);
}

function updateCart () {
    let subtotal = 0;
    const selectedItems = document.querySelectorAll('.item-select:checked');

    selectedItems.forEach(checkbox => {
        const cartItem = checkbox.closest('.cart-item');
        const input = cartItem.querySelector('.quantity-selector input, .quantity-selector-small input');
        const quantity = parseInt(input.value, 10);
        const price = parseInt(input.getAttribute('data-price'));
        subtotal += quantity * price;
    });

    cartData.subtotal = subtotal;

    const total = cartData.subtotal - cartData.discount + cartData.shipping;

    const subEl = document.getElementById('subtotal');
    const discEl = document.getElementById('discount');
    const shipEl = document.getElementById('shipping');
    const totEl = document.getElementById('totalAmount');
    if (subEl) subEl.textContent = formatCurrency(cartData.subtotal);
    if (discEl) discEl.textContent = '-' + formatCurrency(cartData.discount);
    if (shipEl) shipEl.textContent = formatCurrency(cartData.shipping);
    if (totEl) totEl.textContent = formatCurrency(total);

    const selectAllLabel = document.querySelector('.select-all label');
    if (selectAllLabel) {
        selectAllLabel.textContent = `Chọn tất cả (${selectedItems.length} sản phẩm)`;
    }

    try {
        modevaMigrateCartSessionToLocal();
        localStorage.setItem(MODEVA_CART_KEY, JSON.stringify(cartData));
    } catch (e) {
        return;
    }
}

function applyVoucher () {
    const voucherInput = document.getElementById('voucherCode');
    const code = voucherInput.value.trim().toUpperCase();

    if (!code) {
        showNotification('Vui lòng nhập mã giảm giá', 'error');
        return;
    }

    const vouchers = {
        WELCOME2025: 50000,
        FREESHIP: 30000,
        SALE100K: 100000
    };

    if (vouchers[code]) {
        const discountAmount = vouchers[code];

        if (code === 'SALE100K' && cartData.subtotal < 1000000) {
            showNotification('Mã giảm giá này yêu cầu đơn hàng tối thiểu 1.000.000₫', 'error');
            return;
        }

        cartData.discount = discountAmount;
        cartData.voucherCode = code;

        if (code === 'FREESHIP') {
            cartData.shipping = 0;
        }

        voucherInput.value = '';
        updateCart();
        if (window.ModevaLogs) {
            ModevaLogs.append('Giỏ hàng: áp dụng voucher ' + code, 'info');
        }
        showNotification('Áp dụng mã giảm giá thành công!', 'success');
    } else {
        if (window.ModevaLogs) {
            ModevaLogs.append('Giỏ hàng: voucher không hợp lệ — ' + code, 'warning');
        }
        showNotification('Mã giảm giá không hợp lệ', 'error');
    }
}

function selectVoucher (code, amount) {
    document.getElementById('voucherCode').value = code;
    applyVoucher();
}

function proceedToCheckout () {
    const selectedItems = document.querySelectorAll('.item-select:checked');

    if (selectedItems.length === 0) {
        showNotification('Vui lòng chọn ít nhất một sản phẩm để thanh toán', 'error');
        return;
    }

    const items = [];
    selectedItems.forEach(function (checkbox) {
        const row = checkbox.closest('.cart-item');
        if (!row) return;
        const nameEl = row.querySelector('.item-name');
        const variantEl = row.querySelector('.item-variant');
        const imgEl = row.querySelector('.item-image img');
        const input = row.querySelector('.quantity-selector input');
        if (!input) return;
        const qty = parseInt(input.value, 10) || 1;
        const price = parseInt(input.getAttribute('data-price'), 10) || 0;
        items.push({
            name: nameEl ? nameEl.textContent.trim() : 'Sản phẩm',
            variant: variantEl ? variantEl.textContent.trim() : '',
            qty: qty,
            price: price,
            image: imgEl ? imgEl.getAttribute('src') : ''
        });
    });

    cartData.items = items;
    updateCart();

    modevaMigrateCartSessionToLocal();
    localStorage.setItem(MODEVA_CART_KEY, JSON.stringify(cartData));
    if (window.ModevaLogs) {
        ModevaLogs.append('Giỏ hàng: chuyển sang thanh toán — ' + items.length + ' dòng đã chọn', 'info');
    }
    window.location.href = 'checkout.html';
}

function formatCurrency (amount) {
    return new Intl.NumberFormat('vi-VN').format(amount) + '₫';
}

const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(-20px);
        }
    }
`;
document.head.appendChild(style);

function bindCartPanelDelegation () {
    const panel = document.querySelector('.cart-items-panel');
    if (!panel || panel.dataset.cartBound === '1') return;
    panel.dataset.cartBound = '1';

    panel.addEventListener('click', function (e) {
        const row = e.target.closest('.cart-item');
        if (!row) return;
        const idx = parseInt(row.getAttribute('data-row-index'), 10);
        if (isNaN(idx)) return;

        if (e.target.closest('.cart-remove')) {
            e.preventDefault();
            removeItem(idx);
            return;
        }
        if (e.target.closest('.cart-qty-minus')) {
            e.preventDefault();
            updateQuantity(idx, -1);
            return;
        }
        if (e.target.closest('.cart-qty-plus')) {
            e.preventDefault();
            updateQuantity(idx, 1);
            return;
        }
    });

    panel.addEventListener('change', function (e) {
        const t = e.target;
        if (t.matches && t.matches('.item-select')) {
            updateCart();
            return;
        }
        if (t.matches && t.matches('input[type="number"]')) {
            const row = t.closest('.cart-item');
            if (!row) return;
            const idx = parseInt(row.getAttribute('data-row-index'), 10);
            if (isNaN(idx)) return;
            syncQtyFromInput(idx, t);
        }
    });
}

document.addEventListener('DOMContentLoaded', function () {
    if (!document.querySelector('.cart-items')) return;
    bindCartPanelDelegation();
    renderCartPage();
});

window.addEventListener('storage', function (e) {
    if (!e || !e.key) return;
    if (e.key !== MODEVA_CART_KEY && e.key !== MODEVA_CART_BADGE_KEY) return;
    if (!document.querySelector('.cart-items')) return;
    renderCartPage();
});
