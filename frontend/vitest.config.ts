import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom rather than node: component tests need a DOM, and the workbench is
    // the majority of what I3 delivers.
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
