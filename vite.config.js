import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// the version (package.json) is stamped into index.html as %VITE_APP_VERSION% (the loading screen shows it
// before any script runs) and read by src/version.js through import.meta.env
process.env.VITE_APP_VERSION = JSON.parse( readFileSync( new URL( './package.json', import.meta.url ), 'utf8' ) ).version;

export default defineConfig( {
	// relative asset paths: the build runs from any sub-path (GitHub Pages serves it under /water-wars/)
	base: './',
	build: { target: 'esnext', chunkSizeWarningLimit: 4000 },
	server: { port: 5188, strictPort: true, host: '127.0.0.1' },
} );
