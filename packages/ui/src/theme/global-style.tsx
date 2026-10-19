import { createGlobalStyle } from 'styled-components';

// Colours are CSS variables so light and dark switch with one attribute and need no re-render. The viewer's
// theme is independent of the compared design: previews keep the reference's own background.
export const GlobalStyle = createGlobalStyle`
  :root {
    --bg: #fafaf9; --surface: #ffffff; --surface-2: #f5f5f4; --border: #e7e5e4; --border-strong: #d6d3d1;
    --text: #1c1917; --muted: #6b655f; --accent: #2563eb; --accent-bg: #eff6ff;
    --pass: #15803d; --pass-bg: #f0fdf4; --fail: #b91c1c; --fail-bg: #fef2f2;
    --gap: #b45309; --gap-bg: #fffbeb; --idle: #6b655f; --idle-bg: #f5f5f4;
    --bar-pass: #16a34a; --bar-fail: #dc2626;
    --thumb-light: #f4f4f5; --stage: #e7e7ea; --shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    color-scheme: light;
  }
  :root[data-theme='dark'] {
    --bg: #0c0a09; --surface: #171412; --surface-2: #211e1b; --border: #2b2723; --border-strong: #3b3631;
    --text: #f5f5f4; --muted: #a8a29e; --accent: #60a5fa; --accent-bg: #172554;
    --pass: #4ade80; --pass-bg: #052e16; --fail: #f87171; --fail-bg: #3b0a0a;
    --gap: #fbbf24; --gap-bg: #2a1d05; --idle: #a8a29e; --idle-bg: #211e1b;
    --bar-pass: #22c55e; --bar-fail: #ef4444;
    --thumb-light: #2a2a2e; --stage: #2a2a2e; --shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    color-scheme: dark;
  }
  *, *::before, *::after { box-sizing: border-box; }
  html, body, #root { height: 100%; margin: 0; }
  body {
    background: var(--bg); color: var(--text);
    font: 14px/1.45 -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif;
    font-variant-numeric: tabular-nums;
  }
  button { font: inherit; color: inherit; cursor: pointer; }
  a { color: var(--accent); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
  /* The page content takes focus after navigation so reading starts there; it is not a control, so no ring. */
  main:focus { outline: none; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }
`;
