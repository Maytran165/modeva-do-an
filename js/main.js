/* ============================================================
   MODEVA 2026 — Main JavaScript
   Covers: slider · countdown · auth tabs · profile dashboard ·
           catalog filter / sort / search · cart badge · toasts
   ============================================================ */

'use strict';

function escToastText (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Toast notification system ─────────────────────────────── */
(function () {
  const container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);

  const ICONS = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' };

  window.showNotification = function (message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${ICONS[type] || ICONS.info}"></i><span>${escToastText(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('removing');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, 3400);
  };
})();

/* ── Header: scroll shadow + mobile nav ────────────────────── */
document.addEventListener('DOMContentLoaded', function () {

  const header = document.querySelector('.fashion-header');
  if (header) {
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Mobile nav toggle
  const mobileBtn = document.querySelector('.mobile-nav-btn');
  const fashionNav = document.querySelector('.fashion-nav');
  if (mobileBtn && fashionNav) {
    mobileBtn.addEventListener('click', () => {
      const open = fashionNav.classList.toggle('is-open');
      mobileBtn.setAttribute('aria-expanded', String(open));
    });
  }

  /* ── Hero slider ─────────────────────────────────────────── */
  initHeroSlider();

  /* ── Countdown timer ─────────────────────────────────────── */
  initCountdown();

  /* ── Auth tabs (account page) ────────────────────────────── */
  initAuthTabs();
  initAccountOtp();

  /* ── Profile dashboard tabs ──────────────────────────────── */
  initProfileTabs();

  /* ── Catalog: filter + sort + search ─────────────────────── */
  initCatalog();

  /* ── Cart badge sync ─────────────────────────────────────── */
  syncCartBadge();

  /* ── URL param: pre-fill search ──────────────────────────── */
  prefillSearchFromURL();

  /* ── Mobile filter toggle (catalog) ─────────────────────── */
  const mobileFilterBtn = document.querySelector('.mobile-filter-toggle');
  const filterSidebar   = document.querySelector('.filter-sidebar');
  if (mobileFilterBtn && filterSidebar) {
    mobileFilterBtn.addEventListener('click', () => {
      filterSidebar.classList.toggle('is-open');
      const icon = mobileFilterBtn.querySelector('i');
      if (icon) icon.className = filterSidebar.classList.contains('is-open') ? 'fas fa-times' : 'fas fa-sliders';
    });
  }

  console.log('[Modeva 2026] Initialized');
});

/* ============================================================
   HERO SLIDER
   ============================================================ */
function initHeroSlider () {
  const slider = document.querySelector('[data-slider]');
  if (!slider) return;

  const slides = slider.querySelectorAll('[data-slide]');
  const dots   = slider.querySelectorAll('[data-slide-to]');
  if (!slides.length) return;

  let current = 0;
  let timer;

  function goTo (index) {
    slides[current].classList.remove('is-active');
    dots[current]?.classList.remove('is-active');
    current = (index + slides.length) % slides.length;
    slides[current].classList.add('is-active');
    dots[current]?.classList.add('is-active');
  }

  function next () { goTo(current + 1); }

  function startAuto () {
    clearInterval(timer);
    timer = setInterval(next, 5000);
  }

  // Dot click
  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => { goTo(i); startAuto(); });
  });

  // Touch/swipe support
  let touchStartX = 0;
  slider.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
  slider.addEventListener('touchend',   e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) { goTo(dx < 0 ? current + 1 : current - 1); startAuto(); }
  });

  // Pause on hover
  slider.addEventListener('mouseenter', () => clearInterval(timer));
  slider.addEventListener('mouseleave', startAuto);

  startAuto();
}

/* ============================================================
   COUNTDOWN TIMER
   ============================================================ */
function initCountdown () {
  const el = document.querySelector('[data-countdown]');
  if (!el) return;

  const target = new Date(el.getAttribute('data-countdown')).getTime();
  const dEl = el.querySelector('[data-countdown-days]');
  const hEl = el.querySelector('[data-countdown-hours]');
  const mEl = el.querySelector('[data-countdown-minutes]');
  const sEl = el.querySelector('[data-countdown-seconds]');

  function pad (n) { return String(n).padStart(2, '0'); }

  function tick () {
    const diff = target - Date.now();
    if (diff <= 0) {
      el.innerHTML = '<span style="color:var(--accent);font-weight:700">Flash sale đã kết thúc</span>';
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000)  / 60000);
    const s = Math.floor((diff % 60000)    / 1000);
    if (dEl) dEl.textContent = pad(d);
    if (hEl) hEl.textContent = pad(h);
    if (mEl) mEl.textContent = pad(m);
    if (sEl) sEl.textContent = pad(s);
  }

  tick();
  setInterval(tick, 1000);
}

