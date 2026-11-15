// Boat-to-boat contact (Water Wars 1.8.2): two boats touch only where their hulls do. Each hull is a
// convex outline in plan (square-ish stern, straight sides, a tapered bow) around the boat's centre,
// turned to its heading; the separating-axis test finds whether two outlines overlap and, if so, the
// shortest way to push them apart.

// the outline of a hull of half beam w and half length l, boat frame (x across, z forward)
export function hullOutline( w, l ) {

	return [
		[ - w * 0.92, - l ], [ w * 0.92, - l ], [ w, - 0.25 * l ], [ w * 0.9, 0.45 * l ],
		[ w * 0.35, 0.9 * l ], [ 0, l ], [ - w * 0.35, 0.9 * l ], [ - w * 0.9, 0.45 * l ], [ - w, - 0.25 * l ],
	];

}

// the outline placed in the world: centre (x, z) and heading yaw (forward = (sin yaw, cos yaw))
export function placeOutline( shape, x, z, yaw, out = [] ) {

	const s = Math.sin( yaw ), c = Math.cos( yaw );
	out.length = shape.length;
	for ( let i = 0; i < shape.length; i ++ ) {

		const [ lx, lz ] = shape[ i ];
		out[ i ] = [ x + lx * c + lz * s, z - lx * s + lz * c ];

	}

	return out;

}

function project( poly, ax, az ) {

	let lo = Infinity, hi = - Infinity;
	for ( const [ x, z ] of poly ) {

		const p = x * ax + z * az;
		if ( p < lo ) lo = p;
		if ( p > hi ) hi = p;

	}

	return [ lo, hi ];

}

// do the outlines A and B overlap? null if not, else { nx, nz, depth }: the unit direction to move A
// (away from B) and how far, the smallest push that separates them
export function hullContact( A, B ) {

	let best = Infinity, bx = 0, bz = 0;
	for ( const poly of [ A, B ] ) {

		for ( let i = 0; i < poly.length; i ++ ) {

			const p = poly[ i ], q = poly[ ( i + 1 ) % poly.length ];
			let ax = q[ 1 ] - p[ 1 ], az = p[ 0 ] - q[ 0 ];
			const l = Math.hypot( ax, az );
			if ( l < 1e-9 ) continue;
			ax /= l; az /= l;
			const [ a0, a1 ] = project( A, ax, az ), [ b0, b1 ] = project( B, ax, az );
			const over = Math.min( a1, b1 ) - Math.max( a0, b0 );
			if ( over <= 0 ) return null; // a gap along this axis: not touching
			if ( over < best ) {

				best = over;
				bx = ax;
				bz = az;

			}

		}

	}

	// point the push from B's centre toward A's
	let cax = 0, caz = 0, cbx = 0, cbz = 0;
	for ( const [ x, z ] of A ) { cax += x; caz += z; }
	for ( const [ x, z ] of B ) { cbx += x; cbz += z; }
	const dx = cax / A.length - cbx / B.length, dz = caz / A.length - cbz / B.length;
	if ( dx * bx + dz * bz < 0 ) {

		bx = - bx;
		bz = - bz;

	}

	return { nx: bx, nz: bz, depth: best };

}
