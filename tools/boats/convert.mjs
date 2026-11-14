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

function bake( group, colorOf ) {

	group.updateMatrixWorld( true );
	const parts = [];
	const matNames = new Set();
	group.traverse( ( o ) => {

		if ( ! o.isMesh || o.isLineSegments || o.isPoints || ! o.geometry || ! o.geometry.attributes.position ) return;
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
			const { rgb, rough } = colorOf( m );
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

function write( id, geo, materials ) {

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
	fs.writeFileSync( path.join( OUT, id + '.bin' ), Buffer.from( buf ) );
	fs.writeFileSync( path.join( OUT, id + '.json' ), JSON.stringify( json, null, '\t' ) );
	const size = bb.getSize( new THREE.Vector3() );
	console.log( `${ id }: ${ n } vertices, ${ idx.length / 3 } triangles, ${ ( bytes / 1048576 ).toFixed( 2 ) } MB, size ${ size.toArray().map( ( v ) => v.toFixed( 2 ) ).join( ' x ' ) } (min ${ bb.min.toArray().map( ( v ) => v.toFixed( 2 ) ).join( ', ' ) })` );

}

const only = process.argv[ 2 ];
for ( const [ id, cfg ] of Object.entries( BOATS ) ) {

	if ( only && only !== id ) continue;
	const { group, colorOf: base } = load( id, cfg );
	const colorOf = cfg.colors ? ( m ) => {

		const c = m && cfg.colors[ m.name ];
		return c ? { rgb: c.slice( 0, 3 ), rough: c[ 3 ] } : base( m );

	} : base;
	const { geo, materials } = bake( group, colorOf );
	write( id, geo, materials );

}
