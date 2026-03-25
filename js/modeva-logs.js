/* Nhật ký hệ thống — chung với Admin (modeva_dash_logs), dùng trên mọi trang */
(function () {
  'use strict';

  var LOG_KEY = 'modeva_dash_logs';
  var MAX = 500;

  function actor () {
    try {
      var raw = localStorage.getItem('modeva_session');
      if (!raw) return 'guest';
      var j = JSON.parse(raw);
      var email = j.email || '—';
      var role = j.role || '';
      return email + (role ? ' · ' + role : '');
    } catch (e) {
      return 'guest';
    }
  }

  window.ModevaLogs = window.ModevaLogs || {
    key: LOG_KEY,

    append: function (message, level) {
      if (message == null || message === '') return;
      level = level || 'info';
      var logs = [];
      try {
        logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
      } catch (e) {
        logs = [];
      }
      if (!Array.isArray(logs)) logs = [];
      logs.unshift({
        at: new Date().toISOString(),
        level: level,
        message: String(message),
        user: actor()
      });
      localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(0, MAX)));
    }
  };
})();
