import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import JavaScriptObfuscator from 'javascript-obfuscator';

/* Obfuscates ONLY our own code (src/**). Library chunks (react, firebase, jspdf, html2canvas) are left alone:
   they are public code anyway and obfuscating them just makes the site slower.
   Turn it off for debugging with:  npm run build:plain   (OBFUSCATE=0) */
function obfuscateOwnCode(){
  return {
    name: 'pm-obfuscate-own-code',
    apply: 'build',
    enforce: 'post',
    renderChunk(code, chunk){
      if (process.env.OBFUSCATE === '0') return null;
      const own = chunk.moduleIds.length > 0 && chunk.moduleIds.every(id => !id.includes('node_modules') && !id.includes('vite/preload-helper') && !id.includes('commonjsHelpers'));
      if (!own) return null;
      const out = JavaScriptObfuscator.obfuscate(code, {
        target: 'browser',
        sourceType: 'module',
        compact: true,
        identifierNamesGenerator: 'hexadecimal',
        renameGlobals: false,            // window['fn'] handlers and Firestore field names must keep their names
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
      return { code: out.getObfuscatedCode(), map: null };
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
