import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const proxy = {
  '/api': {
    target: process.env.EPMS_API_TARGET ?? 'http://127.0.0.1:3000',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 5173, strictPort: true, proxy },
  test: { environment: 'happy-dom', globals: true, restoreMocks: true },
});
