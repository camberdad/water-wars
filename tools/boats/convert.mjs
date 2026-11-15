// Converts the purchasable boats' source models (OBJ + MTL or FBX) into the engine's compact mesh
// format: one merged, indexed, vertex-coloured mesh per boat.
//
//   node tools/boats/convert.mjs
//
// Output (public/models/boats/): <id>.json { vertexCount, indexCount, bbox, materials } and <id>.bin
// laid out as [ position f32 x3 ][ normal snorm8 x4 ][ colour unorm8 x4 (rgb linear, a = roughness) ][ index u32 ].
// Textures are not carried over: every material becomes its diffuse colour (SketchUp / Blender exports
// store a representative colour in Kd even for textured materials), which suits the game's look and
// keeps each boat to a single draw call.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { modelKey } from '../../src/game/ModelKey.js';

// FBXLoader / OBJLoader touch a few DOM globals when they meet textures; this is a build tool, so
// stub just enough for them to skip the images
globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.document = {
	createElementNS: () => ( { addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {} } ),
	createElement: () => ( { addEventListener() {}, removeEventListener() {}, getContext: () => null, style: {} } ),
};

const THREE = await import( 'three' );
const { OBJLoader } = await import( 'three/examples/jsm/loaders/OBJLoader.js' );
const { FBXLoader } = await import( 'three/examples/jsm/loaders/FBXLoader.js' );
const { mergeVertices } = await import( 'three/examples/jsm/utils/BufferGeometryUtils.js' );

const here = path.dirname( fileURLToPath( import.meta.url ) );
const root = path.resolve( here, '../..' );
const OUT = path.join( root, 'public/models/boats' );
const SRC = process.env.BOAT_SRC || path.join( process.env.USERPROFILE || process.env.HOME || '', 'Downloads' );

