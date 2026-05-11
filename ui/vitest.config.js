import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

export default mergeConfig(
  viteConfig({ mode: 'test' }),
  defineConfig({
    test: {
      globals: true, // Use global describe/it/expect (Jest-style)
      environment: 'jsdom', // DOM environment for React
      setupFiles: ['./vitest.setup.js'],
      css: false, // Don't process CSS in tests
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        include: ['src/**/*.{mjs,jsx,js}'],
      },
    },
  })
);
