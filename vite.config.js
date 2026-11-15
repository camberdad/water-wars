import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// The version lives in package.json. It is stamped into index.html as %VITE_APP_VERSION% (the loading
// screen shows it before any script runs), read by src/version.js through import.meta.env, and published
// as version.json next to the page: the running game polls that file to notice a new release
// (src/core/UpdateCheck.js).
const readVersion = () => JSON.parse( readFileSync( new URL( './package.json', import.meta.url ), 'utf8' ) ).version;
process.env.VITE_APP_VERSION = readVersion();

const versionFile = () => ( {
	name: 'water-wars-version',
	// dev server: always the current package.json (bump it to test the update prompt without a restart)
	configureServer( server ) {

		server.middlewares.use( ( req, res, next ) => {

			if ( req.url && req.url.split( '?' )[ 0 ].endsWith( '/version.json' ) ) {

				res.setHeader( 'Content-Type', 'application/json' );
				res.setHeader( 'Cache-Control', 'no-store' );
				res.end( JSON.stringify( { version: readVersion() } ) );
				return;

			}

			next();

		} );

	},
	// build: dist/version.json
	generateBundle() {

		this.emitFile( { type: 'asset', fileName: 'version.json', source: JSON.stringify( { version: readVersion() } ) } );

	},
} );

export default defineConfig( {
	// relative asset paths: the build runs from any sub-path (GitHub Pages serves it under /water-wars/)
	base: './',
	plugins: [ versionFile() ],
	build: { target: 'esnext', chunkSizeWarningLimit: 4000 },
	server: { port: 5188, strictPort: true, host: '127.0.0.1' },
} );