// id -> source file (relative to SRC)
const BOATS = {
	trawler: { file: 'boat/boat/obj/untitled.obj', mtl: 'boat/boat/obj/untitled.mtl' },
	sportfisher: { file: 'fisher/obj/untitled.obj', mtl: 'fisher/obj/untitled.mtl' },
	// the ship's materials are all plain white in the FBX (its textures are not included): give each
	// a colour here; the hull ('Fishing_Ship', left pure white) is painted by height in the game (Boats.js)
	ship: { file: 'Fishing_Ship_Asset.fbx', colors: { Fishing_Ship: [ 1, 1, 1, 0.45 ], Windows: [ 0.03, 0.05, 0.07, 0.08 ], Light: [ 1, 0.9, 0.6, 0.3 ], Boat_Interior: [ 0.42, 0.33, 0.24, 0.8 ] } },
	// Water Wars 1.9: two more, without their .mtl files: colours by material (the old boat) or by object
	// name prefix (the workboat's parts are all '(null)' material but named for what they are). Linear
	// rgb + roughness; the old boat's hull is left pure white and painted by height in the game.
	oldboat: { file: 'Old_boat_Mesh.obj', colors: { Ship_Mat: [ 1, 1, 1, 0.7 ], Windows_Mat: [ 0.03, 0.05, 0.07, 0.08 ], Rope_mat: [ 0.45, 0.33, 0.18, 0.9 ] } },
	// Water Wars 1.10: the WaveCutter speedboat (no .mtl either; its scene has a 150 m water plane, skipped).
	// The hull ('Brushed__Dark_Metal') is left white and painted by height in the game.
	wavecutter: { file: 'BoatModelWaveCutter.obj', skip: [ 'Plane' ], colors: {
		Brushed__Dark_Metal: [ 1, 1, 1, 0.3 ], Glass: [ 0.03, 0.05, 0.07, 0.05 ], Fabric: [ 0.72, 0.68, 0.6, 0.8 ],
		Wood: [ 0.3, 0.18, 0.09, 0.7 ], Metal_Semirough_01: [ 0.6, 0.6, 0.62, 0.25 ], 'Metal_scratched.001': [ 0.45, 0.45, 0.47, 0.4 ], None: [ 0.02, 0.02, 0.02, 0.6 ],
	} },
	// Water Wars 1.13: the 110 m superyacht (CGTrader, Royalty Free): sealed (ModelKey.js), never shipped as
	// a plain file. Its textured materials get flat colours here (linear rgb + roughness).
	superyacht: { file: 'Superyacht (1).fbx', sealed: true, colors: {
		M_yacht_body: [ 0.82, 0.82, 0.8, 0.3 ], M_yacht_body2: [ 0.03, 0.03, 0.035, 0.3 ],
		'M_chrome-02': [ 0.62, 0.62, 0.64, 0.2 ], 'M_chrome_01.001': [ 0.5, 0.48, 0.42, 0.25 ],
		M_teak_floor: [ 0.36, 0.22, 0.11, 0.75 ], 'M_fabric-01': [ 0.72, 0.68, 0.6, 0.85 ],
		'M_glass-02': [ 0.02, 0.035, 0.05, 0.05 ], M_black_Rubber: [ 0.02, 0.02, 0.02, 0.8 ], M_Engine_shaft: [ 0.15, 0.15, 0.16, 0.4 ],
		M_led_red_02: [ 1, 0.02, 0.0, 0.3 ], M_LED_green_02: [ 0.0, 0.6, 0.05, 0.3 ], M_LED_white: [ 0.9, 0.9, 0.9, 0.3 ],
	} },
	workboat: { file: 'boat (2).obj', objectColors: [
		[ 'hull_fiberglass', [ 0.8, 0.8, 0.78, 0.4 ] ],
		[ 'border_painted_metal', [ 0.03, 0.12, 0.3, 0.45 ] ],
		[ 'breakwater_painted_metal', [ 0.03, 0.12, 0.3, 0.45 ] ],
		[ 'engine_painted_metal', [ 0.55, 0.56, 0.58, 0.4 ] ],
		[ 'grid_metal', [ 0.32, 0.33, 0.34, 0.5 ] ],
		[ 'control_panel', [ 0.08, 0.09, 0.1, 0.5 ] ],
		[ 'steering_wheel', [ 0.02, 0.02, 0.02, 0.6 ] ],
		[ 'lamp_painted_metal', [ 0.6, 0.45, 0.02, 0.45 ] ],
		[ 'lightbulb', [ 1, 0.9, 0.6, 0.2 ] ],
		[ 'small_box', [ 0.7, 0.15, 0.02, 0.5 ] ],
		[ 'large_box', [ 0.7, 0.15, 0.02, 0.5 ] ],
		[ 'power_sockets', [ 0.05, 0.05, 0.05, 0.6 ] ],
		[ 'capstan', [ 0.25, 0.26, 0.28, 0.4 ] ],
		[ 'cables', [ 0.02, 0.02, 0.02, 0.7 ] ],
		[ 'bollards', [ 0.6, 0.45, 0.02, 0.5 ] ],
		[ 'wood', [ 0.3, 0.17, 0.08, 0.85 ] ],
		[ 'lantern', [ 0.6, 0.45, 0.02, 0.45 ] ],
	] },
};

function parseMTL( text ) {

	const mats = {};
	let cur = null;
	for ( const line of text.split( /\r?\n/ ) ) {

		const t = line.trim().split( /\s+/ );
		if ( t[ 0 ] === 'newmtl' ) cur = mats[ t.slice( 1 ).join( ' ' ) ] = { kd: [ 0.8, 0.8, 0.8 ], ns: 50 };
		else if ( cur && t[ 0 ] === 'Kd' ) cur.kd = t.slice( 1, 4 ).map( Number );
		else if ( cur && t[ 0 ] === 'Ns' ) cur.ns = Number( t[ 1 ] );

	}

	return mats;

}

// sRGB -> linear
const lin = ( c ) => c <= 0.04045 ? c / 12.92 : Math.pow( ( c + 0.055 ) / 1.055, 2.4 );

