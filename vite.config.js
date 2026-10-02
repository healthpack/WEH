import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/WEH/' : '/',
  plugins: [react(), {
    name: 'account-link-fallback',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      // GitHub Pages serves this shell for direct account URLs and refreshes.
      // Built asset URLs include the project base, so nested paths work too.
      const shell = bundle['index.html'];
      if (!shell || shell.type !== 'asset') throw Error('Missing app entry page.');
      this.emitFile({type:'asset',fileName:'404.html',source:shell.source});
    },
  }],
});
