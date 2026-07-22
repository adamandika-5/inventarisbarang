/**
 * Theme script to inject inline before body render to prevent
 * Flash Of Unstyled Content (FOUC) / flash of wrong theme.
 *
 * This is serialized and injected as a <script> tag in <head> via layout.tsx.
 * It runs synchronously before React hydrates.
 */

// This string is the exact script that will be inlined into <head>
export const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('ib-theme');
    var theme = stored === 'dark' ? 'dark' : 'light';
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`.trim()
