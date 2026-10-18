import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The React plugin is not needed for tests; esbuild compiles JSX directly.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    css: false
  }
});
