import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Portal on 5174 so Visualiser can keep Vite's default 5173. strictPort fails if 5174 is taken.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
  },
});
