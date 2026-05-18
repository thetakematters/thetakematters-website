(function () {
  var KEY = 'tm_consent';

  function grant() {
    if (typeof gtag === 'function') {
      gtag('consent', 'update', {
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
        analytics_storage: 'granted'
      });
    }
  }

  var choice = null;
  try { choice = localStorage.getItem(KEY); } catch (e) {}
  if (choice === 'granted') { grant(); return; }
  if (choice === 'denied') { return; }

  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function build() {
    var css = document.createElement('style');
    css.textContent =
      '#tm-consent{position:fixed;left:16px;right:16px;bottom:16px;max-width:560px;margin:0 auto;' +
      'background:#fff;color:#1a1a1a;border:1px solid #e5e2dd;border-radius:10px;padding:16px 18px;' +
      'font:14px/1.5 Inter,system-ui,-apple-system,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.12);z-index:9999;}' +
      '#tm-consent p{margin:0 0 12px;}' +
      '#tm-consent .tm-actions{display:flex;gap:10px;justify-content:flex-end;}' +
      '#tm-consent button{font:inherit;font-weight:600;padding:8px 16px;border-radius:6px;cursor:pointer;' +
      'border:1px solid #d8d3cc;background:#fff;color:#1a1a1a;}' +
      '#tm-consent #tm-accept{background:#b8623a;border-color:#b8623a;color:#fff;}' +
      '@media (prefers-reduced-motion:no-preference){#tm-consent{animation:tmfade .25s ease-out;}}' +
      '@keyframes tmfade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}';
    document.head.appendChild(css);

    var bar = document.createElement('div');
    bar.id = 'tm-consent';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Cookie consent');
    bar.innerHTML =
      '<p>This site uses analytics cookies to understand how it is used. ' +
      'You can accept or decline.</p>' +
      '<div class="tm-actions">' +
      '<button type="button" id="tm-decline">Decline</button>' +
      '<button type="button" id="tm-accept">Accept</button>' +
      '</div>';
    document.body.appendChild(bar);

    document.getElementById('tm-accept').addEventListener('click', function () {
      save('granted'); grant(); bar.remove();
    });
    document.getElementById('tm-decline').addEventListener('click', function () {
      save('denied'); bar.remove();
    });
  }

  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);
})();
