import { defineConfig } from 'vite';

// host: bind to 0.0.0.0 so the preview/proxy can reach the dev server.
// allowedHosts: the sandbox serves the app through a generated hostname.
export default defineConfig({
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
});
