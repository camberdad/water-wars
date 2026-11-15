// Lists an OBJ's objects / materials with their vertex counts and bounding boxes (for setting up a
// new boat in convert.mjs):  node tools/boats/inspect.mjs "<file.obj>"
import fs from 'node:fs';

const THREE = await import( 'three' );
const { OBJLoader } = await import( 'three/examples/jsm/loaders/OBJLoader.js' );
const file = process.argv[ 2 ];
const text = fs.readFileSync( file, 'utf8' ).replace( /^l .*$/gm, '' );
const group = new OBJLoader().parse( text );
group.updateMatrixWorld( true );
const all = new THREE.Box3();
group.traverse( ( o ) => {

	if ( ! o.isMesh ) return;
	const g = o.geometry;
	g.computeBoundingBox();
	all.union( g.boundingBox );
	const mats = ( Array.isArray( o.material ) ? o.material : [ o.material ] ).map( ( m ) => m && m.name );
	const b = g.boundingBox;
	console.log( `${ o.name } [${ mats.join( ', ' ) }] ${ g.attributes.position.count / 3 } tris  min ${ b.min.toArray().map( ( v ) => v.toFixed( 2 ) ) }  max ${ b.max.toArray().map( ( v ) => v.toFixed( 2 ) ) }` );

} );
console.log( 'ALL min', all.min.toArray().map( ( v ) => v.toFixed( 2 ) ), 'max', all.max.toArray().map( ( v ) => v.toFixed( 2 ) ), 'size', all.getSize( new THREE.Vector3() ).toArray().map( ( v ) => v.toFixed( 2 ) ) );
