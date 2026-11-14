import { BufferGeometry, Float32BufferAttribute, BufferAttribute, Mesh, Group, Vector3, Matrix4, Quaternion } from '../engine/index.js';
import { createPropMaterial } from './GameMaterials.js';

// the catalogue (names, prices, stats, model fitting) lives in BoatCatalog.js (plain data: the
// save and the node tests read it without the renderer)
import { BOATS } from './BoatCatalog.js';
export { BOATS };

export const BOAT_IDS = Object.keys( BOATS );

const BASE = ( ( import.meta.env && import.meta.env.BASE_URL ) || '/' ) + 'models/boats/';
const _cache = new Map();

const AXIS = { x: 0, y: 1, z: 2 };
function axis( spec ) {

	const neg = spec[ 0 ] === '-';
	return { i: AXIS[ neg ? spec[ 1 ] : spec[ 0 ] ], s: neg ? - 1 : 1 };

}

// fetch + decode a converted model into an engine geometry in the boat frame
export function loadBoatGeometry( id ) {

	const def = BOATS[ id ];
	if ( ! def || ! def.model ) return Promise.resolve( null );
	if ( _cache.has( id ) ) return _cache.get( id );
	const p = ( async () => {

		const [ meta, bin ] = await Promise.all( [
			fetch( BASE + def.model + '.json' ).then( ( r ) => {

				if ( ! r.ok ) throw new Error( `boat model ${ def.model }: ${ r.status }` );
				return r.json();

			} ),
			fetch( BASE + def.model + '.bin' ).then( ( r ) => r.arrayBuffer() ),
		] );
		const n = meta.vertexCount;
		const P = new Float32Array( bin, 0, n * 3 );
		const N8 = new Int8Array( bin, n * 12, n * 4 );
		const C8 = new Uint8Array( bin, n * 16, n * 4 );
		const I = new Uint32Array( bin, n * 20, meta.indexCount );

		// source axes -> boat frame (+Y up, +Z forward), fitted to the length / beam, keel at -draft
		const up = axis( def.up ), fwd = axis( def.fwd );
		const side = 3 - up.i - fwd.i;
		const min = meta.bbox.min, max = meta.bbox.max;
		const len = max[ fwd.i ] - min[ fwd.i ], wid = max[ side ] - min[ side ];
		const sz = def.length / len, sx = ( def.beam || def.length * wid / len ) / wid;
		const sy = sz; // keep the profile's proportions along the length
		const cF = ( max[ fwd.i ] + min[ fwd.i ] ) / 2, cS = ( max[ side ] + min[ side ] ) / 2;
		const yMin = up.s > 0 ? min[ up.i ] : - max[ up.i ];
		// the side axis' sign makes the mapping a proper rotation (rows side, up, fwd: det +1), so the
		// model is never mirrored and the winding stays as authored
		const parity = ( ( up.i - side + 3 ) % 3 === 1 ) ? 1 : - 1;
		const sideSign = parity * up.s * fwd.s;
		const pos = new Float32Array( n * 3 ), nrm = new Float32Array( n * 3 ), col = new Float32Array( n * 3 ), aux = new Float32Array( n * 4 );
		for ( let i = 0; i < n; i ++ ) {

			const a = P[ i * 3 + up.i ] * up.s, b = P[ i * 3 + fwd.i ] * fwd.s, c = P[ i * 3 + side ];
			pos[ i * 3 ] = ( c - cS ) * sideSign * sx;
			pos[ i * 3 + 1 ] = ( a - yMin ) * sy - def.draft;
			pos[ i * 3 + 2 ] = ( b - cF * fwd.s ) * sz;
			const na = N8[ i * 4 + up.i ] / 127 * up.s, nb = N8[ i * 4 + fwd.i ] / 127 * fwd.s, nc = N8[ i * 4 + side ] / 127 * sideSign;
			// non-uniform scale: normals scale by the inverse
			let x = nc / sx, y = na / sy, z = nb / sz;
			const l = Math.hypot( x, y, z ) || 1;
			nrm[ i * 3 ] = x / l; nrm[ i * 3 + 1 ] = y / l; nrm[ i * 3 + 2 ] = z / l;
			col[ i * 3 ] = C8[ i * 4 ] / 255; col[ i * 3 + 1 ] = C8[ i * 4 + 1 ] / 255; col[ i * 3 + 2 ] = C8[ i * 4 + 2 ] / 255;
			if ( def.paint && C8[ i * 4 ] === 255 && C8[ i * 4 + 1 ] === 255 && C8[ i * 4 + 2 ] === 255 ) {

				const y = pos[ i * 3 + 1 ];
				const band = def.paint.find( ( b ) => y < b[ 0 ] ) || def.paint[ def.paint.length - 1 ];
				col[ i * 3 ] = band[ 1 ][ 0 ]; col[ i * 3 + 1 ] = band[ 1 ][ 1 ]; col[ i * 3 + 2 ] = band[ 1 ][ 2 ];

			}
			aux[ i * 4 ] = C8[ i * 4 + 3 ] / 255;

		}

		const index = new Uint32Array( I );

		const g = new BufferGeometry();
		g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
		g.setAttribute( 'normal', new Float32BufferAttribute( nrm, 3 ) );
		g.setAttribute( 'uv', new Float32BufferAttribute( new Float32Array( n * 2 ), 2 ) );
		g.setAttribute( 'color', new Float32BufferAttribute( col, 3 ) );
		g.setAttribute( 'aux', new Float32BufferAttribute( aux, 4 ) );
		g.setIndex( new BufferAttribute( index, 1 ) );
		g.computeBoundingBox();
		g.computeBoundingSphere();
		return g;

	} )();
	_cache.set( id, p );
	p.catch( () => _cache.delete( id ) );
	return p;

}

