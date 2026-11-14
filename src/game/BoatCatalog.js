// The boats you can own. The lobster boat is Tidewater's procedural boat; the others are imported
// models (tools/boats/convert.mjs -> public/models/boats/<model>.bin/.json). The physics and the
// helm stay the lobster boat's (its hydrodynamics drive every hull); a bought boat swaps the look and
// brings its own stats on top of your upgrades:
//   hullMul  x hull points (armour upgrades scale with it)    speedMul  x engine power
//   holdKg   + fish hold                                       fuelMul   x tank size
//   gun / cannon: where the deck gun and the bow cannon sit (boat frame: +Z forward, +Y up, y 0 = waterline);
//            the height is found on the model (the roof / deck under that point), y here is the fallback
//   hitHalf: half extents of the hit box; length / beam: the model is fitted to these (metres)
// Model axes: `up` and `fwd` name the source axes ('x' | 'y' | 'z', with '-' to flip) that become +Y and +Z.
export const BOATS = {
	lobster: {
		name: 'Lobster boat', price: 0,
		blurb: 'The old Downeast lobster boat you started with. Slow, honest, cheap to run.',
		hullMul: 1, speedMul: 1, holdKg: 0, fuelMul: 1,
	},
	trawler: {
		name: 'Harbour trawler', price: 60000, model: 'trawler',
		blurb: 'A stout steel trawler with a big hold and thick plating. Shrugs off small-arms fire.',
		hullMul: 1.7, speedMul: 0.95, holdKg: 220, fuelMul: 1.6,
		up: 'y', fwd: 'x', length: 12.5, beam: 4.6, draft: 1.1,
		gun: [ 0, 3.3, - 1.5 ], cannon: [ 0, 1.9, 4.4 ], hitHalf: [ 2.4, 2.4, 6.2 ],
	},
	sportfisher: {
		name: 'Sport-fishing yacht', price: 160000, model: 'sportfisher',
		blurb: 'A fast flybridge sport-fisher. Outruns anything on the water and lands the big game fish.',
		hullMul: 1.3, speedMul: 1.6, holdKg: 120, fuelMul: 1.8,
		up: 'y', fwd: '-x', length: 13.5, beam: 4.4, draft: 0.9,
		gun: [ 0, 2.9, 1.5 ], cannon: [ 0, 3.4, 5.0 ], hitHalf: [ 2.3, 2.3, 6.8 ],
	},
	ship: {
		name: 'Deep-sea fishing ship', price: 400000, model: 'ship',
		blurb: 'A full-size fishing ship: a fortress of a hull and a hold that never fills. The pride of the island.',
		hullMul: 2.8, speedMul: 1.2, holdKg: 700, fuelMul: 3,
		up: 'y', fwd: 'z', length: 16.5, beam: 5.0, draft: 1.0,
		// the hull material is plain white in the source: antifouling, boot stripe, topsides, white house
		paint: [ [ 0.1, [ 0.32, 0.035, 0.025 ] ], [ 0.32, [ 0.85, 0.84, 0.8 ] ], [ 2.7, [ 0.025, 0.07, 0.16 ] ], [ 99, [ 0.78, 0.78, 0.75 ] ] ],
		gun: [ 0, 5.9, 2.0 ], cannon: [ 0, 3.3, 7.0 ], hitHalf: [ 2.7, 3.0, 8.4 ],
	},
};

export const BOAT_ORDER = Object.keys( BOATS );

// stats of the active boat applied to the gear stats (GameState.stats)
export function applyBoat( stats, id ) {

	const b = BOATS[ id ] || BOATS.lobster;
	stats.hullHP = Math.round( stats.hullHP * b.hullMul );
	stats.speedMul *= b.speedMul;
	stats.holdKg += b.holdKg;
	stats.fuelL = Math.round( stats.fuelL * b.fuelMul );
	stats.boatName = b.name;
	return stats;

}
