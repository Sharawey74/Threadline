import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom rather than node: component tests need a DOM, and the workbench is
    // the majority of what I3 delivers.
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