let _mat = null;
export function boatModelMaterial() {

	if ( ! _mat ) {

		_mat = createPropMaterial( 'boughtBoat' );
		_mat.side = 'double'; // imported meshes are not always closed or consistently wound
		_mat.underwaterLighting = 'lite';

	}

	return _mat;

}

// a mesh of the boat model (shared geometry), or null for the lobster boat
export async function createBoatMesh( id ) {

	const g = await loadBoatGeometry( id );
	if ( ! g ) return null;
	const m = new Mesh( g, boatModelMaterial() );
	m.name = 'boat-model-' + id;
	m.castShadow = true;
	m.receiveShadow = true;
	return m;

}

export { Group, Vector3, Matrix4, Quaternion };

// height of the top surface (a roof, a deck) at (x, z) on a boat geometry: rays straight down at a few
// points around it hit the highest triangle under each; the median skips a mast or an aerial
export function surfaceY( geo, x, z, r = 0.45 ) {

	const p = geo.attributes.position.array, idx = geo.index.array;
	const pts = [ [ x, z ], [ x + r, z ], [ x - r, z ], [ x, z + r ], [ x, z - r ] ];
	const hits = pts.map( () => - Infinity );
	for ( let t = 0; t < idx.length; t += 3 ) {

		const a = idx[ t ] * 3, b = idx[ t + 1 ] * 3, c = idx[ t + 2 ] * 3;
		const ax = p[ a ], az = p[ a + 2 ], bx = p[ b ], bz = p[ b + 2 ], cx = p[ c ], cz = p[ c + 2 ];
		const d = ( bz - cz ) * ( ax - cx ) + ( cx - bx ) * ( az - cz );
		if ( Math.abs( d ) < 1e-9 ) continue;
		for ( let k = 0; k < pts.length; k ++ ) {

			const [ px, pz ] = pts[ k ];
			const w0 = ( ( bz - cz ) * ( px - cx ) + ( cx - bx ) * ( pz - cz ) ) / d;
			const w1 = ( ( cz - az ) * ( px - cx ) + ( ax - cx ) * ( pz - cz ) ) / d;
			const w2 = 1 - w0 - w1;
			if ( w0 < 0 || w1 < 0 || w2 < 0 ) continue;
			const y = w0 * p[ a + 1 ] + w1 * p[ b + 1 ] + w2 * p[ c + 1 ];
			if ( y > hits[ k ] ) hits[ k ] = y;

		}

	}

	const ok = hits.filter( Number.isFinite ).sort( ( m, n ) => m - n );
	return ok.length ? ok[ Math.floor( ok.length / 2 ) ] : null;

}
