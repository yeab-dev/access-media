// Site theme: the device's setting (default), light or dark. Remembered on this device only.
// Loaded in <head> (not deferred) so the chosen theme applies before the page is drawn.
// A page that must stay one theme (the documentation: Swagger UI is light only) sets data-fixed-theme on <html>.
(() => {
  const KEY = 'db-site-theme';
  const root = document.documentElement;
  if (root.hasAttribute('data-fixed-theme')) return;
  const saved = () => { try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; } };
  const apply = (theme) => {
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme; else delete root.dataset.theme;
    // Our players on these pages follow the same choice.
    for (const p of document.querySelectorAll('db-player')) p.setAttribute('theme', theme === 'light' || theme === 'dark' ? theme : 'auto');
  };
  apply(saved());

  document.addEventListener('DOMContentLoaded', () => {
    apply(saved());
    const header = document.querySelector('.top .in');
    if (!header) return;
    const box = document.createElement('div');
    box.className = 'theme';
    box.innerHTML = `<label for="site-theme">Theme</label>
      <select id="site-theme">
        <option value="auto">Same as device</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>`;
    header.append(box);
    const select = box.querySelector('select');
    select.value = saved();
    select.addEventListener('change', () => {
      try { localStorage.setItem(KEY, select.value); } catch { /* not remembered, still applied */ }
      apply(select.value);
    });
  });
})();