function load( id, cfg ) {

	const file = path.join( SRC, cfg.file );
	if ( ! fs.existsSync( file ) ) throw new Error( `${ id }: source not found: ${ file }` );
	if ( file.toLowerCase().endsWith( '.obj' ) ) {

		// stray polyline elements ('l') make OBJLoader turn a whole object into line segments: drop them
		const text = fs.readFileSync( file, 'utf8' ).replace( /^l .*$/gm, '' );
		const group = new OBJLoader().parse( text );
		const mtl = cfg.mtl ? parseMTL( fs.readFileSync( path.join( SRC, cfg.mtl ), 'utf8' ) ) : {};
		// OBJ (Blender / SketchUp) Kd is already linear-ish display colour: treat as sRGB
		const colorOf = ( m ) => {

			const e = mtl[ m && m.name ];
			const kd = e ? e.kd : [ 0.8, 0.8, 0.8 ];
			return { rgb: kd.map( lin ), rough: e ? Math.max( 0.15, Math.min( 0.95, 1 - Math.sqrt( e.ns / 1000 ) ) ) : 0.6 };

		};

		return { group, colorOf };

	}

	const buf = fs.readFileSync( file );
	const group = new FBXLoader().parse( buf.buffer.slice( buf.byteOffset, buf.byteOffset + buf.byteLength ), path.dirname( file ) + '/' );
	const colorOf = ( m ) => {

		// FBXLoader colours are already linear (ColorManagement)
		const c = m && m.color ? m.color : new THREE.Color( 0.8, 0.8, 0.8 );
		const shin = m && m.shininess !== undefined ? m.shininess : 30;
		return { rgb: [ c.r, c.g, c.b ], rough: Math.max( 0.2, Math.min( 0.95, 1 - Math.sqrt( shin / 200 ) ) ) };

	};

	return { group, colorOf };

}

function bake( group, colorOf, skip = [] ) {

	group.updateMatrixWorld( true );
	const parts = [];
	const matNames = new Set();
	group.traverse( ( o ) => {

		if ( ! o.isMesh || o.isLineSegments || o.isPoints || ! o.geometry || ! o.geometry.attributes.position ) return;
		// objects that aren't the boat (a water plane in the source scene, ...)
		if ( skip.some( ( s ) => o.name === s || o.name.startsWith( s + '_' ) ) ) return;
		let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
		g.applyMatrix4( o.matrixWorld );
		// a mirrored transform flips the winding
		if ( o.matrixWorld.determinant() < 0 ) {

			const p = g.attributes.position;
			for ( let i = 0; i < p.count; i += 3 ) for ( let k = 0; k < 3; k ++ ) {

				const a = p.getComponent( i + 1, k );
				p.setComponent( i + 1, k, p.getComponent( i + 2, k ) );
				p.setComponent( i + 2, k, a );

			}

		}

		const n = g.attributes.position.count;
		const mats = Array.isArray( o.material ) ? o.material : [ o.material ];
		const col = new Float32Array( n * 4 );
		const groups = g.groups.length ? g.groups : [ { start: 0, count: n, materialIndex: 0 } ];
		for ( const gr of groups ) {

			const m = mats[ gr.materialIndex ] || mats[ 0 ];
			if ( m && m.name ) matNames.add( m.name );
			const { rgb, rough } = colorOf( m, o );
			for ( let i = gr.start; i < Math.min( n, gr.start + gr.count ); i ++ ) {

				col[ i * 4 ] = rgb[ 0 ]; col[ i * 4 + 1 ] = rgb[ 1 ]; col[ i * 4 + 2 ] = rgb[ 2 ]; col[ i * 4 + 3 ] = rough;

			}

		}

		// keep only what we export
		const out = new THREE.BufferGeometry();
		out.setAttribute( 'position', g.attributes.position );
		if ( g.attributes.normal ) out.setAttribute( 'normal', g.attributes.normal );
		out.setAttribute( 'color', new THREE.BufferAttribute( col, 4 ) );
		if ( ! out.attributes.normal ) out.computeVertexNormals();
		parts.push( out );

	} );

	// merge, then weld identical vertices
	let total = 0;
	for ( const p of parts ) total += p.attributes.position.count;
	const P = new Float32Array( total * 3 ), Nn = new Float32Array( total * 3 ), C = new Float32Array( total * 4 );
	let o = 0;
	for ( const p of parts ) {

		const c = p.attributes.position.count;
		P.set( p.attributes.position.array.subarray( 0, c * 3 ), o * 3 );
		Nn.set( p.attributes.normal.array.subarray( 0, c * 3 ), o * 3 );
		C.set( p.attributes.color.array.subarray( 0, c * 4 ), o * 4 );
		o += c;

	}

	const merged = new THREE.BufferGeometry();
	merged.setAttribute( 'position', new THREE.BufferAttribute( P, 3 ) );
	merged.setAttribute( 'normal', new THREE.BufferAttribute( Nn, 3 ) );
	merged.setAttribute( 'color', new THREE.BufferAttribute( C, 4 ) );
	const welded = mergeVertices( merged, 1e-4 );
	welded.computeBoundingBox();
	return { geo: welded, materials: [ ...matNames ] };

}

