// The boats you can own. The lobster boat is Tidewater's procedural boat; the others are imported
// models (tools/boats/convert.mjs -> public/models/boats/<model>.bin/.json). The physics and the
// helm stay the lobster boat's (its hydrodynamics drive every hull); a bought boat swaps the look and
// brings its own stats on top of your upgrades:
//   hullMul  x hull points (armour upgrades scale with it)    speedMul  x engine power
//   holdKg   + fish hold                                       fuelMul   x tank size
//   gun / cannon: where the deck gun and the bow cannon sit (boat frame: +Z forward, +Y up, y 0 = waterline);
//            the height is found on the model (the roof / deck under that point), y here is the fallback
//   hitHalf: half extents of the hit box; length / beam: the model is fitted to these (metres)
//   draft: how deep the keel sits below the waterline (bigger = lower in the water)
//   deckPlanes: [ [ x0, z0, x1, z1, y ] ] extra walkable floor, e.g. over a grating deck
//   floorMin: the lowest walkable deck (m from the waterline) when the deck sits below it
//   fixedMounts: gun / cannon heights are used as given (not found on the model)
//   stern: [ x, y, z ] the harpoon mount (and the stern rod holders); found on the model when absent
//   cut: boxes { min, max, dark } in the boat frame: triangles inside one are removed (dark: only
//        near-black ones), e.g. doors that block the way
// Model axes: `up` and `fwd` name the source axes ('x' | 'y' | 'z', with '-' to flip) that become +Y and +Z.
export const BOATS = {
	lobster: {
		name: 'Lobster boat', price: 0,
		blurb: 'The old Downeast lobster boat you started with. Slow, honest, cheap to run.',
		hullMul: 1, speedMul: 1, holdKg: 0, fuelMul: 1,
	},
	// Water Wars 1.9: an open steel workboat (bow on +x, modelled in centimetres: fitted by length)
	workboat: {
		name: 'Harbour workboat', price: 25000, model: 'workboat',
		blurb: 'An open steel workboat with a capstan and a big engine box. Cheap to run, quick off the mark, room for a good catch.',
		hullMul: 1.25, speedMul: 1.25, holdKg: 90, fuelMul: 1.3,
		up: 'y', fwd: 'x', length: 9.3, beam: 3.3, draft: 0.4, rudderMul: 1.1,
		// the deck gun on the engine box, the cannon on the raised foredeck (its deck is a grating: rays
		// fall through it, so the heights are given)
		gun: [ 0, 1.62, - 0.9 ], cannon: [ 0, 1.62, 3.7 ], fixedMounts: true, hitHalf: [ 1.7, 1.6, 4.7 ],
		// the open well between the engine box and the foredeck is a steel grating: walk on it
		deckPlanes: [ [ - 1.25, - 0.3, 1.25, 2.7, 0.12 ], [ - 1.25, - 3.1, 1.25, - 2.1, 0.17 ] ],
	},
	trawler: {
		name: 'Harbour trawler', price: 60000, model: 'trawler',
		blurb: 'A stout steel trawler with a big hold and thick plating. Shrugs off small-arms fire.',
		hullMul: 1.7, speedMul: 1.1, holdKg: 220, fuelMul: 1.6, rudderMul: 1.5,
		up: 'y', fwd: 'x', length: 12.5, beam: 4.6, draft: 1.1,
		gun: [ 0, 3.3, - 1.5 ], cannon: [ 0, 1.9, 4.4 ], hitHalf: [ 2.4, 2.4, 6.2 ],
	},
	// Water Wars 1.9: a weathered old fishing launch (bow on +z); its hull material is plain white in the
	// source, painted by height here: antifouling, a boot stripe, a dark green hull, cream topsides
	oldboat: {
		name: 'Old fishing launch', price: 95000, model: 'oldboat',
		blurb: 'A weathered old fishing launch with tyre fenders and a cavernous hold. Slow and thirsty, but she carries a mountain of fish and takes a beating.',
		hullMul: 1.9, speedMul: 0.95, holdKg: 320, fuelMul: 2.0,
		up: 'y', fwd: 'z', length: 14.4, beam: 5.7, draft: 0.9, rudderMul: 1.4,
		paint: [ [ 0.1, [ 0.3, 0.05, 0.03 ] ], [ 0.3, [ 0.75, 0.73, 0.68 ] ], [ 1.15, [ 0.03, 0.09, 0.06 ] ], [ 99, [ 0.62, 0.58, 0.48 ] ] ],
		deckColor: [ 0.26, 0.17, 0.09 ], // weathered wooden decks
		gun: [ 0, 4.0, - 2.0 ], cannon: [ 0, 2.2, 5.0 ], hitHalf: [ 2.85, 2.5, 7.2 ],
	},
	sportfisher: {
		name: 'Sport-fishing yacht', price: 160000, model: 'sportfisher',
		blurb: 'A fast flybridge sport-fisher. Outruns anything on the water and lands the big game fish.',
		hullMul: 1.3, speedMul: 1.6, holdKg: 120, fuelMul: 1.8,
		up: 'y', fwd: 'x', length: 13.5, beam: 4.4, draft: 0.9, rudderMul: 1.2,
		gun: [ 0, 2.9, - 1.5 ], cannon: [ 0, 2.0, 5.0 ], hitHalf: [ 2.3, 2.3, 6.8 ],
		// the harpoon low on the transom (the model's highest point over the stern is the hardtop)
		stern: [ 0, 1.3, - 6.0 ],
		// the two doors in the back of the cabin
		cut: [ { min: [ - 1.3, 0.45, - 3.62 ], max: [ 1.3, 2.5, - 3.46 ], dark: true } ],
	},
	ship: {
		name: 'Deep-sea fishing ship', price: 400000, model: 'ship',
		blurb: 'A full-size fishing ship: a fortress of a hull and a hold that never fills. The pride of the island.',
		hullMul: 2.8, speedMul: 1.2, holdKg: 700, fuelMul: 3,
		// sits deep: its working deck is a little under the waterline (the hull keeps the sea out)
		up: 'y', fwd: 'z', length: 13, beam: 4.6, draft: 1.7, floorMin: - 0.6, rudderMul: 1.5,
		// the hull material is plain white in the source: antifouling, boot stripe, topsides, white house
		paint: [ [ 0.1, [ 0.32, 0.035, 0.025 ] ], [ 0.32, [ 0.85, 0.84, 0.8 ] ], [ 2.0, [ 0.025, 0.07, 0.16 ] ], [ 99, [ 0.78, 0.78, 0.75 ] ] ],
		gun: [ 0, 4.5, 1.6 ], cannon: [ 0, 2.6, 5.4 ], hitHalf: [ 2.5, 2.6, 6.8 ],
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
