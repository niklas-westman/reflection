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

const printShellStyle: React.CSSProperties = {
  minHeight: '100vh',
  margin: 0,
  padding: '24px',
  background: '#e8ebef',
  color: '#111827',
  fontFamily: 'Georgia, "Times New Roman", serif'
};

const documentPageStyle: React.CSSProperties = {
  width: '794px',
  minHeight: '1123px',
  boxSizing: 'border-box',
  margin: '0 auto 24px',
  padding: '72px 64px',
  display: 'grid',
  gridTemplateRows: 'auto 1fr auto',
  background: '#ffffff',
  border: '1px solid #d1d5db',
  boxShadow: '0 12px 40px rgba(15, 23, 42, 0.16)'
};

function PrintFixtureRoute() {
  const sections = [
    'Cover',
    'Management report',
    'Income statement',
    'Balance sheet',
    'Notes',
    'Signatures',
    'Electronic signatures'
  ];

  return (
    <main style={printShellStyle}>
      <style>
        {`
          @page { size: A4; margin: 0; }
          @media print {
            body { margin: 0; background: white; }
            [data-page] { box-shadow: none !important; border: 0 !important; margin: 0 !important; break-after: page; page-break-after: always; }
          }
        `}
      </style>
      {sections.map((section, index) => {
        const page = index + 1;
        return (
          <section key={section} className="page" data-page={page} style={documentPageStyle}>
            <header>
              <p style={{ fontSize: 12, letterSpacing: '0.16em', margin: '0 0 12px', textTransform: 'uppercase' }}>
                Reflection print fixture
              </p>
              <h1 style={{ fontSize: 36, margin: 0 }}>{section}</h1>
            </header>
            <div>
              <p>Annual Report Full Smoke AB</p>
              {page === 6 && <p>Electronically signed</p>}
              {page === 7 && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <caption style={{ marginBottom: 12, textAlign: 'left' }}>Electronic signatures</caption>
                  <tbody>
                    <tr>
                      <th style={{ border: '1px solid #d1d5db', padding: 8, textAlign: 'left' }}>Provider</th>
                      <td style={{ border: '1px solid #d1d5db', padding: 8 }}>FixtureID</td>
                    </tr>
                    <tr>
                      <th style={{ border: '1px solid #d1d5db', padding: 8, textAlign: 'left' }}>Signed at</th>
                      <td style={{ border: '1px solid #d1d5db', padding: 8 }}>2026-01-15 10:30</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
            <footer>Sida {page} av 7</footer>
          </section>
        );
      })}
    </main>
  );
}

interface WorkspaceCandidate {
  id: string;
  name: string;
}

type CandidateListState = WorkspaceCandidate[] | 'loading' | 'error';

function WorkspaceRoute() {
  const [candidates, setCandidates] = React.useState<CandidateListState>('loading');
  const [selected, setSelected] = React.useState<WorkspaceCandidate | undefined>();
  const [chatOpen, setChatOpen] = React.useState(false);
  const today = new Intl.DateTimeFormat(navigator.language, { dateStyle: 'full', timeStyle: 'short' }).format(new Date());

  React.useEffect(() => {
    fetch('/api/candidates')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unexpected status ${response.status}`);
        }
        return response.json() as Promise<{ items: WorkspaceCandidate[] }>;
      })
      .then((body) => setCandidates(body.items))
      .catch(() => setCandidates('error'));
  }, []);

  return (
    <main style={pageStyle}>
      <section style={panelStyle}>
        <h1>Workspace</h1>
        <p>Today: {today}</p>
        {candidates === 'loading' && <p>Loading candidates</p>}
        {candidates === 'error' && <p role="alert">Could not load candidates</p>}
        {Array.isArray(candidates) && candidates.length === 0 && <p>No candidates</p>}
        {Array.isArray(candidates) &&
          candidates.map((candidate) => (
            <button key={candidate.id} onClick={() => setSelected(candidate)} type="button">
              {candidate.name}
            </button>
          ))}
        {selected && (
          <article aria-label="Candidate details">
            <h2>{selected.name}</h2>
            <button onClick={() => setChatOpen(true)} type="button">
              Chat
            </button>
            {chatOpen && (
              <label>
                Message
                <input name="message" type="text" />
              </label>
            )}
          </article>
        )}
      </section>
    </main>
  );
}

function NotFoundRoute() {
  return (
    <main style={pageStyle}>
      <section style={panelStyle}>
        <h1>Fixture route not found</h1>
        <p>Use /login, /auth, /print-fixture, /overflow, or /console-error.</p>
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
    case '/print-fixture':
      return <PrintFixtureRoute />;
    case '/workspace':
      return <WorkspaceRoute />;
    default:
      return <NotFoundRoute />;
  }
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
window.__REFLECTION_READY__ = true;
