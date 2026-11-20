/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build --mode artifact` gera um único HTML (publicação como Artifact no claude.ai).
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'artifact' ? [viteSingleFile()] : [])],
  base: mode === 'artifact' ? './' : '/',
  define: mode === 'artifact' ? { 'import.meta.env.VITE_ARTIFACT': JSON.stringify('1') } : {},
  build: mode === 'artifact' ? { outDir: 'dist-artifact' } : {},
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
}));
