import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'background/index': 'src/background/index.ts',
    'content/index': 'src/content/index.tsx',
    'options/main': 'src/options/main.tsx'
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  format: ['iife'],
  target: 'chrome118',
  minify: false,
  dts: false,
  platform: 'browser',
  esbuildOptions(options) {
    options.banner = {
      js: `'use strict';`
    };
  }
});
