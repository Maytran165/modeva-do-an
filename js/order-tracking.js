// ===================================
// Order Tracking — đơn từ localStorage, chỉ khách đã đăng nhập
// ===================================

function escOrder (s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatCurrencyOrder (amount) {
    return new Intl.NumberFormat('vi-VN').format(amount) + '₫';
}

function formatOrderDate (iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleDateString('vi-VN');
    } catch (e) {
        return iso;
    }
}

const STATUS_META = {
    processing: { label: 'Đang xử lý', icon: 'fa-clock', cls: 'processing' },
    shipping: { label: 'Đang giao hàng', icon: 'fa-truck', cls: 'shipping' },
    delivered: { label: 'Đã giao hàng', icon: 'fa-check-circle', cls: 'delivered' },
    cancelled: { label: 'Đã hủy', icon: 'fa-times-circle', cls: 'cancelled' }
};

function renderOrderCardHtml (o) {
    const st = STATUS_META[o.status] || STATUS_META.processing;
    const itemsHtml = (o.items || []).map(function (it) {
        const line = escOrder(it.variant || '');
        return (
            '<div class="order-item-row">' +
            (it.image ? '<img src="' + escOrder(it.image) + '" alt="">' : '<div class="order-item-placeholder"></div>') +
            '<div class="item-details">' +
            '<h4>' + escOrder(it.name) + '</h4>' +
            (line ? '<p>' + line + '</p>' : '') +
            '<p>x' + escOrder(String(it.qty || 1)) + '</p>' +
            '</div>' +
            '<div class="item-price">' + formatCurrencyOrder((it.price || 0) * (it.qty || 1)) + '</div>' +
            '</div>'
        );
    }).join('');

    const cancelBtn = o.status === 'processing'
        ? '<button type="button" class="btn btn-secondary-modern" onclick="cancelOrder(\'' + escOrder(o.orderId).replace(/'/g, "\\'") + '\')">Hủy đơn</button>'
        : '';

    // Khách hàng không được in phiếu giao (chỉ Admin/Staff).
    const printBtn = '';

    return (
        '<article class="order-card" data-status="' + escOrder(o.status) + '" data-order-id="' + escOrder(o.orderId) + '">' +
        '<div class="order-header">' +
        '<div class="order-info">' +
        '<span class="order-id">#' + escOrder(o.orderId) + '</span>' +
        '<span class="order-date"><i class="far fa-calendar"></i> ' + formatOrderDate(o.createdAt) + '</span>' +
        '</div>' +
        '<div class="order-status ' + st.cls + '"><i class="fas ' + st.icon + '"></i> ' + st.label + '</div>' +
        '</div>' +
        '<div class="order-items">' + itemsHtml + '</div>' +
        '<div class="order-footer">' +
        '<div class="order-total"><span>Tổng tiền:</span><span class="total-amount">' + formatCurrencyOrder(o.total || 0) + '</span></div>' +
        '<div class="order-actions">' + cancelBtn +
        printBtn +
        '<button type="button" class="btn btn-primary-modern" onclick="viewOrderDetail(\'' + escOrder(o.orderId).replace(/'/g, "\\'") + '\')">Xem chi tiết</button>' +
        '</div></div>' +
        '<div class="progress-tracker">' +
        '<div class="progress-step completed"><div class="step-icon"><i class="fas fa-check-circle"></i></div><div class="step-content"><h5>Đơn hàng đã đặt</h5><p>' + formatOrderDate(o.createdAt) + '</p></div></div>' +
        '<div class="progress-step ' + (o.status === 'processing' ? 'active' : (o.status === 'cancelled' ? '' : 'completed')) + '"><div class="step-icon"><i class="fas fa-box"></i></div><div class="step-content"><h5>Xử lý</h5><p>' + (o.status === 'cancelled' ? 'Đã hủy' : 'Đang cập nhật') + '</p></div></div>' +
        '</div>' +
        '</article>'
    );
}

function getOrderFromStorage (orderId) {
    const sess = window.ModevaAuth && ModevaAuth.getSession();
    if (!sess || sess.role !== 'customer') return null;
    const list = ModevaAuth.getCustomerOrders(sess.email);
    return (list || []).find(function (x) {
        return String(x.orderId) === String(orderId);
    }) || null;
}

// NOTE: printDeliverySlip đã bị gỡ khỏi phía khách (chỉ Admin/Staff được in).

function refreshOrdersFromStorage () {
    const mount = document.getElementById('ordersListMount');
    const emptyEl = document.getElementById('ordersEmptyState');
    if (!mount || !window.ModevaAuth) return;

    const sess = ModevaAuth.getSession();
    if (!sess || sess.role !== 'customer') return;

    const list = ModevaAuth.getCustomerOrders(sess.email);
    if (!list.length) {
        mount.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'block';
    } else {
        if (emptyEl) emptyEl.style.display = 'none';
        mount.innerHTML = list.map(renderOrderCardHtml).join('');
    }
    updateTabCounts();
    const active = document.querySelector('.order-tabs .tab-btn.active');
    if (active) {
        const tab = active.getAttribute('data-tab') || 'all';
        filterOrders(tab, active);
    } else {
        filterOrders('all', document.querySelector('.order-tabs .tab-btn[data-tab="all"]'));
    }
}

function filterOrders (status, btn) {
    document.querySelectorAll('.order-tabs .tab-btn').forEach(function (b) {
        b.classList.remove('active');
    });
    if (btn) {
        btn.classList.add('active');
    } else {
        const f = document.querySelector('.order-tabs .tab-btn[data-tab="' + status + '"]');
        if (f) f.classList.add('active');
    }

    const orders = document.querySelectorAll('#ordersListMount .order-card');
    orders.forEach(function (order) {
        if (status === 'all') {
            order.style.display = 'block';
        } else if (order.getAttribute('data-status') === status) {
            order.style.display = 'block';
        } else {
            order.style.display = 'none';
        }
    });

    const emptyOrders = document.getElementById('ordersEmptyState');
    const totalStored = document.querySelectorAll('#ordersListMount .order-card').length;
    if (emptyOrders) {
        emptyOrders.style.display = totalStored === 0 ? 'block' : 'none';
    }
}

function cancelOrder (orderId) {
    if (!confirm('Bạn có chắc muốn hủy đơn hàng này?')) return;

    const sess = window.ModevaAuth && ModevaAuth.getSession();
    if (sess && sess.role === 'customer') {
        ModevaAuth.setCustomerOrderStatus(sess.email, orderId, 'cancelled');
    }

    const orderCard = findOrderCard(orderId);
    if (orderCard) {
        orderCard.setAttribute('data-status', 'cancelled');
        const statusElement = orderCard.querySelector('.order-status');
        if (statusElement) {
            statusElement.className = 'order-status cancelled';
            statusElement.innerHTML = '<i class="fas fa-times-circle"></i> Đã hủy';
        }
        const orderActions = orderCard.querySelector('.order-actions');
        if (orderActions) {
            orderActions.innerHTML =
                '<button type="button" class="btn btn-secondary-modern" onclick="repurchase(\'' + orderId.replace(/'/g, "\\'") + '\')">Mua lại</button>' +
                '<button type="button" class="btn btn-primary-modern" onclick="viewOrderDetail(\'' + orderId.replace(/'/g, "\\'") + '\')">Xem chi tiết</button>';
        }
        const progress = orderCard.querySelector('.progress-tracker');
        if (progress) progress.remove();
        showNotification('Đã hủy đơn hàng thành công', 'success');
        updateTabCounts();
    }
}

function viewOrderDetail (orderId) {
    const modal = document.getElementById('orderDetailModal');
    const modalBody = modal && modal.querySelector('.modal-body');
    const modalTitle = modal && modal.querySelector('.modal-header h2');
    if (!modal || !modalBody) return;

    const orderCard = findOrderCard(orderId);
    if (orderCard) {
        const orderHtml = orderCard.cloneNode(true);
        const actions = orderHtml.querySelector('.order-actions');
        if (actions) actions.remove();
        modalBody.innerHTML = orderHtml.innerHTML;
        if (modalTitle) modalTitle.textContent = 'Chi tiết đơn hàng #' + orderId;
        modal.classList.add('show');
    }
}

function closeModal () {
    document.querySelectorAll('.modal').forEach(function (modal) {
        modal.classList.remove('show');
    });
}

function trackShipping (trackingCode) {
    showNotification('Theo dõi vận đơn: ' + trackingCode, 'info');
    window.open('https://ghn.vn/tracking?code=' + encodeURIComponent(trackingCode), '_blank');
}

function repurchase (orderId) {
    showNotification('Đã chuyển tới giỏ hàng (demo)', 'success');
    setTimeout(function () {
        window.location.href = 'cart.html';
    }, 600);
}

function reviewOrder (orderId) {
    showNotification('Chức năng đánh giá đang được phát triển', 'info');
}

function findOrderCard (orderId) {
    return document.querySelector('#ordersListMount .order-card[data-order-id="' + orderId.replace(/"/g, '') + '"]');
}

function updateTabCounts () {
    const root = document.getElementById('ordersListMount');
    if (!root) return;
    const allCount = root.querySelectorAll('.order-card').length;
    const processingCount = root.querySelectorAll('.order-card[data-status="processing"]').length;
    const shippingCount = root.querySelectorAll('.order-card[data-status="shipping"]').length;
    const deliveredCount = root.querySelectorAll('.order-card[data-status="delivered"]').length;
    const cancelledCount = root.querySelectorAll('.order-card[data-status="cancelled"]').length;

    const tabs = document.querySelectorAll('.order-tabs .tab-btn');
    if (tabs[0]) tabs[0].querySelector('.count').textContent = allCount;
    if (tabs[1]) tabs[1].querySelector('.count').textContent = processingCount;
    if (tabs[2]) tabs[2].querySelector('.count').textContent = shippingCount;
    if (tabs[3]) tabs[3].querySelector('.count').textContent = deliveredCount;
    if (tabs[4]) tabs[4].querySelector('.count').textContent = cancelledCount;
}

function showNotification (message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'notification ' + type;
    notification.style.cssText =
        'position: fixed; top: 20px; right: 20px; padding: 15px 20px; background: ' +
        (type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#3B82F6') +
        '; color: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); z-index: 10000; max-width: 300px;';
    notification.innerHTML =
        '<i class="fas fa-' + (type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle') + '"></i>' +
        '<span style="margin-left: 10px;">' + escOrder(message) + '</span>';
    document.body.appendChild(notification);
    setTimeout(function () {
        notification.remove();
    }, 3000);
}

const orderTrackingStyle = document.createElement('style');
orderTrackingStyle.textContent = `
    .order-item-placeholder { width: 80px; height: 80px; background: var(--ink-06, #eee); border-radius: 8px; flex-shrink: 0; }
`;
document.head.appendChild(orderTrackingStyle);

document.addEventListener('click', function (event) {
    document.querySelectorAll('.modal.show').forEach(function (modal) {
        if (event.target === modal) closeModal();
    });
});

function applyOrderSearch () {
    const q = (document.getElementById('orderSearchInput') && document.getElementById('orderSearchInput').value || '').trim().toLowerCase();
    document.querySelectorAll('#ordersListMount .order-card').forEach(function (card) {
        const id = (card.getAttribute('data-order-id') || '').toLowerCase();
        card.style.display = !q || id.includes(q) ? 'block' : 'none';
    });
}

document.addEventListener('DOMContentLoaded', function () {
    const gate = document.getElementById('orderGuestGate');
    const authBlock = document.getElementById('orderTrackingAuthenticated');

    if (!window.ModevaAuth) {
        if (gate) gate.hidden = false;
        return;
    }

    const sess = ModevaAuth.getSession();
    if (!sess || sess.role !== 'customer') {
        if (window.ModevaLogs) {
            ModevaLogs.append('Đơn hàng: truy cập — yêu cầu đăng nhập khách', 'info');
        }
        if (gate) gate.hidden = false;
        if (authBlock) authBlock.hidden = true;
    } else {
        if (gate) gate.hidden = true;
        if (authBlock) authBlock.hidden = false;

        const nameEl = document.getElementById('orderSidebarName');
        const emailEl = document.getElementById('orderSidebarEmail');
        const avEl = document.getElementById('orderSidebarAvatar');
        if (nameEl) nameEl.textContent = sess.name || 'Khách hàng';
        if (emailEl) emailEl.textContent = sess.email || '';
        if (avEl && sess.name) avEl.textContent = String(sess.name).slice(0, 2).toUpperCase();

        const logout = document.getElementById('orderSidebarLogout');
        if (logout) {
            logout.addEventListener('click', function (e) {
                e.preventDefault();
                ModevaAuth.logout();
            });
        }

        refreshOrdersFromStorage();

        if (window.ModevaLogs) {
            ModevaLogs.append('Đơn hàng: mở trang theo dõi — ' + (sess.email || 'khách'), 'info');
        }

        const lastOrder = localStorage.getItem('lastOrder');
        if (lastOrder) {
            try {
                const orderData = JSON.parse(lastOrder);
                showNotification('Đơn ' + orderData.orderId + ' đã được tạo thành công!', 'success');
            } catch (err) { /* ignore */ }
            localStorage.removeItem('lastOrder');
        }
    }

    const searchBtn = document.getElementById('orderSearchBtn');
    const searchInput = document.getElementById('orderSearchInput');
    if (searchBtn) searchBtn.addEventListener('click', applyOrderSearch);
    if (searchInput) searchInput.addEventListener('input', applyOrderSearch);
});
