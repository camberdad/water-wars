// Lists an OBJ's or FBX's objects / materials with their triangle counts and bounding boxes (for setting
// up a new boat in convert.mjs):  node tools/boats/inspect.mjs "<file.obj|file.fbx>"
import fs from 'node:fs';
import path from 'node:path';

globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.document = {
	createElementNS: () => ( { addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {} } ),
	createElement: () => ( { addEventListener() {}, removeEventListener() {}, getContext: () => null, style: {} } ),
};

const THREE = await import( 'three' );
const { OBJLoader } = await import( 'three/examples/jsm/loaders/OBJLoader.js' );
const { FBXLoader } = await import( 'three/examples/jsm/loaders/FBXLoader.js' );
const file = process.argv[ 2 ];
let group;
if ( file.toLowerCase().endsWith( '.fbx' ) ) {

	const buf = fs.readFileSync( file );
	group = new FBXLoader().parse( buf.buffer.slice( buf.byteOffset, buf.byteOffset + buf.byteLength ), path.dirname( file ) + '/' );

} else group = new OBJLoader().parse( fs.readFileSync( file, 'utf8' ).replace( /^l .*$/gm, '' ) );

group.updateMatrixWorld( true );
const all = new THREE.Box3();
group.traverse( ( o ) => {

	if ( ! o.isMesh ) return;
	const b = new THREE.Box3().setFromObject( o );
	all.union( b );
	const mats = ( Array.isArray( o.material ) ? o.material : [ o.material ] ).map( ( m ) => m && `${ m.name }(${ m.color ? m.color.getHexString() : '-' })` );
	const g = o.geometry;
	const tris = ( g.index ? g.index.count : g.attributes.position.count ) / 3;
	console.log( `${ o.name } [${ mats.join( ', ' ) }] ${ tris } tris  min ${ b.min.toArray().map( ( v ) => v.toFixed( 2 ) ) }  max ${ b.max.toArray().map( ( v ) => v.toFixed( 2 ) ) }` );

} );
console.log( 'ALL min', all.min.toArray().map( ( v ) => v.toFixed( 2 ) ), 'max', all.max.toArray().map( ( v ) => v.toFixed( 2 ) ), 'size', all.getSize( new THREE.Vector3() ).toArray().map( ( v ) => v.toFixed( 2 ) ) );