/* ============================================================
   AUTH TABS  (login / register / forgot)
   ============================================================ */
function initAuthTabs () {
  // Tab buttons  →  data-auth-target="login|register|forgot"
  document.querySelectorAll('[data-auth-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-auth-target');
      activateAuthPanel(target);
    });
  });
}

function activateAuthPanel (target) {
  document.querySelectorAll('.auth-tab').forEach(t => {
    t.classList.toggle('is-active', t.getAttribute('data-auth-target') === target);
  });
  document.querySelectorAll('.auth-panel').forEach(p => {
    p.classList.toggle('is-active', p.id === target);
  });
}

function validatePasswordPolicy (password) {
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasAllowedSpecial = /[@#*]/.test(password);
  const hasBlockedSpecial = /[.,]/.test(password);
  if (password.length < 8) {
    return { ok: false, message: 'Mật khẩu phải có ít nhất 8 ký tự' };
  }
  if (!hasUppercase || !hasLowercase || !hasAllowedSpecial || hasBlockedSpecial) {
    return { ok: false, message: 'Mật khẩu phải có chữ hoa, chữ thường, ký tự @ # * và không chứa . hoặc ,' };
  }
  if (!/\d/.test(password)) {
    return { ok: false, message: 'Mật khẩu phải có ít nhất một chữ số (0–9)' };
  }
  return { ok: true };
}

var _registerOtpTick = null;
var _forgotOtpTick = null;

function startOtpCooldownUi (emailGetter, purpose, btnId, timerId) {
  const btn = document.getElementById(btnId);
  const span = document.getElementById(timerId);
  let iv = null;
  function tick () {
    if (!window.ModevaOtp) return;
    const sec = ModevaOtp.getCooldownRemaining(emailGetter(), purpose);
    if (sec > 0) {
      if (span) {
        span.hidden = false;
        span.textContent = 'Gửi lại sau ' + sec + 's';
      }
      if (btn) btn.disabled = true;
    } else {
      if (span) span.hidden = true;
      if (btn) btn.disabled = false;
      if (iv) clearInterval(iv);
    }
  }
  tick();
  iv = setInterval(tick, 1000);
  return iv;
}

function initAccountOtp () {
  const btnReg = document.getElementById('btnSendRegisterOtp');
  const btnForgot = document.getElementById('btnSendForgotOtp');
  const btnReset = document.getElementById('btnForgotReset');

  if (!window.ModevaOtp) return;

  if (btnReg) {
    btnReg.addEventListener('click', function () {
      const emailEl = document.getElementById('registerEmail');
      const hint = document.getElementById('registerOtpHint');
      if (!emailEl) return;
      const emailNorm = emailEl.value.trim().toLowerCase();
      if (!/^[^\s@]+@gmail\.com$/.test(emailNorm)) {
        showNotification('Nhập email @gmail.com hợp lệ trước khi gửi OTP.', 'error');
        emailEl.focus();
        return;
      }
      if (!window.ModevaAuth || !ModevaAuth.isEmailRegistered) return;
      if (ModevaAuth.isEmailRegistered(emailNorm)) {
        showNotification('Email này đã đăng ký. Hãy đăng nhập hoặc dùng email khác.', 'error');
        return;
      }
      emailEl.value = emailNorm;
      btnReg.disabled = true;
      ModevaOtp.send(emailNorm, 'register').then(function (res) {
        if (res.ok) {
          showNotification(res.message, 'success');
          if (hint) {
            if (res.demoMode && res.demoCode) {
              hint.hidden = false;
              hint.innerHTML =
                '<strong>Demo:</strong> mã OTP là <strong>' + escToastText(res.demoCode) +
                '</strong> (khi bật EmailJS, mã chỉ gửi qua email).';
            } else {
              hint.hidden = true;
              hint.textContent = '';
            }
          }
          if (_registerOtpTick) clearInterval(_registerOtpTick);
          _registerOtpTick = startOtpCooldownUi(function () {
            const el = document.getElementById('registerEmail');
            return el ? el.value.trim() : '';
          }, 'register', 'btnSendRegisterOtp', 'registerOtpTimer');
        } else {
          showNotification(res.message || 'Không gửi được mã.', 'error');
          btnReg.disabled = false;
          if (res.waitSec && hint) {
            hint.hidden = false;
            hint.textContent = 'Chờ ' + res.waitSec + ' giây trước khi gửi lại.';
          }
        }
      });
    });
  }

  if (btnForgot) {
    btnForgot.addEventListener('click', function () {
      const emailEl = document.getElementById('forgotEmail');
      const hint = document.getElementById('forgotOtpHint');
      if (!emailEl || !window.ModevaAuth) return;
      const emailNorm = emailEl.value.trim().toLowerCase();
      if (!/^[^\s@]+@gmail\.com$/.test(emailNorm)) {
        showNotification('Nhập email @gmail.com đã đăng ký.', 'error');
        emailEl.focus();
        return;
      }
      const gate = ModevaAuth.canResetPasswordViaOtp(emailNorm);
      if (!gate.ok) {
        showNotification(gate.message, 'error');
        return;
      }
      emailEl.value = emailNorm;
      btnForgot.disabled = true;
      ModevaOtp.send(emailNorm, 'forgot').then(function (res) {
        if (res.ok) {
          showNotification(res.message, 'success');
          if (hint) {
            if (res.demoMode && res.demoCode) {
              hint.hidden = false;
              hint.innerHTML =
                '<strong>Demo:</strong> mã OTP là <strong>' + escToastText(res.demoCode) +
                '</strong> (khi bật EmailJS, mã chỉ gửi qua email).';
            } else {
              hint.hidden = true;
              hint.textContent = '';
            }
          }
          if (_forgotOtpTick) clearInterval(_forgotOtpTick);
          _forgotOtpTick = startOtpCooldownUi(function () {
            const el = document.getElementById('forgotEmail');
            return el ? el.value.trim() : '';
          }, 'forgot', 'btnSendForgotOtp', 'forgotOtpTimer');
        } else {
          showNotification(res.message || 'Không gửi được mã.', 'error');
          btnForgot.disabled = false;
        }
      });
    });
  }

  const otpBanner = document.getElementById('otpEmailServiceHint');
  if (otpBanner && window.ModevaOtp && typeof ModevaOtp.isEmailConfigured === 'function') {
    if (ModevaOtp.isEmailConfigured()) {
      otpBanner.hidden = true;
    } else {
      otpBanner.hidden = false;
      otpBanner.textContent =
        'Chưa cấu hình EmailJS trong file js/modeva-email-config.js — mã OTP chỉ hiện trên trang (demo). Điền publicKey, serviceId, templateId để gửi mail thật.';
    }
  }

  if (btnReset) {
    btnReset.addEventListener('click', function () {
      const emailEl = document.getElementById('forgotEmail');
      const otpEl = document.getElementById('forgotOtp');
      const pwEl = document.getElementById('forgotNewPassword');
      const cfEl = document.getElementById('forgotConfirmPassword');
      if (!emailEl || !otpEl || !pwEl || !cfEl || !window.ModevaAuth || !window.ModevaOtp) return;
      const emailNorm = emailEl.value.trim().toLowerCase();
      const otp = otpEl.value.trim();
      const pw = pwEl.value;
      if (!/^[^\s@]+@gmail\.com$/.test(emailNorm)) {
        showNotification('Nhập email @gmail.com.', 'error');
        return;
      }
      if (!/^\d{6}$/.test(otp)) {
        showNotification('Nhập mã OTP 6 chữ số.', 'error');
        otpEl.focus();
        return;
      }
      if (!ModevaOtp.verify(emailNorm, 'forgot', otp)) {
        showNotification('Mã OTP không đúng hoặc đã hết hạn', 'error');
        return;
      }
      const pv = validatePasswordPolicy(pw);
      if (!pv.ok) {
        showNotification(pv.message, 'error');
        return;
      }
      if (pw !== cfEl.value) {
        showNotification('Xác nhận mật khẩu không khớp', 'error');
        return;
      }
      ModevaAuth.resetPasswordForEmail(emailNorm, pw).then(function (res) {
        if (res.ok) {
          showNotification('Đã đặt lại mật khẩu. Vui lòng đăng nhập.', 'success');
          activateAuthPanel('login');
          const idEl = document.getElementById('loginIdentifier');
          if (idEl) idEl.value = emailNorm;
        } else {
          showNotification(res.message || 'Không đặt lại được.', 'error');
        }
      });
    });
  }
}

// Called by form onsubmit handlers
window.demoAuthAction = function (msg) {
  showNotification(msg, 'success');
  // After successful register/login pretend user is in
  const dashboardSection = document.getElementById('profile');
  if (dashboardSection) {
    setTimeout(() => {
      dashboardSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 600);
  }
};

// Registration validation (account page)
window.handleRegisterSubmit = function (event) {
  event.preventDefault();

  const phoneInput = document.getElementById('registerPhone');
  const passwordInput = document.getElementById('registerPassword');
  const confirmPasswordInput = document.getElementById('registerConfirmPassword');

  if (!phoneInput || !passwordInput || !confirmPasswordInput) {
    showNotification('Không tìm thấy trường đăng ký để kiểm tra dữ liệu', 'error');
    return false;
  }

  const phoneRaw = phoneInput.value.trim();
  const phoneNormalized = phoneRaw.replace(/\D/g, '');
  if (!/^\d{10}$/.test(phoneNormalized)) {
    showNotification('Số điện thoại phải đúng 10 chữ số', 'error');
    phoneInput.focus();
    return false;
  }

  // Normalize phone field to 10 digits before continue
  phoneInput.value = phoneNormalized;

  const password = passwordInput.value;
  const pv = validatePasswordPolicy(password);
  if (!pv.ok) {
    showNotification(pv.message, 'error');
    passwordInput.focus();
    return false;
  }

  if (password !== confirmPasswordInput.value) {
    showNotification('Xác nhận mật khẩu không khớp', 'error');
    confirmPasswordInput.focus();
    return false;
  }

  const nameInput = document.getElementById('registerName');
  const emailInput = document.getElementById('registerEmail');
  if (!nameInput || !emailInput) {
    showNotification('Không tìm thấy biểu mẫu đăng ký đầy đủ', 'error');
    return false;
  }

  const emailNorm = emailInput.value.trim().toLowerCase();
  if (!/^[^\s@]+@gmail\.com$/.test(emailNorm)) {
    showNotification('Chỉ chấp nhận đăng ký bằng email @gmail.com.', 'error');
    emailInput.focus();
    return false;
  }
  emailInput.value = emailNorm;

  const otpInput = document.getElementById('registerOtp');
  const otpVal = otpInput ? otpInput.value.trim() : '';
  if (!/^\d{6}$/.test(otpVal)) {
    showNotification('Nhập mã OTP 6 chữ số đã gửi tới email (bấm «Gửi mã OTP» trước).', 'error');
    if (otpInput) otpInput.focus();
    return false;
  }
  if (!window.ModevaOtp || !ModevaOtp.verify(emailNorm, 'register', otpVal)) {
    showNotification('Mã OTP không đúng hoặc đã hết hạn. Gửi lại mã nếu cần.', 'error');
    return false;
  }

  if (!window.ModevaAuth) {
    showNotification('Tải trang chưa hoàn tất, thử lại sau', 'error');
    return false;
  }

  ModevaAuth.registerCustomer({
    name: nameInput.value.trim(),
    email: emailNorm,
    phone: phoneNormalized,
    password
  }).then(function (res) {
    if (res.ok) {
      showNotification('Đăng ký thành công! Bạn được tặng 2 voucher chào mừng.', 'success');
      setTimeout(function () {
        window.location.href = 'account.html?member=1';
      }, 550);
    } else {
      showNotification(res.message, 'error');
    }
  });

  return false;
};

// Hồ sơ khách — SĐT bắt buộc đúng 10 chữ số
window.handleProfileSubmit = function (event) {
  event.preventDefault();
  var nameEl = document.getElementById('profileFullName');
  var phoneEl = document.getElementById('profilePhone');
  if (!nameEl || !phoneEl) {
    showNotification('Không tìm thấy biểu mẫu hồ sơ.', 'error');
    return false;
  }
  var phoneNormalized = phoneEl.value.replace(/\D/g, '');
  if (!/^\d{10}$/.test(phoneNormalized)) {
    showNotification('Số điện thoại phải đúng 10 chữ số', 'error');
    phoneEl.focus();
    return false;
  }
  phoneEl.value = phoneNormalized;
  if (!window.ModevaAuth) {
    showNotification('Tải trang chưa hoàn tất, thử lại sau', 'error');
    return false;
  }
  var res = ModevaAuth.updateCustomerContact(nameEl.value.trim(), phoneNormalized);
  if (res.ok) {
    demoAuthAction('Đã cập nhật hồ sơ cá nhân');
  } else {
    showNotification(res.message || 'Không lưu được hồ sơ.', 'error');
  }
  return false;
};

/* ============================================================
   PROFILE DASHBOARD TABS
   ============================================================ */
function initProfileTabs () {
  document.querySelectorAll('[data-account-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-account-target');

      document.querySelectorAll('.profile-menu__item').forEach(b => {
        b.classList.toggle('is-active', b.getAttribute('data-account-target') === target);
      });
      document.querySelectorAll('.account-section').forEach(s => {
        s.classList.toggle('is-active', s.id === target);
      });
    });
  });
}

