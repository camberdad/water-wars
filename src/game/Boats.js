import { BufferGeometry, Float32BufferAttribute, BufferAttribute, Mesh, Group, Vector3, Matrix4, Quaternion } from '../engine/index.js';
import { createPropMaterial } from './GameMaterials.js';
import { openSealedModel } from './ModelKey.js';

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
// def: the fitting (BoatCatalog); another def under its own id loads a variant of a model (1.14: the boss)
export function loadBoatGeometry( id, def = BOATS[ id ] ) {


	if ( ! def || ! def.model ) return Promise.resolve( null );
	if ( _cache.has( id ) ) return _cache.get( id );
	const p = ( async () => {

		let meta, bin;
		if ( def.sealed ) {

			// a licensed model, sealed so it isn't published as a plain file (ModelKey.js)
			const r = await fetch( BASE + def.model + '.dat' );
			if ( ! r.ok ) throw new Error( `boat model ${ def.model }: ${ r.status }` );
			( { meta, bin } = await openSealedModel( await r.arrayBuffer() ) );

		} else [ meta, bin ] = await Promise.all( [
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
				// deckColor: surfaces facing up above the waterline are decks, not hull sides
				const band = def.deckColor && y > ( def.deckMinY ?? 0.25 ) && y < ( def.deckMaxY ?? 1.6 ) && nrm[ i * 3 + 1 ] > 0.75 ? [ 0, def.deckColor ] : def.paint.find( ( b ) => y < b[ 0 ] ) || def.paint[ def.paint.length - 1 ];
				col[ i * 3 ] = band[ 1 ][ 0 ]; col[ i * 3 + 1 ] = band[ 1 ][ 1 ]; col[ i * 3 + 2 ] = band[ 1 ][ 2 ];

			}
			aux[ i * 4 ] = C8[ i * 4 + 3 ] / 255;

		}

		let index = new Uint32Array( I );
		// 1.12.2: some triangles in the source models are wound against their own normals. The material is
		// double-sided and shades a back face with its normal flipped, so such a face lit from above
		// shades as if it faced down: a dark (sea-green) triangle on a sunny deck. Turn them round to
		// agree with the authored normals.
		for ( let t = 0; t < index.length; t += 3 ) {

			const a = index[ t ], b = index[ t + 1 ], c = index[ t + 2 ];
			const ux = pos[ b * 3 ] - pos[ a * 3 ], uy = pos[ b * 3 + 1 ] - pos[ a * 3 + 1 ], uz = pos[ b * 3 + 2 ] - pos[ a * 3 + 2 ];
			const vx = pos[ c * 3 ] - pos[ a * 3 ], vy = pos[ c * 3 + 1 ] - pos[ a * 3 + 1 ], vz = pos[ c * 3 + 2 ] - pos[ a * 3 + 2 ];
			const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
			const nx = nrm[ a * 3 ] + nrm[ b * 3 ] + nrm[ c * 3 ], ny = nrm[ a * 3 + 1 ] + nrm[ b * 3 + 1 ] + nrm[ c * 3 + 1 ], nz = nrm[ a * 3 + 2 ] + nrm[ b * 3 + 2 ] + nrm[ c * 3 + 2 ];
			if ( fx * nx + fy * ny + fz * nz < 0 ) {

				index[ t + 1 ] = c;
				index[ t + 2 ] = b;

			}

		}
		// cut boxes: drop the triangles inside (dark: only near-black ones), e.g. doors in the way
		if ( def.cut && def.cut.length ) {

			const keep = [];
			const inBox = ( v, c ) => {

				const x = pos[ v * 3 ], y = pos[ v * 3 + 1 ], z = pos[ v * 3 + 2 ];
				if ( x < c.min[ 0 ] || y < c.min[ 1 ] || z < c.min[ 2 ] || x > c.max[ 0 ] || y > c.max[ 1 ] || z > c.max[ 2 ] ) return false;
				return ! c.dark || ( col[ v * 3 ] < 0.12 && col[ v * 3 + 1 ] < 0.12 && col[ v * 3 + 2 ] < 0.12 );

			};

			for ( let t = 0; t < index.length; t += 3 ) {

				const a = index[ t ], b = index[ t + 1 ], c = index[ t + 2 ];
				if ( def.cut.some( ( box ) => inBox( a, box ) && inBox( b, box ) && inBox( c, box ) ) ) continue;
				keep.push( a, b, c );

			}

			index = new Uint32Array( keep );

		}

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
		// the hull below the waterline looks under water; its decks never do (they're inside the hull)
		_mat.underwaterLighting = 'hull';

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

// A closed volume around a model's hull at the waterline, for the water mask (no sea drawn inside the
// hull, e.g. over a deck that sits below the waterline). Slices along the length: each is as wide as the
// hull around the waterline (the 92nd percentile of |x|, so fenders and rails don't bulge it), from the
// bottom of the hull up to a lid `top` m above the water (above the waves, below a standing eye).
export function hullVolumeFor( geo, top = 0.55 ) {

	const P = geo.attributes.position.array, n = P.length / 3, I = geo.index.array;
	geo.computeBoundingBox();
	const z0 = geo.boundingBox.min.z, z1 = geo.boundingBox.max.z;
	const S = Math.max( 28, Math.ceil( ( z1 - z0 ) / 0.2 ) ), dz = ( z1 - z0 ) / S;
	const bottom = new Array( S + 1 ).fill( 0 );
	for ( let i = 0; i < n; i ++ ) {

		const y = P[ i * 3 + 1 ];
		const k = Math.round( ( P[ i * 3 + 2 ] - z0 ) / dz );
		if ( y < bottom[ k ] ) bottom[ k ] = y;

	}

	// Water Wars 1.12.1: the hull's exact waterline. Every triangle crossing the water level (y = 0) gives a
	// segment of it; each segment is laid into the slices it spans and the widest |x| at each slice's centre
	// is the hull's half-width there. (The old estimate from vertices near the waterline came out up to
	// 0.75 m wider than the hull, more on some boats: the mask then cut the sea away beside the hull.)
	const half = new Array( S + 1 ).fill( 0 );
	const cross = ( a, b, out ) => {

		const ya = P[ a * 3 + 1 ], yb = P[ b * 3 + 1 ];
		if ( ( ya > 0 ) === ( yb > 0 ) ) return false;
		const s = ya / ( ya - yb );
		out[ 0 ] = Math.abs( P[ a * 3 ] + ( P[ b * 3 ] - P[ a * 3 ] ) * s );
		out[ 1 ] = P[ a * 3 + 2 ] + ( P[ b * 3 + 2 ] - P[ a * 3 + 2 ] ) * s;
		return true;

	};

	const A = [ 0, 0 ], Bp = [ 0, 0 ], C = [ 0, 0 ];
	for ( let t = 0; t < I.length; t += 3 ) {

		const a = I[ t ], b = I[ t + 1 ], c = I[ t + 2 ];
		const pts = [];
		if ( cross( a, b, A ) ) pts.push( [ A[ 0 ], A[ 1 ] ] );
		if ( cross( b, c, Bp ) ) pts.push( [ Bp[ 0 ], Bp[ 1 ] ] );
		if ( cross( c, a, C ) ) pts.push( [ C[ 0 ], C[ 1 ] ] );
		if ( pts.length < 2 ) continue;
		let [ [ xa, za ], [ xb, zb ] ] = pts;
		if ( za > zb ) [ xa, za, xb, zb ] = [ xb, zb, xa, za ];
		const k0 = Math.max( 0, Math.ceil( ( za - z0 ) / dz ) ), k1 = Math.min( S, Math.floor( ( zb - z0 ) / dz ) );
		for ( let k = k0; k <= k1; k ++ ) {

			const zc = z0 + k * dz;
			const x = zb - za > 1e-6 ? xa + ( xb - xa ) * ( zc - za ) / ( zb - za ) : Math.max( xa, xb );
			if ( x > half[ k ] ) half[ k ] = x;

		}

	}

	// a hair inside the hull, so no sea is cut away beside it
	for ( let k = 0; k <= S; k ++ ) half[ k ] = Math.max( 0, half[ k ] - 0.03 );
	// 1.12.2: the lid follows the hull's sides down. Seen from outside, the volume must stay within the
	// boat's own outline (anywhere it pokes out, the sea behind is cut away): each slice's lid stays under
	// its hull side, at the 80th percentile of the side's vertex heights (rails and masts don't count).
	const sideY = Array.from( { length: S + 1 }, () => [] );
	for ( let i = 0; i < n; i ++ ) {

		const y = P[ i * 3 + 1 ];
		const k = Math.round( ( P[ i * 3 + 2 ] - z0 ) / dz );
		if ( y > 0 && half[ k ] > 0.05 && Math.abs( P[ i * 3 ] ) > half[ k ] * 0.85 ) sideY[ k ].push( y );

	}

	const lid = sideY.map( ( a ) => {

		if ( a.length < 6 ) return Math.min( top, 0.55 );
		a.sort( ( p, q ) => p - q );
		return Math.min( top, Math.max( 0.55, a[ Math.floor( a.length * 0.8 ) ] - 0.05 ) ); // never under the old 0.55 m

	} );
	// 1.12.3: only where the hull is in the water. The overhangs past the waterline (a bow, a swim platform)
	// used to get a 4 cm "fin" up to the lid: seen from the side it cut a rectangle out of the sea.
	let kFirst = 0, kLast = S;
	while ( kFirst < S && half[ kFirst ] < 0.01 ) kFirst ++;
	while ( kLast > kFirst && half[ kLast ] < 0.01 ) kLast --;
	// a ring of 4 vertices per slice (bottom-left, top-left, top-right, bottom-right), capped at the ends
	const pos = [], idx = [];
	for ( let k = kFirst; k <= kLast; k ++ ) {

		const z = z0 + k * dz, b = Math.min( - 0.05, bottom[ k ] );
		// a slice with no waterline inside the run: flat, under the water
		const dry = half[ k ] < 0.01;
		const w = dry ? 0.001 : half[ k ], t = dry ? - 0.05 : lid[ k ];
		pos.push( - w, b, z, - w, t, z, w, t, z, w, b, z );

	}

	const R = kLast - kFirst;
	for ( let k = 0; k < R; k ++ ) for ( let s = 0; s < 4; s ++ ) {

		const a = k * 4 + s, b = k * 4 + ( s + 1 ) % 4, c = a + 4, d = b + 4;
		idx.push( a, c, b, b, c, d );

	}

	idx.push( 0, 1, 2, 0, 2, 3 );
	const e = R * 4;
	idx.push( e, e + 2, e + 1, e, e + 3, e + 2 );
	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( new Float32Array( pos ), 3 ) );
	g.setIndex( idx );
	g.computeBoundingBox();
	g.computeBoundingSphere();
	return g;

}

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

// ---------------------------------------------------------------- walkable decks

// A walkable deck for a bought boat, built from its model: on a grid over the hull (boat frame) rays
// straight down find every surface; the floor of a cell is the highest surface no more than a cabin's
// height above the main deck (so roofs are skipped and you walk under them), and cells with no floor
// above the waterline are outside the hull. Player.updateDeck walks on this instead of the lobster
// boat's boxes: you go wherever the deck goes, step up / down small ledges, and stop at the rails.
const DECK_CELL = 0.3;
// floorMin: the lowest a deck can be (m from the waterline; lower surfaces are the inside of the hull)
// planes: [ [ x0, z0, x1, z1, y ], ... ] extra walkable floor (a grating deck the cell sampling falls
// through)
export function buildDeckMap( geo, floorMin = 0.05, planes = null ) {

	if ( geo.userData && geo.userData.deckMap ) return geo.userData.deckMap;
	const p = geo.attributes.position.array, idx = geo.index.array;
	geo.computeBoundingBox();
	const bb = geo.boundingBox;
	const x0 = bb.min.x, z0 = bb.min.z;
	const nx = Math.max( 1, Math.ceil( ( bb.max.x - x0 ) / DECK_CELL ) ), nz = Math.max( 1, Math.ceil( ( bb.max.z - z0 ) / DECK_CELL ) );
	const hits = Array.from( { length: nx * nz }, () => [] );
	for ( let t = 0; t < idx.length; t += 3 ) {

		const a = idx[ t ] * 3, b = idx[ t + 1 ] * 3, c = idx[ t + 2 ] * 3;
		const ax = p[ a ], az = p[ a + 2 ], bx = p[ b ], bz = p[ b + 2 ], cx = p[ c ], cz = p[ c + 2 ];
		const d = ( bz - cz ) * ( ax - cx ) + ( cx - bx ) * ( az - cz );
		if ( Math.abs( d ) < 1e-9 ) continue; // vertical (a wall): rays don't land on it
		const i0 = Math.max( 0, Math.floor( ( Math.min( ax, bx, cx ) - x0 ) / DECK_CELL ) ), i1 = Math.min( nx - 1, Math.floor( ( Math.max( ax, bx, cx ) - x0 ) / DECK_CELL ) );
		const k0 = Math.max( 0, Math.floor( ( Math.min( az, bz, cz ) - z0 ) / DECK_CELL ) ), k1 = Math.min( nz - 1, Math.floor( ( Math.max( az, bz, cz ) - z0 ) / DECK_CELL ) );
		for ( let k = k0; k <= k1; k ++ ) for ( let i = i0; i <= i1; i ++ ) {

			const px = x0 + ( i + 0.5 ) * DECK_CELL, pz = z0 + ( k + 0.5 ) * DECK_CELL;
			const w0 = ( ( bz - cz ) * ( px - cx ) + ( cx - bx ) * ( pz - cz ) ) / d;
			const w1 = ( ( cz - az ) * ( px - cx ) + ( ax - cx ) * ( pz - cz ) ) / d;
			const w2 = 1 - w0 - w1;
			if ( w0 < 0 || w1 < 0 || w2 < 0 ) continue;
			hits[ k * nx + i ].push( w0 * p[ a + 1 ] + w1 * p[ b + 1 ] + w2 * p[ c + 1 ] );

		}

	}

	if ( planes ) for ( const [ px0, pz0, px1, pz1, py ] of planes ) for ( let k = 0; k < nz; k ++ ) for ( let i = 0; i < nx; i ++ ) {

		const px = x0 + ( i + 0.5 ) * DECK_CELL, pz = z0 + ( k + 0.5 ) * DECK_CELL;
		// only inside the hull (a cell with some of the boat under it), never out over the water
		const h = hits[ k * nx + i ];
		if ( h.length && px >= px0 && px <= px1 && pz >= pz0 && pz <= pz1 ) h.push( py );

	}

	// the main deck: the lowest surface above the waterline, typical over the hull
	const lows = [];
	for ( const h of hits ) {

		let lo = Infinity;
		for ( const y of h ) if ( y > floorMin && y < lo ) lo = y;
		if ( lo < Infinity ) lows.push( lo );

	}

	lows.sort( ( m, n ) => m - n );
	const deckY = lows.length ? lows[ Math.floor( lows.length * 0.4 ) ] : 1;
	const ceil = deckY + 1.6; // anything higher is a roof or a mast: walk under it
	const floor = new Float32Array( nx * nz ).fill( NaN );
	for ( let c = 0; c < hits.length; c ++ ) {

		let best = - Infinity;
		for ( const y of hits[ c ] ) if ( y > floorMin && y <= ceil && y > best ) best = y;
		if ( best > - Infinity ) floor[ c ] = best;

	}

	// a cell with walkable floor needs neighbours: drop single specks (rail tops, thin trim)
	const ok = new Uint8Array( nx * nz );
	for ( let k = 0; k < nz; k ++ ) for ( let i = 0; i < nx; i ++ ) {

		const f = floor[ k * nx + i ];
		if ( ! Number.isFinite( f ) ) continue;
		let n = 0;
		for ( let dk = - 1; dk <= 1; dk ++ ) for ( let di = - 1; di <= 1; di ++ ) {

			const ii = i + di, kk = k + dk;
			if ( ii < 0 || kk < 0 || ii >= nx || kk >= nz ) continue;
			const g = floor[ kk * nx + ii ];
			if ( Number.isFinite( g ) && Math.abs( g - f ) < 0.5 ) n ++;

		}

		if ( n >= 5 ) ok[ k * nx + i ] = 1;

	}

	const map = {
		deckY, x0, z0, nx, nz, cell: DECK_CELL, floor, ok,
		// floor height at (x, z), or NaN outside the deck
		floorAt( x, z ) {

			const i = Math.floor( ( x - x0 ) / DECK_CELL ), k = Math.floor( ( z - z0 ) / DECK_CELL );
			if ( i < 0 || k < 0 || i >= nx || k >= nz || ! ok[ k * nx + i ] ) return NaN;
			return floor[ k * nx + i ];

		},
		// true when (x, z) is within r of the deck's edge (the rail)
		edgeNear( x, z, r = 0.7 ) {

			const n = Math.ceil( r / DECK_CELL );
			const i = Math.floor( ( x - x0 ) / DECK_CELL ), k = Math.floor( ( z - z0 ) / DECK_CELL );
			for ( let dk = - n; dk <= n; dk ++ ) for ( let di = - n; di <= n; di ++ ) {

				const ii = i + di, kk = k + dk;
				if ( ii < 0 || kk < 0 || ii >= nx || kk >= nz || ! ok[ kk * nx + ii ] ) return true;

			}

			return false;

		},
		// the walkable cell nearest to (x, z): a safe spot to stand
		nearest( x, z ) {

			let best = null, bd = Infinity;
			for ( let k = 0; k < nz; k ++ ) for ( let i = 0; i < nx; i ++ ) {

				if ( ! ok[ k * nx + i ] ) continue;
				const cx = x0 + ( i + 0.5 ) * DECK_CELL, cz = z0 + ( k + 0.5 ) * DECK_CELL;
				const dd = ( cx - x ) ** 2 + ( cz - z ) ** 2;
				if ( dd < bd ) {

					bd = dd;
					best = { x: cx, z: cz, y: floor[ k * nx + i ] };

				}

			}

			return best;

		},
	};
	geo.userData = geo.userData || {};
	geo.userData.deckMap = map;
	return map;

}
