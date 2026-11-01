import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import JavaScriptObfuscator from 'javascript-obfuscator';
import fs from 'node:fs';
import path from 'node:path';

/* Obfuscates ONLY our own code (src/**). Library chunks (react, firebase, jspdf, html2canvas) are left alone:
   they are public code anyway and obfuscating them just makes the site slower.
   It runs AFTER Vite has written the bundle (closeBundle), so Vite has already replaced its internal chunk-name
   placeholders. Obfuscating earlier encodes those placeholders and breaks the lazy-loaded pages (404 on !~{005}~.js).
   Turn it off for debugging with:  npm run build:plain   (OBFUSCATE=0) */
function obfuscateOwnCode(){
  let outDir = 'dist', root = process.cwd();
  const ownFiles = [];
  return {
    name: 'pm-obfuscate-own-code',
    apply: 'build',
    enforce: 'post',
    configResolved(cfg){ outDir = path.resolve(cfg.root, cfg.build.outDir); root = cfg.root; },
    generateBundle(_, bundle){
      ownFiles.length = 0;
      for (const [file, item] of Object.entries(bundle)) {
        if (item.type !== 'chunk') continue;
        const own = item.moduleIds.length > 0 && item.moduleIds.every(id => !id.includes('node_modules') && !id.includes('vite/preload-helper') && !id.includes('commonjsHelpers'));
        if (own) ownFiles.push(file);
      }
    },
    closeBundle(){
      if (process.env.OBFUSCATE === '0') return;
      for (const file of ownFiles) {
        const full = path.join(outDir, file);
        if (!fs.existsSync(full)) continue;
        const code = fs.readFileSync(full, 'utf8');
        const out = JavaScriptObfuscator.obfuscate(code, {
          target: 'browser',
          sourceType: 'module',
          compact: true,
          identifierNamesGenerator: 'hexadecimal',
          renameGlobals: false,            // window['fn'] handlers, exports and Firestore field names must keep their names
          renameProperties: false,
          transformObjectKeys: false,
          stringArray: true,
          stringArrayThreshold: 0.8,
          stringArrayEncoding: ['base64'],
          stringArrayRotate: true,
          stringArrayShuffle: true,
          stringArrayWrappersCount: 2,
          stringArrayWrappersType: 'function',
          splitStrings: false,             // the engine markup is a very large string
          controlFlowFlattening: false,    // too slow for a live queue screen
          deadCodeInjection: false,
          selfDefending: false,
          debugProtection: false,
          disableConsoleOutput: false,
          unicodeEscapeSequence: false,
          sourceMap: false
        });
        fs.writeFileSync(full, out.getObfuscatedCode());
        console.log('obfuscated', file);
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), obfuscateOwnCode()],
  build: {
    sourcemap: false,
    target: 'es2019',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[hash].js',
        chunkFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash][extname]',
        manualChunks(id){
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'vendor-firebase';
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas') || id.includes('node_modules/canvg') || id.includes('node_modules/core-js') || id.includes('node_modules/dompurify')) return 'vendor-pdf';
          if (id.includes('node_modules/react')) return 'vendor-react';
        }
      }
    }
  }
});
