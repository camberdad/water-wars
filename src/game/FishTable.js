// Catchable fish: 40 real Caribbean / western Atlantic species. Tidewater swam 18 of them; the rest
// borrow the closest body plan from the world's fish models (world/fish/FishSpecies.js).
//
//   name      display name
//   sci       scientific name
//   lw        [ a, b ] length-weight relation W (g) = a * L (cm, total length) ^ b (FishBase-style values)
//   model     key in SPECIES (the swimming model / skin)
//   habitat   weights per water type (see Bites.habitatAt): shallows (sand, < 3 m), reef (over the
//             reef), pier (around the piles), bay (open water 3–20 m), deep (offshore, > 20 m)
//   kg        [ min, max ] weight; sizes follow a skewed distribution (most fish are small)
//   tier      rarity: common, uncommon, rare, epic, legendary (Water Wars; see TIERS and Bites.pickSpecies)
//   value     [ min, max ] $ for the smallest .. the biggest of the species (bigger fish are worth more)
//   fight     0..1 how hard it pulls (surge strength and frequency in the catch mini-game)
//   stamina   seconds of good pressure it takes to tire a typical one
//   time      activity by time of day: 'day', 'dawnDusk', 'night' or 'any'
//   rarity    0..1, how often it bites relative to the others of its tier in the same water

// Rarity tiers: the chance a bite is of each tier (before the water and the danger waters shift it),
// the value band and the catch card's colours. Rare fish are common enough; legendary ones, the only
// fish worth more than $600,000, turn up now and then. (Water Wars 1.3: every value x10.)
export const TIERS = {
	common: { name: 'Common', chance: 0.36, color: '#cfd8dc', min: 750, max: 4000 },
	uncommon: { name: 'Uncommon', chance: 0.30, color: '#7fdc8c', min: 4000, max: 25000 },
	rare: { name: 'Rare', chance: 0.22, color: '#5cb8ff', min: 25000, max: 120000 },
	epic: { name: 'Epic', chance: 0.10, color: '#c38bff', min: 120000, max: 600000 },
	legendary: { name: 'Legendary', chance: 0.02, color: '#ffc845', min: 600000, max: 800000 },
};
export const TIER_IDS = Object.keys( TIERS );

