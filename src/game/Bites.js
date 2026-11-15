import { FISH, FISH_IDS, TIERS, TIER_IDS } from './FishTable.js';

// Where the bobber is and what lives there.
//   depth     water depth under the bobber (m)
//   reefDist  horizontal distance to the reef edge (m, < 0 inside it)
//   pierDist  horizontal distance to the pier (piles / head) (m)
// Returns weights per water type (they overlap: a spot can be both pier and bay).
export function habitatAt( { depth, reefDist, pierDist } ) {

	const h = { shallows: 0, reef: 0, pier: 0, bay: 0, deep: 0 };
	if ( depth < 0.25 ) return h; // on the sand
	h.shallows = smooth( 3.5, 1.0, depth );
	h.reef = smooth( 12, - 6, reefDist ) * smooth( 0.8, 2.5, depth );
	h.pier = smooth( 9, 2, pierDist ) * smooth( 0.6, 2, depth );
	h.bay = smooth( 1.5, 4, depth ) * ( 1 - smooth( 18, 30, depth ) );
	h.deep = smooth( 16, 28, depth );
	return h;

}

// 1 at the species' favourite time, less at others; hour 0..24
export function activity( pref, hour ) {

	const dawn = Math.exp( - ( ( hour - 6.5 ) ** 2 ) / 2.5 ), dusk = Math.exp( - ( ( hour - 18.5 ) ** 2 ) / 2.5 );
	const night = hour < 5.5 || hour > 19.5 ? 1 : 0;
	const day = hour > 7 && hour < 18 ? 1 : 0.35;
	switch ( pref ) {

		case 'day': return 0.25 + 0.75 * day * ( 1 - night );
		case 'dawnDusk': return 0.3 + 0.7 * Math.max( dawn, dusk ) + 0.1 * day;
		case 'night': return 0.15 + 0.85 * Math.max( night, dusk * 0.8 );
		default: return 0.8 + 0.2 * Math.max( dawn, dusk );

	}

}

// The chance of each rarity tier for a bite. Deep water and the danger waters (opts.danger) tilt it
// toward the epic and legendary fish.
// opts.luck (the bait upgrade) scales the rare fish too.
export function tierChances( habitat, { danger = false, luck = 1 } = {} ) {

	const deep = habitat.deep || 0;
	// danger: true (an old danger zone, x1.6) or the danger tier's multiplier (1 / 1.4 / 2)
	const boost = ( 1 + 0.4 * deep ) * ( danger === true ? 1.6 : ( Number( danger ) || 1 ) ) * luck;
	const c = {};
	let total = 0;
	for ( const t of TIER_IDS ) {

		c[ t ] = TIERS[ t ].chance * ( t === 'epic' || t === 'legendary' ? boost : t === 'rare' ? Math.sqrt( luck ) : 1 );
		total += c[ t ];

	}

	for ( const t of TIER_IDS ) c[ t ] /= total;
	return c;

}

// Weighted pick of the species that bites here; null when nothing lives here (dry sand).
// First the tier (tierChances), then a species of that tier that lives in this water (habitat x
// rarity x time of day). If none of that tier lives here the nearest tier that does is used, except
// legendary fish: one of those can turn up anywhere there is water.
// rng: () => [0, 1); opts: { danger }
export function pickSpecies( habitat, hour, rng = Math.random, opts = {} ) {

	let wet = 0;
	for ( const k in habitat ) wet += habitat[ k ];
	if ( wet < 1e-4 ) return null;
	const chances = tierChances( habitat, opts );
	let r = rng(), tier = TIER_IDS[ 0 ];
	for ( const t of TIER_IDS ) {

		tier = t;
		r -= chances[ t ];
		if ( r <= 0 ) break;

	}

	const weights = ( t, anywhere ) => {

		const ids = [], w = [];
		let total = 0;
		for ( const id of FISH_IDS ) {

			const f = FISH[ id ];
			if ( f.tier !== t ) continue;
			let hw = 0;
			for ( const k in f.habitat ) hw += f.habitat[ k ] * ( habitat[ k ] || 0 );
			if ( anywhere ) hw = Math.max( hw, 0.2 );
			const x = hw * f.rarity * activity( f.time, hour );
			if ( x <= 1e-5 ) continue;
			ids.push( id );
			w.push( x );
			total += x;

		}

		return { ids, w, total };

	};

	let pool = weights( tier, false );
	if ( pool.total < 1e-4 ) {

		if ( tier === 'legendary' ) pool = weights( tier, true );
		else {

			// the nearest tier with fish here (cheaper first)
			const i = TIER_IDS.indexOf( tier );
			for ( let d = 1; d < TIER_IDS.length && pool.total < 1e-4; d ++ ) for ( const j of [ i - d, i + d ] ) {

				if ( j < 0 || j >= TIER_IDS.length || TIER_IDS[ j ] === 'legendary' ) continue;
				pool = weights( TIER_IDS[ j ], false );
				if ( pool.total >= 1e-4 ) break;

			}

		}

	}

	if ( pool.total < 1e-4 ) return null;
	let q = rng() * pool.total;
	for ( let i = 0; i < pool.ids.length; i ++ ) {

		q -= pool.w[ i ];
		if ( q <= 0 ) return pool.ids[ i ];

	}

	return pool.ids[ pool.ids.length - 1 ];

}

// Weight in kg: skewed toward the small end (most fish are small, trophies are rare)
export function rollWeight( id, rng = Math.random ) {

	const [ a, b ] = FISH[ id ].kg;
	const t = Math.pow( rng(), 2.2 );
	return a + ( b - a ) * t;

}

// Seconds until the next bite at this spot: richer water bites sooner. Infinity when barren.
export function biteDelay( habitat, hour, rng = Math.random ) {

	let rich = 0;
	for ( const k in habitat ) rich += habitat[ k ];
	if ( rich < 0.05 ) return Infinity;
	// open water between the named habitats still has fish: never much slower than a poor spot
	rich = Math.max( rich, 0.35 );
	const light = hour > 6 && hour < 19 ? 1 : 0.8;
	const mean = 8 / ( Math.min( rich, 1.6 ) * light );
	return 2 + - Math.log( 1 - rng() * 0.98 ) * mean * 0.6;

}

function smooth( e0, e1, x ) {

	const t = Math.min( 1, Math.max( 0, ( x - e0 ) / ( e1 - e0 ) ) );
	return t * t * ( 3 - 2 * t );

}
