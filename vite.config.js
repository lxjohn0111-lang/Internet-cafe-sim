import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// BUILD_TARGET=artifact builds a variant without the CrazyGames SDK tag (for the claude.ai artifact).
const ARTIFACT = process.env.BUILD_TARGET === 'artifact';

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [
    {
      name: 'strip-crazygames-sdk',
      transformIndexHtml(html) { return ARTIFACT ? html.replace(/\s*<script[^>]*crazygames-sdk[^>]*><\/script>/, '') : html; },
    },
    // Inline all JS, CSS and assets (models, textures, skies) into ONE index.html
    viteSingleFile({ removeViteModuleLoader: true }),
  ],
  build: {
    outDir: ARTIFACT ? 'dist-artifact' : 'dist',
    assetsInlineLimit: () => true,
    chunkSizeWarningLimit: 20000,
    reportCompressedSize: false,
    target: 'es2020',
  },
  server: { host: true },
});