/* ============================================================
   CATALOG  — filter · sort · search · count
   ============================================================ */
function initCatalog () {
  const grid = document.getElementById('catalogGrid');
  if (!grid) return;

  if (window.ModevaCatalogSync && typeof window.ModevaCatalogSync.hydrateGrid === 'function') {
    window.ModevaCatalogSync.hydrateGrid(grid);
  }

  grid.addEventListener('click', function (e) {
    const sizeEl = e.target.closest('.catalog-size-item');
    if (sizeEl) {
      const card = sizeEl.closest('.catalog-product-card');
      if (!card) return;
      card.querySelectorAll('.catalog-size-item').forEach(function (x) { x.classList.remove('active'); });
      sizeEl.classList.add('active');
      syncCatalogAddButton(card);
      return;
    }

    const colorEl = e.target.closest('.catalog-color-item');
    if (colorEl) {
      const card = colorEl.closest('.catalog-product-card');
      if (!card) return;
      card.querySelectorAll('.catalog-color-item').forEach(function (x) { x.classList.remove('active'); });
      colorEl.classList.add('active');
      syncCatalogAddButton(card);
      return;
    }

    const btn = e.target.closest('.catalog-add-cart');
    if (!btn) return;
    e.preventDefault();
    const card = btn.closest('.catalog-product-card');
    if (card) addCatalogLineFromCard(card);
  });

  function syncCatalogAddButton (card) {
    if (!card) return;
    const btn = card.querySelector('.catalog-add-cart');
    if (!btn) return;
    const sizeOk = !!card.querySelector('.catalog-size-item.active');
    const colorOk = !!card.querySelector('.catalog-color-item.active');
    btn.disabled = !(sizeOk && colorOk);
  }

  const searchInput = document.getElementById('catalogSearch');
  const sortSelect  = document.getElementById('sortSelect');
  const clearBtn    = document.getElementById('clearFilters');
  const countEl     = document.getElementById('productCount');
  const activeFiltersEl = document.getElementById('activeFilters');

  // Gather all product cards into an array with parsed data
  const allCards = Array.from(grid.querySelectorAll('.catalog-product-card')).map(card => ({
    el:       card,
    name:     (card.dataset.name     || '').toLowerCase(),
    category: (card.dataset.category || '').toLowerCase(),
    price:    parseInt(card.dataset.price || '0', 10),
    sizes:    (card.dataset.size  || '').toLowerCase().split(',').map(s => s.trim()),
    colors:   (card.dataset.color || '').toLowerCase().split(',').map(c => c.trim()),
    newest:   parseInt(card.dataset.newest || '0', 10),
  }));

  function getActiveFilters () {
    const cats    = [...document.querySelectorAll('[data-filter="category"]:checked')].map(i => i.value);
    const prices  = [...document.querySelectorAll('[data-filter="price"]:checked')].map(i => i.value);
    const sizes   = [...document.querySelectorAll('[data-filter="size"]:checked')].map(i => i.value.toLowerCase());
    const colors  = [...document.querySelectorAll('[data-filter="color"]:checked')].map(i => i.value.toLowerCase());
    const query   = searchInput ? searchInput.value.trim().toLowerCase() : '';
    return { cats, prices, sizes, colors, query };
  }

  function priceInRange (price, range) {
    const [lo, hi] = range.split('-').map(Number);
    return price >= lo && price <= hi;
  }

  function applyFilters () {
    grid.classList.add('is-filtering');

    setTimeout(() => {
      const { cats, prices, sizes, colors, query } = getActiveFilters();
      const sortVal = sortSelect ? sortSelect.value : 'featured';

      // Filter
      let visible = allCards.filter(c => {
        if (cats.length   && !cats.includes(c.category)) return false;
        if (prices.length && !prices.some(r => priceInRange(c.price, r))) return false;
        if (sizes.length  && !sizes.some(s => c.sizes.includes(s))) return false;
        if (colors.length && !colors.some(col => c.colors.includes(col))) return false;
        if (query         && !c.name.includes(query)) return false;
        return true;
      });

      // Sort
      visible = [...visible];
      if (sortVal === 'price-asc')  visible.sort((a, b) => a.price - b.price);
      if (sortVal === 'price-desc') visible.sort((a, b) => b.price - a.price);
      if (sortVal === 'newest')     visible.sort((a, b) => b.newest - a.newest);

      const visibleSet = new Set(visible);
      allCards.forEach(c => {
        if (visibleSet.has(c)) c.el.removeAttribute('data-hidden');
        else c.el.setAttribute('data-hidden', 'true');
      });
      visible.forEach(c => grid.appendChild(c.el));
      allCards.filter(c => !visibleSet.has(c)).forEach(c => grid.appendChild(c.el));

      // Empty state
      const emptyEl = grid.querySelector('.catalog-empty');
      if (!visible.length) {
        if (!emptyEl) {
          const d = document.createElement('div');
          d.className = 'catalog-empty';
          d.innerHTML = '<i class="fas fa-magnifying-glass"></i><h3>Không tìm thấy sản phẩm phù hợp</h3><p>Hãy thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.</p>';
          grid.appendChild(d);
        }
      } else {
        emptyEl?.remove();
      }

      // Update count
      if (countEl) countEl.textContent = visible.length;

      // Active filter chips
      renderActiveFilterChips({ cats, prices, sizes, colors, query });

      grid.classList.remove('is-filtering');
    }, 80);
  }

  function renderActiveFilterChips ({ cats, prices, sizes, colors, query }) {
    if (!activeFiltersEl) return;
    // Keep the label, remove old chips
    activeFiltersEl.querySelectorAll('.active-filter-tag').forEach(t => t.remove());

    const LABEL_MAP = {
      men: 'Nam', women: 'Nữ', kids: 'Trẻ em', accessories: 'Phụ kiện',
      '0-500000': 'Dưới 500K', '500000-1000000': '500K–1M', '1000000-2000000': '1M–2M',
    };
    const all = [
      ...cats.map(v   => ({ type: 'category', value: v, label: LABEL_MAP[v] || v })),
      ...prices.map(v => ({ type: 'price',    value: v, label: LABEL_MAP[v] || v })),
      ...sizes.map(v  => ({ type: 'size',     value: v, label: v.toUpperCase() })),
      ...colors.map(v => ({ type: 'color',    value: v, label: v })),
      ...(query ? [{ type: 'search', value: query, label: `"${query}"` }] : []),
    ];

    all.forEach(f => {
      const chip = document.createElement('span');
      chip.className = 'active-filter-tag';
      chip.innerHTML = `${f.label} <i class="fas fa-xmark"></i>`;
      chip.addEventListener('click', () => {
        if (f.type === 'search') {
          if (searchInput) { searchInput.value = ''; }
        } else {
          const cb = document.querySelector(`[data-filter="${f.type}"][value="${f.value}"]`);
          if (cb) cb.checked = false;
        }
        applyFilters();
      });
      activeFiltersEl.appendChild(chip);
    });
  }

  // Initial render / count
  applyFilters();

  // Event listeners
  document.querySelectorAll('[data-filter]').forEach(cb => cb.addEventListener('change', applyFilters));
  if (sortSelect)  sortSelect.addEventListener('change', applyFilters);
  if (searchInput) {
    let searchTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(applyFilters, 280);
    });
    // Enter key on search
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); applyFilters(); }
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(cb => { cb.checked = false; });
      if (sortSelect)  sortSelect.value = 'featured';
      if (searchInput) searchInput.value = '';
      applyFilters();
    });
  }

  // Handle catalog URL param ?q=keyword
  const urlQ = new URLSearchParams(window.location.search).get('q');
  if (urlQ && searchInput) {
    searchInput.value = urlQ;
    applyFilters();
  }
  // Handle catalog URL param ?category=men|women|kids|accessories
  const urlCat = new URLSearchParams(window.location.search).get('category');
  if (urlCat) {
    const catCb = document.querySelector(`[data-filter="category"][value="${urlCat}"]`);
    if (catCb) { catCb.checked = true; applyFilters(); }
  }
}

