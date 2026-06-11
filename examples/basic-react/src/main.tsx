import React from 'react';
import { createRoot } from 'react-dom/client';

declare global {
  interface Window {
    __REFLECTION_READY__?: boolean;
  }
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  margin: 0,
  padding: '48px 20px',
  boxSizing: 'border-box',
  display: 'grid',
  placeItems: 'center',
  background: '#0d1117',
  color: '#f5f7fb',
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
};

const panelStyle: React.CSSProperties = {
  width: 'min(100%, 420px)',
  boxSizing: 'border-box',
  padding: '32px',
  border: '1px solid rgba(255, 255, 255, 0.14)',
  borderRadius: '24px',
  background: 'linear-gradient(145deg, rgba(23, 31, 46, 0.96), rgba(11, 16, 26, 0.98))',
  boxShadow: '0 24px 80px rgba(0, 0, 0, 0.38)'
};

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: '8px',
  color: '#d8deea',
  fontSize: '0.92rem',
  fontWeight: 600
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid rgba(255, 255, 255, 0.18)',
  borderRadius: '12px',
  background: '#111827',
  color: '#ffffff',
  padding: '12px 14px',
  font: 'inherit'
};

function LoginRoute() {
  return (
    <main style={pageStyle}>
      <form aria-label="Reflection login" style={panelStyle}>
        <p style={{ color: '#8ea0c3', fontSize: '0.82rem', letterSpacing: '0.16em', margin: '0 0 12px', textTransform: 'uppercase' }}>
          Reflection fixture
        </p>
        <h1 style={{ fontSize: '2.4rem', lineHeight: 1, margin: '0 0 28px' }}>Login</h1>
        <div style={{ display: 'grid', gap: '18px' }}>
          <label style={labelStyle}>
            Email
            <input autoComplete="email" name="email" style={inputStyle} type="email" />
          </label>
          <label style={labelStyle}>
            Password
            <input autoComplete="current-password" name="password" style={inputStyle} type="password" />
          </label>
          <button
            style={{
              width: '100%',
              border: 0,
              borderRadius: '999px',
              background: '#8ddcff',
              color: '#07111f',
              cursor: 'pointer',
              font: 'inherit',
              fontWeight: 800,
              padding: '13px 18px'
            }}
            type="submit"
          >
            Sign in
          </button>
        </div>
      </form>
    </main>
  );
}

function OverflowRoute() {
  return (
    <main style={{ ...pageStyle, justifyItems: 'start', overflowX: 'visible' }}>
      <section
        aria-label="Intentional overflow fixture"
        style={{
          width: '120vw',
          minHeight: '220px',
          padding: '32px',
          borderRadius: '20px',
          background: '#4f46e5',
          boxSizing: 'border-box'
        }}
      >
        <h1>Overflow fixture</h1>
        <p>This route intentionally exceeds the viewport width so the browser contract can catch layout overflow.</p>
      </section>
    </main>
  );
}

function ConsoleErrorRoute() {
  console.error('Reflection fixture intentional console error');

  return (
    <main style={pageStyle}>
      <section style={panelStyle}>
        <h1>Console error fixture</h1>
        <p>This route intentionally emits a console error so Reflection can classify browser console failures.</p>
      </section>
    </main>
  );
}

function AuthRoute() {
  const user = window.localStorage.getItem('reflection:auth-user');
  const session = window.sessionStorage.getItem('reflection:auth-session');
  const authenticated = user === 'fixture-user-secret' && session === 'fixture-session-secret';

  return (
    <main style={pageStyle}>
      <section style={panelStyle}>
        <h1>{authenticated ? `Authenticated fixture-user` : 'Unauthenticated fixture'}</h1>
        <p>Storage-backed auth fixture for Reflection browser setup.</p>
      </section>
    </main>
  );
}

function NotFoundRoute() {
  return (
    <main style={pageStyle}>
      <section style={panelStyle}>
        <h1>Fixture route not found</h1>
        <p>Use /login, /auth, /overflow, or /console-error.</p>
      </section>
    </main>
  );
}

function App() {
  switch (window.location.pathname) {
    case '/login':
    case '/':
      return <LoginRoute />;
    case '/overflow':
      return <OverflowRoute />;
    case '/console-error':
      return <ConsoleErrorRoute />;
    case '/auth':
      return <AuthRoute />;
    default:
      return <NotFoundRoute />;
  }
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
window.__REFLECTION_READY__ = true;
