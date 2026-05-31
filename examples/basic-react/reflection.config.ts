import { defineReflection } from '../../src/core/define-reflection';

export default defineReflection({
  project: 'basic-react',
  run: {
    defaultMode: 'smoke',
    ciMode: 'smoke'
  },
  contracts: {
    browser: {
      enabled: true,
      blocking: true,
      baseUrl: 'http://127.0.0.1:5173',
      server: {
        command: 'corepack pnpm --dir examples/basic-react dev --host 127.0.0.1',
        readyUrl: 'http://127.0.0.1:5173',
        reuseExisting: true,
        timeoutMs: 60_000
      },
      routes: [
        {
          id: 'login',
          name: 'Login route',
          path: '/login',
          viewports: ['desktop', 'mobile'],
          expects: [
            { role: 'heading', name: 'Login' },
            { label: 'Email' },
            { label: 'Password' },
            { role: 'button', name: 'Sign in' },
            { noText: 'Sign up' },
            { noText: 'Register' },
            { noHorizontalOverflow: true },
            { noConsoleErrors: true },
            { screenshot: 'final' }
          ]
        },
        {
          id: 'overflow',
          name: 'Intentional overflow route',
          path: '/overflow',
          viewports: ['mobile'],
          expects: [
            { role: 'heading', name: 'Overflow fixture' },
            { noHorizontalOverflow: true },
            { screenshot: 'final' }
          ]
        },
        {
          id: 'console-error',
          name: 'Intentional console error route',
          path: '/console-error',
          viewports: ['desktop'],
          expects: [
            { role: 'heading', name: 'Console error fixture' },
            { noConsoleErrors: true },
            { screenshot: 'final' }
          ]
        }
      ],
      visualSmoke: [
        {
          id: 'login-mobile',
          route: 'login',
          viewport: 'mobile',
          baselineRoot: 'tests/fixtures/baselines',
          baseline: 'browser/login/mobile.chromium-linux.light.png',
          threshold: { maxDiffPixelRatio: 0.01 }
        }
      ]
    }
  }
});
