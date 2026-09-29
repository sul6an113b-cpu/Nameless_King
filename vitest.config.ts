import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** One Vitest run for the whole repo; each workspace is a project (Vitest 5 `test.projects`). */
export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'core', root: './packages/core', environment: 'node', include: ['src/**/*.test.ts', 'test/**/*.test.ts'] },
      },
      {
        test: { name: 'content', root: './packages/content', environment: 'node', include: ['src/**/*.test.ts'] },
      },
      {
        test: { name: 'server', root: './apps/server', environment: 'node', include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'] },
      },
      {
        plugins: [react()],
        test: {
          name: 'web',
          root: './apps/web',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
      {
        test: { name: 'repo', root: '.', environment: 'node', include: ['tests/**/*.test.ts'] },
      },
    ],
  },
});
