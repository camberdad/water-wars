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
		{ cost: 15000, label: '200 lb Dyneema', lineKg: 180 },
		{ cost: 60000, label: '400 lb titanium leader line', lineKg: 300 },
	] },
	reel: { cat: 'fishing', name: 'Reel', levels: [
		{ cost: 0, label: 'Old spinning reel', reelSpeed: 1.1 },
		{ cost: 90, label: 'Smooth spinning reel', reelSpeed: 1.6 },
		{ cost: 320, label: 'Conventional reel', reelSpeed: 2.2 },
		{ cost: 900, label: 'Two-speed big-game reel', reelSpeed: 3.0 },
		{ cost: 12000, label: 'Electric big-game reel', reelSpeed: 4.0 },
		{ cost: 45000, label: 'Hydraulic winch reel', reelSpeed: 5.5 },
	] },
	rod: { cat: 'fishing', name: 'Rod', levels: [
		{ cost: 0, label: 'Hand-me-down rod', castM: 22 },
		{ cost: 75, label: '7 ft graphite rod', castM: 32 },
		{ cost: 260, label: '9 ft surf rod', castM: 45 },
		{ cost: 750, label: '12 ft carbon surf rod', castM: 60 },
		{ cost: 9000, label: 'Tournament carbon rod', castM: 75 },
		{ cost: 30000, label: 'Pro offshore rod', castM: 95 },
	] },
	fishFinder: { cat: 'fishing', name: 'Fish finder', levels: [
		{ cost: 0, label: 'None', finder: false },
		{ cost: 250, label: 'Fish finder (depth and fish on the HUD)', finder: true },
	] },
	lights: { cat: 'fishing', name: 'Deck lights', levels: [
		{ cost: 0, label: 'Nav lights only', deckLights: false },
		{ cost: 140, label: 'Deck floodlights for night fishing', deckLights: true },
	] },
	// better bait brings the rare fish: scales the chance of rare / epic / legendary bites
	bait: { cat: 'fishing', name: 'Bait & lures', levels: [
		{ cost: 0, label: 'Bread and worms', luck: 1 },
		{ cost: 5000, label: 'Live shrimp', luck: 1.15 },
		{ cost: 20000, label: 'Live ballyhoo', luck: 1.35 },
		{ cost: 60000, label: 'Custom trolling lures', luck: 1.6 },
		{ cost: 150000, label: 'Legendary lure spread', luck: 2 },
	] },
	// chum in the water: fish bite sooner
	chum: { cat: 'fishing', name: 'Chum', levels: [
		{ cost: 0, label: 'None', biteMul: 1 },
		{ cost: 3000, label: 'Chum bucket', biteMul: 0.8 },
		{ cost: 12000, label: 'Chum slick', biteMul: 0.65 },
		{ cost: 40000, label: 'Automatic chum dispenser', biteMul: 0.5 },
	] },

	// ---------------------------------------------------------------- boat
	armor: { cat: 'boat', name: 'Hull armour', levels: [
		{ cost: 0, label: 'Fibreglass hull', hullHP: 100 },
		{ cost: 200, label: 'Doubled planking', hullHP: 160 },
		{ cost: 650, label: 'Steel bow plates', hullHP: 250 },
		{ cost: 1600, label: 'Full steel cladding', hullHP: 400 },
		{ cost: 4000, label: 'Composite armour', hullHP: 650 },
		{ cost: 25000, label: 'Reactive armour', hullHP: 1000 },
		{ cost: 90000, label: 'Battleship plating', hullHP: 1600 },
	] },
	engine: { cat: 'boat', name: 'Engine', levels: [
		{ cost: 0, label: 'Tired diesel', speedMul: 1 },
		{ cost: 300, label: 'Rebuilt diesel', speedMul: 1.15 },
		{ cost: 700, label: 'Turbo diesel', speedMul: 1.3 },
		{ cost: 1800, label: 'Twin turbo diesel', speedMul: 1.5 },
		{ cost: 4200, label: 'Racing V8 inboard', speedMul: 1.75 },
		{ cost: 20000, label: 'Gas turbine', speedMul: 2.0 },
		{ cost: 75000, label: 'Hydrofoil jet drive', speedMul: 2.25 },
	] },
	hold: { cat: 'boat', name: 'Fish hold', levels: [
		{ cost: 0, label: 'Cooler', holdKg: 30 },
		{ cost: 120, label: 'Ice chest', holdKg: 70 },
		{ cost: 400, label: 'Insulated fish hold', holdKg: 160 },
		{ cost: 1200, label: 'Refrigerated hold', holdKg: 320 },
		{ cost: 15000, label: 'Blast-freezer hold', holdKg: 600 },
		{ cost: 50000, label: 'Factory-ship hold', holdKg: 1200 },
	] },
	fuel: { cat: 'boat', name: 'Fuel tank', levels: [
		{ cost: 0, label: '10.6 gal tank', fuelL: 40 },
		{ cost: 150, label: '21 gal tank', fuelL: 80 },
		{ cost: 380, label: '40 gal tank', fuelL: 150 },
		{ cost: 900, label: '79 gal long-range tanks', fuelL: 300 },
		{ cost: 8000, label: '159 gal expedition tanks', fuelL: 600 },
		{ cost: 25000, label: '317 gal ocean-crossing tanks', fuelL: 1200 },
	] },
	pumps: { cat: 'boat', name: 'Damage control', levels: [
		{ cost: 0, label: 'A bucket', repairHPs: 0 },
		{ cost: 350, label: 'Bilge pump and patch kit (slow self-repair)', repairHPs: 0.6 },
		{ cost: 1100, label: 'Damage-control crew (self-repair)', repairHPs: 1.6 },
		{ cost: 3000, label: 'Sealed compartments (fast self-repair)', repairHPs: 3.5 },
		{ cost: 20000, label: 'Repair drones (rapid self-repair)', repairHPs: 7 },
		{ cost: 70000, label: 'Self-sealing nano hull', repairHPs: 14 },
	] },
	// a bigger crew and a crane over the side: more cash off every wreck you plunder
	salvage: { cat: 'boat', name: 'Salvage gear', levels: [
		{ cost: 0, label: 'Boat hook', lootMul: 1 },
		{ cost: 4000, label: 'Boarding ladder and crowbars', lootMul: 1.25 },
		{ cost: 15000, label: 'Salvage crane', lootMul: 1.5 },
		{ cost: 50000, label: 'Professional salvage crew', lootMul: 2 },
	] },

	// ---------------------------------------------------------------- weapons
	// the deck gun on the wheelhouse roof (left mouse at the helm); it never runs dry but it overheats
	gun: { cat: 'weapons', name: 'Deck gun', levels: [
		{ cost: 0, label: 'Rusty rifle', gunName: 'Rusty rifle', gunShort: 'RIFLE', gunDmg: 6, gunRate: 2.2, gunRange: 180, gunSpread: 0.012, gunHeat: 0.09, gunBarrels: 1 },
		{ cost: 250, label: 'Lever-action carbine', gunName: 'Lever-action carbine', gunShort: 'CARBINE', gunDmg: 9, gunRate: 3.2, gunRange: 220, gunSpread: 0.009, gunHeat: 0.075, gunBarrels: 1 },
		{ cost: 900, label: 'Deck machine gun', gunName: 'Deck machine gun', gunShort: 'MG', gunDmg: 6, gunRate: 9, gunRange: 240, gunSpread: 0.014, gunHeat: 0.03, gunBarrels: 1 },
		{ cost: 2400, label: 'Twin machine guns', gunName: 'Twin machine guns', gunShort: 'TWIN MG', gunDmg: 7, gunRate: 15, gunRange: 260, gunSpread: 0.014, gunHeat: 0.022, gunBarrels: 2 },
		{ cost: 6000, label: 'Rotary autocannon', gunName: 'Rotary autocannon', gunShort: 'ROTARY', gunDmg: 9, gunRate: 24, gunRange: 300, gunSpread: 0.011, gunHeat: 0.016, gunBarrels: 2 },
		{ cost: 25000, label: 'Twin 20 mm autocannon', gunName: 'Twin 20 mm autocannon', gunShort: '20MM', gunDmg: 16, gunRate: 20, gunRange: 340, gunSpread: 0.01, gunHeat: 0.015, gunBarrels: 2 },
		{ cost: 90000, label: 'Twin 30 mm naval autocannon', gunName: 'Twin 30 mm naval autocannon', gunShort: '30MM', gunDmg: 26, gunRate: 18, gunRange: 380, gunSpread: 0.009, gunHeat: 0.014, gunBarrels: 2 },
	] },
	cooling: { cat: 'weapons', name: 'Gun cooling', levels: [
		{ cost: 0, label: 'Air cooled', coolRate: 0.35 },
		{ cost: 300, label: 'Finned barrel', coolRate: 0.55 },
		{ cost: 900, label: 'Water jacket', coolRate: 0.85 },
		{ cost: 2200, label: 'Sea-water cooling loop', coolRate: 1.3 },
		{ cost: 10000, label: 'Liquid-nitrogen cooling', coolRate: 2.0 },
		{ cost: 35000, label: 'Cryogenic barrel jacket', coolRate: 3.2 },
	] },
	// sights and a fire-control computer: tighter groups at range
	targeting: { cat: 'weapons', name: 'Targeting', levels: [
		{ cost: 0, label: 'Iron sights', aimMul: 1 },
		{ cost: 2500, label: 'Telescopic sight', aimMul: 0.75 },
		{ cost: 10000, label: 'Gyro-stabilised mount', aimMul: 0.5 },
		{ cost: 35000, label: 'Fire-control computer', aimMul: 0.3 },
	] },
	cannon: { cat: 'weapons', name: 'Bow cannon', levels: [
		{ cost: 0, label: 'None', cannon: false, canDmg: 0, canRate: 0, canRange: 0, canSplash: 0 },
		{ cost: 600, label: 'Swivel gun', cannon: true, canDmg: 40, canRate: 0.55, canRange: 200, canSplash: 4 },
		{ cost: 1800, label: 'Deck cannon', cannon: true, canDmg: 75, canRate: 0.6, canRange: 260, canSplash: 6 },
		{ cost: 5000, label: 'Naval gun', cannon: true, canDmg: 130, canRate: 0.7, canRange: 320, canSplash: 9 },
		{ cost: 20000, label: 'Heavy naval gun', cannon: true, canDmg: 200, canRate: 0.8, canRange: 380, canSplash: 11 },
		{ cost: 80000, label: 'Rail cannon', cannon: true, canDmg: 320, canRate: 0.9, canRange: 450, canSplash: 14 },
	] },
	// a harpoon gun on the stern (Q at the helm): for the giant fish that surface out at sea. Hit one
	// and it is tethered to the boat: let it tire, then tow it into a harbour to sell
	harpoon: { cat: 'weapons', name: 'Harpoon', levels: [
		{ cost: 0, label: 'None', harpoon: false, harpRange: 0, harpPower: 0 },
		{ cost: 15000, label: 'Hand harpoon', harpoon: true, harpRange: 45, harpPower: 1 },
		{ cost: 60000, label: 'Harpoon gun', harpoon: true, harpRange: 75, harpPower: 1.7 },
		{ cost: 180000, label: 'Explosive harpoon', harpoon: true, harpRange: 110, harpPower: 3 },
	] },
	// the cannon never runs out of shells once it is fitted: this track speeds up the reload
	// (key kept as 'locker' so old saves keep their level)
	locker: { cat: 'weapons', name: 'Cannon loader', levels: [
		{ cost: 0, label: 'Hand loading', canRateMul: 1 },
		{ cost: 200, label: 'Ammo hoist', canRateMul: 1.3 },
		{ cost: 600, label: 'Autoloader', canRateMul: 1.7 },
		{ cost: 1500, label: 'Belt-fed autoloader', canRateMul: 2.3 },
		{ cost: 8000, label: 'Rapid autoloader', canRateMul: 3.0 },
		{ cost: 30000, label: 'Quad-feed autoloader', canRateMul: 4.0 },
	] },
};

export const CATEGORIES = [
	{ id: 'boat', name: 'Boat' },
	{ id: 'weapons', name: 'Weapons' },
	{ id: 'fishing', name: 'Fishing' },
];

export const FUEL_PRICE = 20; // $ per litre of diesel (Water Wars 1.6: was $1.50)
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