function write( id, geo, materials, sealed = false ) {

	const pos = geo.attributes.position, nrm = geo.attributes.normal, col = geo.attributes.color;
	const n = pos.count, idx = geo.index.array;
	const bytes = n * 12 + n * 4 + n * 4 + idx.length * 4;
	const buf = new ArrayBuffer( bytes );
	new Float32Array( buf, 0, n * 3 ).set( pos.array.subarray( 0, n * 3 ) );
	const N8 = new Int8Array( buf, n * 12, n * 4 );
	const C8 = new Uint8Array( buf, n * 16, n * 4 );
	for ( let i = 0; i < n; i ++ ) {

		let x = nrm.getX( i ), y = nrm.getY( i ), z = nrm.getZ( i );
		const l = Math.hypot( x, y, z ) || 1;
		x /= l; y /= l; z /= l;
		N8[ i * 4 ] = Math.round( x * 127 ); N8[ i * 4 + 1 ] = Math.round( y * 127 ); N8[ i * 4 + 2 ] = Math.round( z * 127 );
		for ( let k = 0; k < 4; k ++ ) C8[ i * 4 + k ] = Math.round( Math.max( 0, Math.min( 1, col.getComponent( i, k ) ) ) * 255 );

	}

	new Uint32Array( buf, n * 20, idx.length ).set( idx );
	const bb = geo.boundingBox;
	const json = { vertexCount: n, indexCount: idx.length, bbox: { min: bb.min.toArray(), max: bb.max.toArray() }, materials };
	fs.mkdirSync( OUT, { recursive: true } );
	if ( sealed ) {

		// a licensed model: one sealed file (src/game/ModelKey.js), no plain copy
		const jsonBytes = Buffer.from( JSON.stringify( json ) );
		const start = ( 4 + jsonBytes.length + 3 ) & ~ 3;
		const plain = Buffer.alloc( start + bytes );
		plain.writeUInt32LE( jsonBytes.length, 0 );
		jsonBytes.copy( plain, 4 );
		Buffer.from( buf ).copy( plain, start );
		const iv = crypto.randomBytes( 12 );
		const c = crypto.createCipheriv( 'aes-256-gcm', Buffer.from( modelKey() ), iv );
		const body = Buffer.concat( [ c.update( plain ), c.final(), c.getAuthTag() ] );
		fs.writeFileSync( path.join( OUT, id + '.dat' ), Buffer.concat( [ iv, body ] ) );
		for ( const ext of [ '.bin', '.json' ] ) if ( fs.existsSync( path.join( OUT, id + ext ) ) ) fs.unlinkSync( path.join( OUT, id + ext ) );

	} else {

		fs.writeFileSync( path.join( OUT, id + '.bin' ), Buffer.from( buf ) );
		fs.writeFileSync( path.join( OUT, id + '.json' ), JSON.stringify( json, null, '\t' ) );

	}
	const size = bb.getSize( new THREE.Vector3() );
	console.log( `${ id }: ${ n } vertices, ${ idx.length / 3 } triangles, ${ ( bytes / 1048576 ).toFixed( 2 ) } MB, size ${ size.toArray().map( ( v ) => v.toFixed( 2 ) ).join( ' x ' ) } (min ${ bb.min.toArray().map( ( v ) => v.toFixed( 2 ) ).join( ', ' ) })` );

}

const only = process.argv[ 2 ];
for ( const [ id, cfg ] of Object.entries( BOATS ) ) {

	if ( only && only !== id ) continue;
	const { group, colorOf: base } = load( id, cfg );
	const colorOf = ( m, o ) => {

		const byObj = cfg.objectColors && o && cfg.objectColors.find( ( [ prefix ] ) => o.name.startsWith( prefix ) );
		const c = byObj ? byObj[ 1 ] : cfg.colors && m && cfg.colors[ m.name ];
		return c ? { rgb: c.slice( 0, 3 ), rough: c[ 3 ] } : base( m );

	};
	const { geo, materials } = bake( group, colorOf, cfg.skip || [] );
	write( id, geo, materials, !! cfg.sealed );

}