/* ── Prefill homepage search bar from URL ───────────────────── */
function prefillSearchFromURL () {
  const q = new URLSearchParams(window.location.search).get('q');
  if (!q) return;
  const input = document.querySelector('.fashion-search input[type="search"]');
  if (input) input.value = q;
}

/* ============================================================
   CART  — localStorage (bền; migrate 1 lần từ sessionStorage cũ) + badge
   ============================================================ */
(function modevaCartStoreInit () {
  const KEY = 'cartData';
  const BADGE = 'modeva_cart';
  function migrateSessionToLocal () {
    try {
      if (localStorage.getItem(KEY)) return;
      const sess = sessionStorage.getItem(KEY);
      if (!sess) return;
      localStorage.setItem(KEY, sess);
      sessionStorage.removeItem(KEY);
      const b = sessionStorage.getItem(BADGE);
      if (b != null) localStorage.setItem(BADGE, b);
      sessionStorage.removeItem(BADGE);
    } catch (e) {}
  }
  function defaults () {
    return { items: [], subtotal: 0, discount: 0, shipping: 30000, voucherCode: null };
  }
  window.ModevaCartStore = {
    read () {
      migrateSessionToLocal();
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return defaults();
        return { ...defaults(), ...JSON.parse(raw) };
      } catch (e) {
        return defaults();
      }
    },
    write (data) {
      migrateSessionToLocal();
      localStorage.setItem(KEY, JSON.stringify(data));
      const totalQty = (data.items || []).reduce((s, i) => s + (parseInt(i.qty, 10) || 0), 0);
      localStorage.setItem(BADGE, String(totalQty));
      if (typeof window.updateBadges === 'function') window.updateBadges(totalQty);
    },
    addOrMergeLine (line) {
      const q = parseInt(line.qty, 10) || 1;
      const data = this.read();
      const items = data.items || [];
      const idx = items.findIndex(i => i.lineId === line.lineId);
      if (idx >= 0) {
        items[idx].qty = (parseInt(items[idx].qty, 10) || 0) + q;
      } else {
        items.push({
          lineId: line.lineId,
          productId: line.productId || '',
          name: line.name,
          variant: line.variant || '',
          qty: q,
          price: line.price,
          priceOriginal: line.priceOriginal != null ? line.priceOriginal : null,
          image: line.image || ''
        });
      }
      data.items = items;
      this.write(data);
    }
  };
})();