export const FISH = {
	// ---- common ($75 - $400)
	silverside: { name: 'Hardhead silverside', sci: 'Atherinomorus stipes', lw: [ 0.0074, 3.1 ], model: 'silverside', habitat: { shallows: 1, pier: 0.6, bay: 0.2 }, kg: [ 0.02, 0.08 ], tier: 'common', value: [ 750, 1100 ], fight: 0.05, stamina: 1.5, time: 'any', rarity: 0.6 },
	pinfish: { name: 'Pinfish', sci: 'Lagodon rhomboides', lw: [ 0.0164, 3.0 ], model: 'grunt', habitat: { shallows: 1, pier: 0.8 }, kg: [ 0.08, 0.5 ], tier: 'common', value: [ 800, 1400 ], fight: 0.12, stamina: 2, time: 'day', rarity: 1 },
	sergeant: { name: 'Sergeant major', sci: 'Abudefduf saxatilis', lw: [ 0.0234, 3.0 ], model: 'sergeant', habitat: { pier: 1, reef: 0.8 }, kg: [ 0.1, 0.35 ], tier: 'common', value: [ 850, 1600 ], fight: 0.15, stamina: 2.5, time: 'day', rarity: 1 },
	chromis: { name: 'Blue chromis', sci: 'Chromis cyanea', lw: [ 0.0209, 3.0 ], model: 'chromis', habitat: { reef: 1 }, kg: [ 0.03, 0.1 ], tier: 'common', value: [ 900, 1700 ], fight: 0.05, stamina: 1.5, time: 'day', rarity: 0.6 },
	mullet: { name: 'Striped mullet', sci: 'Mugil cephalus', lw: [ 0.0112, 2.98 ], model: 'mullet', habitat: { shallows: 1, pier: 0.4 }, kg: [ 0.4, 2.2 ], tier: 'common', value: [ 1000, 2400 ], fight: 0.3, stamina: 5, time: 'day', rarity: 0.8 },
	grunt: { name: 'Bluestriped grunt', sci: 'Haemulon sciurus', lw: [ 0.0145, 3.06 ], model: 'grunt', habitat: { pier: 1, reef: 0.8, bay: 0.2 }, kg: [ 0.3, 1.2 ], tier: 'common', value: [ 1100, 2600 ], fight: 0.25, stamina: 4, time: 'any', rarity: 1 },
	needlefish: { name: 'Houndfish', sci: 'Tylosurus crocodilus', lw: [ 0.0012, 3.1 ], model: 'needlefish', habitat: { shallows: 0.7, bay: 0.5, pier: 0.3 }, kg: [ 0.5, 2.5 ], tier: 'common', value: [ 1300, 3500 ], fight: 0.45, stamina: 5, time: 'day', rarity: 0.5 },
	laneSnapper: { name: 'Lane snapper', sci: 'Lutjanus synagris', lw: [ 0.0145, 2.98 ], model: 'yellowtail', habitat: { reef: 0.8, bay: 1, pier: 0.4 }, kg: [ 0.3, 1.8 ], tier: 'common', value: [ 1500, 3800 ], fight: 0.3, stamina: 4, time: 'any', rarity: 0.9 },
	blueRunner: { name: 'Blue runner', sci: 'Caranx crysos', lw: [ 0.0158, 2.95 ], model: 'jack', habitat: { bay: 1, pier: 0.7, deep: 0.4 }, kg: [ 0.5, 3 ], tier: 'common', value: [ 1400, 4000 ], fight: 0.5, stamina: 6, time: 'dawnDusk', rarity: 0.8 },
	vermilion: { name: 'Vermilion snapper', sci: 'Rhomboplites aurorubens', lw: [ 0.0134, 3.0 ], model: 'redSnapper', habitat: { deep: 1, bay: 0.3 }, kg: [ 0.3, 2.5 ], tier: 'common', value: [ 1500, 3800 ], fight: 0.3, stamina: 4, time: 'any', rarity: 1 },
	littleTunny: { name: 'Little tunny', sci: 'Euthynnus alletteratus', lw: [ 0.0132, 3.05 ], model: 'tuna', habitat: { deep: 1, bay: 0.5 }, kg: [ 1, 6 ], tier: 'common', value: [ 1600, 4000 ], fight: 0.6, stamina: 7, time: 'dawnDusk', rarity: 0.8 },

	// ---- uncommon ($400 - $2,500)
	yellowtail: { name: 'Yellowtail snapper', sci: 'Ocyurus chrysurus', lw: [ 0.0137, 2.98 ], model: 'yellowtail', habitat: { reef: 1, pier: 0.4, bay: 0.4 }, kg: [ 0.4, 1.6 ], tier: 'uncommon', value: [ 4000, 11000 ], fight: 0.4, stamina: 5, time: 'dawnDusk', rarity: 1 },
	tang: { name: 'Blue tang', sci: 'Acanthurus coeruleus', lw: [ 0.0282, 2.95 ], model: 'tang', habitat: { reef: 1 }, kg: [ 0.2, 0.6 ], tier: 'uncommon', value: [ 4500, 10000 ], fight: 0.2, stamina: 3, time: 'day', rarity: 0.8 },
	triggerfish: { name: 'Queen triggerfish', sci: 'Balistes vetula', lw: [ 0.0281, 2.93 ], model: 'angel', habitat: { reef: 1, pier: 0.3 }, kg: [ 0.6, 2.5 ], tier: 'uncommon', value: [ 5000, 15000 ], fight: 0.35, stamina: 5, time: 'day', rarity: 0.8 },
	spanishMackerel: { name: 'Spanish mackerel', sci: 'Scomberomorus maculatus', lw: [ 0.0061, 3.07 ], model: 'barracuda', habitat: { bay: 1, deep: 0.6, pier: 0.3 }, kg: [ 0.8, 4 ], tier: 'uncommon', value: [ 5500, 17000 ], fight: 0.55, stamina: 7, time: 'day', rarity: 1 },
	jack: { name: 'Crevalle jack', sci: 'Caranx hippos', lw: [ 0.02, 2.93 ], model: 'jack', habitat: { shallows: 0.5, pier: 0.7, bay: 0.8 }, kg: [ 1, 9 ], tier: 'uncommon', value: [ 6000, 20000 ], fight: 0.75, stamina: 12, time: 'dawnDusk', rarity: 0.9 },
	parrot: { name: 'Stoplight parrotfish', sci: 'Sparisoma viride', lw: [ 0.0151, 3.06 ], model: 'parrot', habitat: { reef: 1 }, kg: [ 0.8, 4 ], tier: 'uncommon', value: [ 6500, 19000 ], fight: 0.35, stamina: 6, time: 'day', rarity: 0.8 },
	muttonSnapper: { name: 'Mutton snapper', sci: 'Lutjanus analis', lw: [ 0.0145, 2.98 ], model: 'redSnapper', habitat: { reef: 0.8, bay: 0.6, deep: 0.6 }, kg: [ 1.5, 8 ], tier: 'uncommon', value: [ 8000, 24000 ], fight: 0.5, stamina: 8, time: 'dawnDusk', rarity: 0.8 },
	permit: { name: 'Permit', sci: 'Trachinotus falcatus', lw: [ 0.0228, 2.95 ], model: 'jack', habitat: { shallows: 1, bay: 0.5, pier: 0.3 }, kg: [ 3, 15 ], tier: 'uncommon', value: [ 10000, 25000 ], fight: 0.8, stamina: 14, time: 'day', rarity: 0.6 },

	// ---- rare ($2,500 - $12,000)
	wrasse: { name: 'Hogfish', sci: 'Lachnolaimus maximus', lw: [ 0.0151, 3.07 ], model: 'wrasse', habitat: { reef: 0.8, bay: 0.3 }, kg: [ 0.5, 4 ], tier: 'rare', value: [ 25000, 60000 ], fight: 0.35, stamina: 6, time: 'day', rarity: 1 },
	angel: { name: 'Queen angelfish', sci: 'Holacanthus ciliaris', lw: [ 0.0302, 2.94 ], model: 'angel', habitat: { reef: 1 }, kg: [ 0.4, 1.6 ], tier: 'rare', value: [ 30000, 70000 ], fight: 0.25, stamina: 4, time: 'day', rarity: 0.8 },
	barracuda: { name: 'Great barracuda', sci: 'Sphyraena barracuda', lw: [ 0.0051, 3.08 ], model: 'barracuda', habitat: { reef: 0.5, bay: 0.8, deep: 0.5 }, kg: [ 2, 16 ], tier: 'rare', value: [ 26000, 80000 ], fight: 0.7, stamina: 11, time: 'any', rarity: 1 },
	kingMackerel: { name: 'King mackerel', sci: 'Scomberomorus cavalla', lw: [ 0.0047, 3.06 ], model: 'barracuda', habitat: { deep: 1, bay: 0.4 }, kg: [ 4, 25 ], tier: 'rare', value: [ 28000, 85000 ], fight: 0.8, stamina: 14, time: 'dawnDusk', rarity: 0.9 },
	redSnapper: { name: 'Red snapper', sci: 'Lutjanus campechanus', lw: [ 0.0137, 2.98 ], model: 'redSnapper', habitat: { deep: 1, bay: 0.2 }, kg: [ 1.5, 9 ], tier: 'rare', value: [ 30000, 90000 ], fight: 0.5, stamina: 9, time: 'any', rarity: 1 },
	bonefish: { name: 'Bonefish', sci: 'Albula vulpes', lw: [ 0.0083, 3.06 ], model: 'mullet', habitat: { shallows: 1, bay: 0.2 }, kg: [ 1.5, 6 ], tier: 'rare', value: [ 32000, 100000 ], fight: 0.85, stamina: 12, time: 'day', rarity: 0.9 },
	snook: { name: 'Common snook', sci: 'Centropomus undecimalis', lw: [ 0.0071, 3.07 ], model: 'tarpon', habitat: { pier: 1, shallows: 0.5, bay: 0.3 }, kg: [ 2, 12 ], tier: 'rare', value: [ 35000, 110000 ], fight: 0.7, stamina: 12, time: 'night', rarity: 0.9 },
	blackGrouper: { name: 'Black grouper', sci: 'Mycteroperca bonaci', lw: [ 0.0098, 3.08 ], model: 'grouper', habitat: { reef: 0.8, deep: 0.8 }, kg: [ 5, 35 ], tier: 'rare', value: [ 35000, 115000 ], fight: 0.7, stamina: 14, time: 'any', rarity: 0.7 },
	cobia: { name: 'Cobia', sci: 'Rachycentron canadum', lw: [ 0.0042, 3.17 ], model: 'barracuda', habitat: { pier: 0.6, bay: 0.8, deep: 0.6 }, kg: [ 5, 30 ], tier: 'rare', value: [ 40000, 120000 ], fight: 0.8, stamina: 16, time: 'any', rarity: 0.7 },
	wahoo: { name: 'Wahoo', sci: 'Acanthocybium solandri', lw: [ 0.0017, 3.27 ], model: 'barracuda', habitat: { deep: 1 }, kg: [ 8, 35 ], tier: 'rare', value: [ 45000, 120000 ], fight: 0.9, stamina: 16, time: 'dawnDusk', rarity: 0.7 },

	// ---- epic ($12,000 - $60,000)
	tuna: { name: 'Blackfin tuna', sci: 'Thunnus atlanticus', lw: [ 0.0145, 3.0 ], model: 'tuna', habitat: { deep: 1 }, kg: [ 3, 14 ], tier: 'epic', value: [ 120000, 280000 ], fight: 0.85, stamina: 16, time: 'dawnDusk', rarity: 1 },
	grouper: { name: 'Nassau grouper', sci: 'Epinephelus striatus', lw: [ 0.0107, 3.07 ], model: 'grouper', habitat: { reef: 0.6, deep: 0.6 }, kg: [ 3, 14 ], tier: 'epic', value: [ 140000, 340000 ], fight: 0.6, stamina: 12, time: 'any', rarity: 0.9 },
	mahi: { name: 'Mahi-mahi', sci: 'Coryphaena hippurus', lw: [ 0.0079, 3.0 ], model: 'mahi', habitat: { deep: 0.8 }, kg: [ 4, 18 ], tier: 'epic', value: [ 150000, 380000 ], fight: 0.8, stamina: 15, time: 'day', rarity: 1 },
	tarpon: { name: 'Tarpon', sci: 'Megalops atlanticus', lw: [ 0.0077, 3.02 ], model: 'tarpon', habitat: { pier: 0.35, bay: 0.5, shallows: 0.15 }, kg: [ 10, 45 ], tier: 'epic', value: [ 200000, 520000 ], fight: 1, stamina: 24, time: 'night', rarity: 0.8 },
	yellowfin: { name: 'Yellowfin tuna', sci: 'Thunnus albacares', lw: [ 0.0158, 3.0 ], model: 'tuna', habitat: { deep: 1 }, kg: [ 15, 80 ], tier: 'epic', value: [ 180000, 500000 ], fight: 0.95, stamina: 24, time: 'dawnDusk', rarity: 0.8 },
	sailfish: { name: 'Atlantic sailfish', sci: 'Istiophorus albicans', lw: [ 0.0019, 3.08 ], model: 'needlefish', habitat: { deep: 1, bay: 0.2 }, kg: [ 15, 45 ], tier: 'epic', value: [ 220000, 560000 ], fight: 0.95, stamina: 22, time: 'day', rarity: 0.7 },
	goliath: { name: 'Goliath grouper', sci: 'Epinephelus itajara', lw: [ 0.0139, 3.04 ], model: 'grouper', habitat: { pier: 0.6, reef: 0.5, deep: 0.5 }, kg: [ 40, 150 ], tier: 'epic', value: [ 250000, 600000 ], fight: 0.9, stamina: 30, time: 'any', rarity: 0.6 },
	swordfish: { name: 'Swordfish', sci: 'Xiphias gladius', lw: [ 0.0039, 3.1 ], model: 'needlefish', habitat: { deep: 1 }, kg: [ 30, 120 ], tier: 'epic', value: [ 260000, 600000 ], fight: 1, stamina: 30, time: 'night', rarity: 0.6 },

	// ---- legendary ($60,000 - $80,000)
	tilefish: { name: 'Golden tilefish', sci: 'Lopholatilus chamaeleonticeps', lw: [ 0.0085, 3.1 ], model: 'redSnapper', habitat: { deep: 1 }, kg: [ 5, 25 ], tier: 'legendary', value: [ 600000, 700000 ], fight: 0.7, stamina: 18, time: 'any', rarity: 1 },
	bluefin: { name: 'Atlantic bluefin tuna', sci: 'Thunnus thynnus', lw: [ 0.0177, 3.0 ], model: 'tuna', habitat: { deep: 1 }, kg: [ 60, 180 ], tier: 'legendary', value: [ 640000, 800000 ], fight: 1, stamina: 34, time: 'dawnDusk', rarity: 0.9 },
	marlin: { name: 'Blue marlin', sci: 'Makaira nigricans', lw: [ 0.0012, 3.24 ], model: 'needlefish', habitat: { deep: 1 }, kg: [ 60, 200 ], tier: 'legendary', value: [ 660000, 800000 ], fight: 1, stamina: 36, time: 'day', rarity: 0.8 },
};

export const FISH_IDS = Object.keys( FISH );

// $ value of a fish: from the species' smallest to its biggest along its value band, rounded to $5
export function fishValue( id, kg ) {

	const f = FISH[ id ];
	const t = Math.min( 1, Math.max( 0, ( kg - f.kg[ 0 ] ) / Math.max( f.kg[ 1 ] - f.kg[ 0 ], 1e-6 ) ) );
	const v = f.value[ 0 ] + ( f.value[ 1 ] - f.value[ 0 ] ) * t;
	return Math.max( 5, Math.round( v / 5 ) * 5 );

}

// fish worth this much (rare and up) are strapped on deck when the hold is full (never thrown back for space)
export const TROPHY_VALUE = 25000;

// total length (cm) of a fish of `kg`, from its species' length-weight relation
export function fishLengthCm( id, kg ) {

	const [ a, b ] = FISH[ id ].lw;
	return Math.pow( Math.max( kg, 0.001 ) * 1000 / a, 1 / b );

}
