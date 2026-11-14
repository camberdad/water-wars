// Gear and upgrade data for Water Wars. Everything the game reads goes through
// gearStats( state.upgrades ), so buying a level is just state.upgrades[ key ]++ and the stats follow.
//
// Each track: levels[ 0 ] is what you start with; cost is the price of that level (0 for the first).
// `cat` groups the tracks into the shop's tabs: 'fishing', 'boat', 'weapons'.
export const UPGRADES = {
	// ---------------------------------------------------------------- fishing
	line: { cat: 'fishing', name: 'Fishing line', levels: [
		{ cost: 0, label: '8 lb mono', lineKg: 7 },
		{ cost: 60, label: '15 lb mono', lineKg: 13 },
		{ cost: 180, label: '30 lb braid', lineKg: 26 },
		{ cost: 450, label: '60 lb braid', lineKg: 50 },
		{ cost: 1100, label: '130 lb big-game braid', lineKg: 110 },
	] },
	reel: { cat: 'fishing', name: 'Reel', levels: [
		{ cost: 0, label: 'Old spinning reel', reelSpeed: 1.1 },
		{ cost: 90, label: 'Smooth spinning reel', reelSpeed: 1.6 },
		{ cost: 320, label: 'Conventional reel', reelSpeed: 2.2 },
		{ cost: 900, label: 'Two-speed big-game reel', reelSpeed: 3.0 },
	] },
	rod: { cat: 'fishing', name: 'Rod', levels: [
		{ cost: 0, label: 'Hand-me-down rod', castM: 22 },
		{ cost: 75, label: '7 ft graphite rod', castM: 32 },
		{ cost: 260, label: '9 ft surf rod', castM: 45 },
		{ cost: 750, label: '12 ft carbon surf rod', castM: 60 },
	] },
	fishFinder: { cat: 'fishing', name: 'Fish finder', levels: [
		{ cost: 0, label: 'None', finder: false },
		{ cost: 250, label: 'Fish finder (depth and fish on the HUD)', finder: true },
	] },
	lights: { cat: 'fishing', name: 'Deck lights', levels: [
		{ cost: 0, label: 'Nav lights only', deckLights: false },
		{ cost: 140, label: 'Deck floodlights for night fishing', deckLights: true },
	] },

	// ---------------------------------------------------------------- boat
	armor: { cat: 'boat', name: 'Hull armour', levels: [
		{ cost: 0, label: 'Fibreglass hull', hullHP: 100 },
		{ cost: 200, label: 'Doubled planking', hullHP: 160 },
		{ cost: 650, label: 'Steel bow plates', hullHP: 250 },
		{ cost: 1600, label: 'Full steel cladding', hullHP: 400 },
		{ cost: 4000, label: 'Composite armour', hullHP: 650 },
	] },
	engine: { cat: 'boat', name: 'Engine', levels: [
		{ cost: 0, label: 'Tired diesel', speedMul: 1 },
		{ cost: 300, label: 'Rebuilt diesel', speedMul: 1.15 },
		{ cost: 700, label: 'Turbo diesel', speedMul: 1.3 },
		{ cost: 1800, label: 'Twin turbo diesel', speedMul: 1.5 },
		{ cost: 4200, label: 'Racing V8 inboard', speedMul: 1.75 },
	] },
	hold: { cat: 'boat', name: 'Fish hold', levels: [
		{ cost: 0, label: 'Cooler', holdKg: 30 },
		{ cost: 120, label: 'Ice chest', holdKg: 70 },
		{ cost: 400, label: 'Insulated fish hold', holdKg: 160 },
		{ cost: 1200, label: 'Refrigerated hold', holdKg: 320 },
	] },
	fuel: { cat: 'boat', name: 'Fuel tank', levels: [
		{ cost: 0, label: '40 L tank', fuelL: 40 },
		{ cost: 150, label: '80 L tank', fuelL: 80 },
		{ cost: 380, label: '150 L tank', fuelL: 150 },
		{ cost: 900, label: '300 L long-range tanks', fuelL: 300 },
	] },
	pumps: { cat: 'boat', name: 'Damage control', levels: [
		{ cost: 0, label: 'A bucket', repairHPs: 0 },
		{ cost: 350, label: 'Bilge pump and patch kit (slow self-repair)', repairHPs: 0.6 },
		{ cost: 1100, label: 'Damage-control crew (self-repair)', repairHPs: 1.6 },
		{ cost: 3000, label: 'Sealed compartments (fast self-repair)', repairHPs: 3.5 },
	] },

	// ---------------------------------------------------------------- weapons
	// the deck gun on the wheelhouse roof (left mouse at the helm); it never runs dry but it overheats
	gun: { cat: 'weapons', name: 'Deck gun', levels: [
		{ cost: 0, label: 'Rusty rifle', gunName: 'Rusty rifle', gunShort: 'RIFLE', gunDmg: 6, gunRate: 2.2, gunRange: 180, gunSpread: 0.012, gunHeat: 0.09, gunBarrels: 1 },
		{ cost: 250, label: 'Lever-action carbine', gunName: 'Lever-action carbine', gunShort: 'CARBINE', gunDmg: 9, gunRate: 3.2, gunRange: 220, gunSpread: 0.009, gunHeat: 0.075, gunBarrels: 1 },
		{ cost: 900, label: 'Deck machine gun', gunName: 'Deck machine gun', gunShort: 'MG', gunDmg: 6, gunRate: 9, gunRange: 240, gunSpread: 0.014, gunHeat: 0.03, gunBarrels: 1 },
		{ cost: 2400, label: 'Twin machine guns', gunName: 'Twin machine guns', gunShort: 'TWIN MG', gunDmg: 7, gunRate: 15, gunRange: 260, gunSpread: 0.014, gunHeat: 0.022, gunBarrels: 2 },
		{ cost: 6000, label: 'Rotary autocannon', gunName: 'Rotary autocannon', gunShort: 'ROTARY', gunDmg: 9, gunRate: 24, gunRange: 300, gunSpread: 0.011, gunHeat: 0.016, gunBarrels: 2 },
	] },
	cooling: { cat: 'weapons', name: 'Gun cooling', levels: [
		{ cost: 0, label: 'Air cooled', coolRate: 0.35 },
		{ cost: 300, label: 'Finned barrel', coolRate: 0.55 },
		{ cost: 900, label: 'Water jacket', coolRate: 0.85 },
		{ cost: 2200, label: 'Sea-water cooling loop', coolRate: 1.3 },
	] },
	cannon: { cat: 'weapons', name: 'Bow cannon', levels: [
		{ cost: 0, label: 'None', cannon: false, canDmg: 0, canRate: 0, canRange: 0, canSplash: 0 },
		{ cost: 600, label: 'Swivel gun', cannon: true, canDmg: 40, canRate: 0.55, canRange: 200, canSplash: 4 },
		{ cost: 1800, label: 'Deck cannon', cannon: true, canDmg: 75, canRate: 0.6, canRange: 260, canSplash: 6 },
		{ cost: 5000, label: 'Naval gun', cannon: true, canDmg: 130, canRate: 0.7, canRange: 320, canSplash: 9 },
	] },
	// the cannon never runs out of shells once it is fitted: this track speeds up the reload
	// (key kept as 'locker' so old saves keep their level)
	locker: { cat: 'weapons', name: 'Cannon loader', levels: [
		{ cost: 0, label: 'Hand loading', canRateMul: 1 },
		{ cost: 200, label: 'Ammo hoist', canRateMul: 1.3 },
		{ cost: 600, label: 'Autoloader', canRateMul: 1.7 },
		{ cost: 1500, label: 'Belt-fed autoloader', canRateMul: 2.3 },
	] },
};

