/* Modeva — OTP qua email (EmailJS tuỳ chọn; không cấu hình thì chế độ demo) */
(function () {
  'use strict';

  var OTP_TTL_MS = 10 * 60 * 1000;
  var RESEND_COOLDOWN_MS = 60 * 1000;

  function normEmail (e) {
    return String(e || '').trim().toLowerCase();
  }

  function otpKey (email, purpose) {
    return 'modeva_otp_' + purpose + '_' + normEmail(email);
  }

  function lastSendKey (email, purpose) {
    return 'modeva_otp_last_' + purpose + '_' + normEmail(email);
  }

  function genOtp () {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /** Đủ thông tin và không phải placeholder để gọi API EmailJS. */
  function isEmailJsReady (cfg) {
    if (!cfg) return false;
    var k = String(cfg.publicKey || cfg.user_id || '').trim();
    var s = String(cfg.serviceId || '').trim();
    var t = String(cfg.templateId || '').trim();
    if (!k || !s || !t) return false;
    var blob = k + s + t;
    if (/YOUR_|CHANGEME|điền|placeholder|xxx\.xxx/i.test(blob)) return false;
    return true;
  }

  function parseEmailJsError (status, text) {
    var msg = text || ('HTTP ' + status);
    try {
      var j = JSON.parse(text);
      if (j && j.text) return String(j.text);
    } catch (e) { /* ignore */ }
    return msg;
  }

  window.ModevaOtp = {
    TTL_MINUTES: 10,
    RESEND_COOLDOWN_SEC: 60,

    isEmailConfigured: function () {
      return isEmailJsReady(window.MODEVA_EMAILJS);
    },

    getCooldownRemaining: function (email, purpose) {
      var t = parseInt(sessionStorage.getItem(lastSendKey(email, purpose)) || '0', 10);
      var rem = RESEND_COOLDOWN_MS - (Date.now() - t);
      return rem > 0 ? Math.ceil(rem / 1000) : 0;
    },

    /**
     * @param {string} email
     * @param {'register'|'forgot'} purpose
     * @returns {Promise<{ ok: boolean, message?: string, waitSec?: number, demoCode?: string, demoMode?: boolean }>}
     */
    send: function (email, purpose) {
      var em = normEmail(email);
      if (!em) {
        return Promise.resolve({ ok: false, message: 'Vui lòng nhập email.' });
      }

      var wait = this.getCooldownRemaining(em, purpose);
      if (wait > 0) {
        return Promise.resolve({
          ok: false,
          message: 'Vui lòng chờ ' + wait + ' giây trước khi gửi lại mã.',
          waitSec: wait
        });
      }

      var code = genOtp();
      sessionStorage.setItem(otpKey(em, purpose), JSON.stringify({
        code: code,
        exp: Date.now() + OTP_TTL_MS
      }));
      sessionStorage.setItem(lastSendKey(em, purpose), String(Date.now()));

      var cfg = window.MODEVA_EMAILJS;
      var purposeLabel = purpose === 'register' ? 'đăng ký tài khoản' : 'khôi phục mật khẩu';
      var userId = cfg && String(cfg.publicKey || cfg.user_id || '').trim();

      if (isEmailJsReady(cfg)) {
        var payload = {
          lib_version: '3.12.0',
          service_id: String(cfg.serviceId).trim(),
          template_id: String(cfg.templateId).trim(),
          user_id: userId,
          template_params: {
            to_email: em,
            email: em,
            otp: code,
            otp_code: code,
            passcode: code,
            purpose: purposeLabel,
            site_name: 'Modeva',
            message: 'Mã OTP Modeva của bạn: ' + code + ' (' + purposeLabel + '). Hiệu lực 10 phút.'
          }
        };
        if (cfg.accessToken) {
          payload.accessToken = cfg.accessToken;
        }
        return fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (res) {
          return res.text().then(function (txt) {
            if (res.ok) {
              if (window.ModevaLogs) {
                ModevaLogs.append('OTP gửi email (EmailJS): ' + em + ' — ' + purpose, 'info');
              }
              return {
                ok: true,
                message: 'Đã gửi mã OTP tới email của bạn. Kiểm tra hộp thư và mục spam.',
                demoMode: false
              };
            }
            return {
              ok: false,
              message: 'EmailJS: ' + parseEmailJsError(res.status, txt) + ' — Kiểm tra Public Key, Service, Template và trường To Email = {{to_email}}.'
            };
          });
        }).catch(function () {
          return { ok: false, message: 'Lỗi mạng khi gọi EmailJS. Thử lại sau.' };
        });
      }

      if (window.ModevaLogs) {
        ModevaLogs.append('OTP (demo, chưa EmailJS): ' + em + ' — ' + purpose + ' — mã ' + code, 'info');
      }
      return Promise.resolve({
        ok: true,
        message: 'Đã tạo mã xác minh. (Demo: chưa cấu hình EmailJS — xem mã bên dưới.)',
        demoCode: code,
        demoMode: true
      });
    },

    verify: function (email, purpose, inputCode) {
      var em = normEmail(email);
      if (!em || inputCode == null) return false;
      var raw = sessionStorage.getItem(otpKey(em, purpose));
      if (!raw) return false;
      var o;
      try {
        o = JSON.parse(raw);
      } catch (e) {
        return false;
      }
      if (Date.now() > o.exp) {
        sessionStorage.removeItem(otpKey(em, purpose));
        return false;
      }
      if (String(inputCode).trim() !== String(o.code)) return false;
      sessionStorage.removeItem(otpKey(em, purpose));
      return true;
    }
  };
})();
