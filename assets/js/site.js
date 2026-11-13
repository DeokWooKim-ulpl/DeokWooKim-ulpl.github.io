// Mobile menu, theme toggle, and auto-sizing of embedded tool frames.
(function () {
  // ---- theme ----
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);
  } catch (e) {}

  // ---- owner-only editor: loaded only with ?edit or a saved token ----
  var wantEditor = /[?&]edit\b/.test(location.search);
  try { wantEditor = wantEditor || !!(localStorage.getItem('ed_token') || sessionStorage.getItem('ed_token')); } catch (e) {}

  document.addEventListener('DOMContentLoaded', function () {
    if (wantEditor && document.getElementById('content')) {
      var css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = '/assets/css/editor.css';
      document.head.appendChild(css);
      var js = document.createElement('script');
      js.src = '/assets/js/editor.js';
      document.body.appendChild(js);
    }

    var menuBtn = document.querySelector('.menu-btn');
    var nav = document.querySelector('.nav');
    if (menuBtn && nav) {
      menuBtn.addEventListener('click', function () {
        var open = nav.classList.toggle('open');
        menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    var themeBtn = document.querySelector('.theme-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', function () {
        var cur = root.getAttribute('data-theme');
        if (!cur) cur = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        var next = cur === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        try { localStorage.setItem('theme', next); } catch (e) {}
      });
    }

    // ---- tool iframe auto-height (same origin) ----
    var frames = document.querySelectorAll('iframe.tool-frame');
    frames.forEach(function (f) {
      var fixed = f.getAttribute('data-fixed-height');
      if (fixed) { f.style.height = fixed + 'px'; return; }
      function fit() {
        try {
          var d = f.contentDocument;
          if (!d || !d.body) return;
          var h = Math.max(d.body.scrollHeight, d.documentElement.scrollHeight);
          if (h > 0 && Math.abs(h - f.offsetHeight) > 4) f.style.height = (h + 4) + 'px';
        } catch (e) {}
      }
      f.addEventListener('load', function () {
        fit();
        try {
          var ro = new ResizeObserver(fit);
          ro.observe(f.contentDocument.body);
        } catch (e) { setInterval(fit, 1000); }
      });
    });
  });
})();