export const CATEGORIES = [
	{ id: 'boat', name: 'Boat' },
	{ id: 'weapons', name: 'Weapons' },
	{ id: 'fishing', name: 'Fishing' },
];

export const FUEL_PRICE = 1.5; // $ per litre of diesel at the chandlery
export const REPAIR_PRICE = 2; // $ per hull point
// litres per second at the helm: idle plus a lot more at full rpm (40 L lasts ~25 min flat out)
export function fuelBurn( rpm ) {

	return 0.0025 + 0.024 * rpm * rpm;

}

// next level of a track, or null when maxed
export function nextLevel( upgrades, key ) {

	const lv = UPGRADES[ key ].levels;
	const i = ( upgrades[ key ] | 0 ) + 1;
	return i < lv.length ? { index: i, ...lv[ i ] } : null;

}

export function defaultUpgrades() {

	const u = {};
	for ( const k in UPGRADES ) u[ k ] = 0;
	return u;

}

// merged stats of the current levels
export function gearStats( upgrades ) {

	const s = {};
	for ( const k in UPGRADES ) {

		const lv = UPGRADES[ k ].levels;
		const i = Math.max( 0, Math.min( lv.length - 1, upgrades[ k ] | 0 ) );
		for ( const [ key, v ] of Object.entries( lv[ i ] ) ) if ( key !== 'cost' && key !== 'label' ) s[ key ] = v;

	}

	return s;

}
