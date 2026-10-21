// The theme is decided before the first paint. Anything that waits for React
// shows a white page to someone who chose dark, which reads as a flash of the
// wrong app. A file rather than an inline script in index.html: the server's
// security policy allows scripts from this origin only, and an inline one is
// blocked there — a violation on every page and the very flash this exists to
// prevent, which development never shows because Vite sets no policy.
(function () {
  try {
    var saved = localStorage.getItem('theme');
    var dark =
      saved === 'dark' || (saved !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch (e) {
    /* Private windows refuse storage; the light theme is the fallback. */
  }
})();
