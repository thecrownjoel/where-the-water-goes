import { defineConfig } from 'vite';

// Tauri expects a fixed port and no clearing of its own logs.
export default defineConfig({
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1500 },
});