function parseVndFromText (el) {
  if (!el) return 0;
  const n = parseInt(String(el.textContent || '').replace(/\D/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function addCatalogLineFromCard (card) {
  if (!card || !window.ModevaCartStore) return;
  const productId = card.dataset.productId || '';
  const name = card.dataset.name || '';
  const price = parseInt(card.dataset.price || '0', 10) || 0;
  const img = card.dataset.productImage || '';
  const sizeEl = card.querySelector('.catalog-size-item.active');
  const colorEl = card.querySelector('.catalog-color-item.active');
  const color = (colorEl && colorEl.getAttribute('data-color-name')) ? colorEl.getAttribute('data-color-name') : '';
  const size = (sizeEl && sizeEl.getAttribute('data-size')) ? sizeEl.getAttribute('data-size') : '';
  if (!color || !size) {
    showNotification('Vui lòng chọn đủ size và màu trước khi thêm vào giỏ.', 'error');
    return;
  }
  let priceOriginal = null;
  if (card.dataset.priceOriginal) {
    const po = parseInt(card.dataset.priceOriginal, 10);
    if (!isNaN(po) && po > price) priceOriginal = po;
  }
  const lineId = productId + '|' + color + '|' + size;
  ModevaCartStore.addOrMergeLine({
    lineId,
    productId,
    name,
    variant: 'Màu: ' + color + ' | Size: ' + size,
    qty: 1,
    price,
    priceOriginal,
    image: img
  });
  showNotification(`Đã thêm "${name}" vào giỏ hàng`, 'success');
  if (window.ModevaLogs) {
    ModevaLogs.append('Danh mục: thêm vào giỏ — ' + name, 'info');
  }
}

function syncCartBadge () {
  try {
    if (!localStorage.getItem('cartData') && sessionStorage.getItem('cartData')) {
      localStorage.setItem('cartData', sessionStorage.getItem('cartData'));
      sessionStorage.removeItem('cartData');
      const b = sessionStorage.getItem('modeva_cart');
      if (b != null) localStorage.setItem('modeva_cart', b);
      sessionStorage.removeItem('modeva_cart');
    }
  } catch (e) {}
  const stored = parseInt(localStorage.getItem('modeva_cart') || '0', 10);
  updateBadges(stored);
}

function updateBadges (count) {
  document.querySelectorAll('.fashion-icon-link .badge').forEach(b => {
    b.textContent = count > 0 ? count : '';
    b.style.display = count > 0 ? '' : 'none';
  });
  // Legacy badge support
  document.querySelectorAll('.nav-icon .badge').forEach(b => {
    b.textContent = count;
  });
}

window.updateBadges = updateBadges;

window.updateCartBadge = function (increment = 1) {
  const stored = parseInt(localStorage.getItem('modeva_cart') || '0', 10);
  const next   = stored + increment;
  localStorage.setItem('modeva_cart', String(next));
  updateBadges(next);
};

window.quickAddToCart = function (productName) {
  showNotification('Hãy vào trang Danh mục và bấm «Thêm vào giỏ» trên sản phẩm bạn chọn.', 'info');
  if (window.ModevaLogs) {
    ModevaLogs.append('Trang chủ: chuyển hướng thêm giỏ qua danh mục — ' + (productName || ''), 'info');
  }
};

/* ============================================================
   PRODUCT DETAIL (legacy support)
   ============================================================ */
window.changeImage = function (element) {
  const mainImage = document.getElementById('mainImage');
  if (mainImage) {
    const full = element.getAttribute('data-full');
    if (full) mainImage.src = full;
    else mainImage.src = element.src.replace(/100x100/g, '600x700');
  }
  document.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('active'));
  element.classList.add('active');
};

window.selectColor = function (element) {
  document.querySelectorAll('.color-item').forEach(i => i.classList.remove('active'));
  element.classList.add('active');
  const el = document.getElementById('selectedColor');
  if (el) el.textContent = element.getAttribute('data-color');
};

window.selectSize = function (element) {
  document.querySelectorAll('.size-item').forEach(i => i.classList.remove('active'));
  element.classList.add('active');
  const el = document.getElementById('selectedSize');
  if (el) el.textContent = element.getAttribute('data-size');
};

window.increaseQty = function () {
  const input = document.getElementById('quantity');
  if (!input) return;
  const val = parseInt(input.value), max = parseInt(input.max);
  if (val < max) input.value = val + 1;
};

window.decreaseQty = function () {
  const input = document.getElementById('quantity');
  if (!input) return;
  const val = parseInt(input.value), min = parseInt(input.min);
  if (val > min) input.value = val - 1;
};

window.addToCart = function () {
  if (!window.ModevaCartStore) return;
  const qty = parseInt(document.getElementById('quantity')?.value || '1', 10) || 1;
  const color = document.getElementById('selectedColor')?.textContent?.trim() || '';
  const size = document.getElementById('selectedSize')?.textContent?.trim() || '';
  const title = document.querySelector('.product-title')?.textContent.trim() || 'Sản phẩm';
  const img = document.getElementById('mainImage')?.getAttribute('src') || '';
  const price = parseVndFromText(document.querySelector('.current-price'));
  let priceOriginal = parseVndFromText(document.querySelector('.original-price'));
  if (priceOriginal <= price) priceOriginal = null;
  const lineId = 'pd|' + title + '|' + color + '|' + size;
  ModevaCartStore.addOrMergeLine({
    lineId,
    productId: 'product-detail',
    name: title,
    variant: 'Màu: ' + color + ' | Size: ' + size,
    qty,
    price,
    priceOriginal: priceOriginal || null,
    image: img
  });
  if (window.ModevaLogs) {
    ModevaLogs.append('Chi tiết SP: thêm giỏ — SL ' + qty + ' (' + size + ' / ' + color + ')', 'info');
  }
  showNotification(`Đã thêm ${qty} sản phẩm (${size} / ${color}) vào giỏ hàng`, 'success');
};

window.buyNow = function () {
  window.addToCart();
  if (window.ModevaLogs) {
    ModevaLogs.append('Chi tiết SP: Mua ngay → chuyển checkout', 'info');
  }
  setTimeout(() => { window.location.href = 'checkout.html'; }, 300);
};

window.toggleWishlist = function (button) {
  button.classList.toggle('active');
  const added = button.classList.contains('active');
  if (window.ModevaLogs) {
    ModevaLogs.append(added ? 'Yêu thích: thêm sản phẩm' : 'Yêu thích: bỏ sản phẩm', 'info');
  }
  showNotification(added ? 'Đã thêm vào danh sách yêu thích' : 'Đã xóa khỏi danh sách yêu thích', added ? 'success' : 'info');
};

// Product tabs
window.openTab = function (event, tabName) {
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const target = document.getElementById(tabName);
  if (target) target.classList.add('active');
  event.currentTarget.classList.add('active');
};

/* ============================================================
   ADDRESS MANAGEMENT (account page)
   ============================================================ */
window.deleteAddress = function (btn) {
  const card = btn.closest('.address-card');
  if (!card) return;
  card.style.transition = 'opacity .25s, transform .25s';
  card.style.opacity = '0';
  card.style.transform = 'scale(.95)';
  setTimeout(() => {
    card.remove();
    if (window.ModevaLogs) ModevaLogs.append('Tài khoản: xóa địa chỉ (demo)', 'info');
    showNotification('Đã xóa địa chỉ', 'info');
  }, 250);
};

window.setDefaultAddress = function (btn) {
  document.querySelectorAll('.address-card').forEach(c => {
    c.classList.remove('is-default');
    const tag = c.querySelector('.default-tag');
    if (tag) tag.remove();
  });
  const card = btn.closest('.address-card');
  card.classList.add('is-default');
  const h4 = card.querySelector('h4');
  if (h4 && !h4.querySelector('.default-tag')) {
    const span = document.createElement('span');
    span.className = 'default-tag';
    span.textContent = 'Mặc định';
    h4.appendChild(span);
  }
  if (window.ModevaLogs) ModevaLogs.append('Tài khoản: đặt địa chỉ mặc định (demo)', 'info');
  showNotification('Đã đặt địa chỉ mặc định', 'success');
};
