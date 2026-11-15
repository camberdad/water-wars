// Plain-node tests of the fishing game logic (no GPU): bites, the catch fight, inventory, save.
import { FISH, FISH_IDS, fishValue, fishLengthCm, TIERS, TIER_IDS, TROPHY_VALUE } from '../src/game/FishTable.js';
import { habitatAt, pickSpecies, rollWeight, biteDelay, tierChances } from '../src/game/Bites.js';
import { CatchMinigame } from '../src/game/CatchMinigame.js';
import { GameState } from '../src/game/GameState.js';
import { gearStats, defaultUpgrades, UPGRADES, FUEL_PRICE } from '../src/game/Gear.js';
import { BOATS } from '../src/game/BoatCatalog.js';
import { dangerZoneAt, DANGER_ZONES } from '../src/game/DangerZones.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
let seed = 12345;
const rng = () => ( ( seed = ( seed * 1664525 + 1013904223 ) >>> 0 ) / 4294967296 );

// ---- habitats and species
const spots = {
	sand: { depth: 0, reefDist: 200, pierDist: 200 },
	shallows: { depth: 1.5, reefDist: 200, pierDist: 80 },
	pier: { depth: 4, reefDist: 150, pierDist: 1 },
	reef: { depth: 5, reefDist: - 10, pierDist: 150 },
	deep: { depth: 40, reefDist: 300, pierDist: 400 },
};
for ( const [ name, s ] of Object.entries( spots ) ) {

	const h = habitatAt( s );
	const counts = {};
	for ( let i = 0; i < 2000; i ++ ) {

		const id = pickSpecies( h, 12, rng );
		if ( id ) counts[ id ] = ( counts[ id ] || 0 ) + 1;

	}

	const top = Object.entries( counts ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 5 ).map( ( [ k, v ] ) => `${ k } ${ ( v / 20 ).toFixed( 0 ) }%` ).join( ', ' );
	console.log( `     ${ name }: delay ~${ biteDelay( h, 12, () => 0.5 ).toFixed( 1 ) } s; ${ top || 'nothing' }` );

}
ok( pickSpecies( habitatAt( spots.sand ), 12, rng ) === null, 'nothing bites on dry sand' );
ok( biteDelay( habitatAt( spots.sand ), 12, rng ) === Infinity, 'no bite delay on sand' );
{

	let deepOnly = 0;
	for ( let i = 0; i < 500; i ++ ) if ( FISH[ pickSpecies( habitatAt( spots.deep ), 12, rng ) ].habitat.deep ) deepOnly ++;
	ok( deepOnly === 500, 'deep water gives offshore species only' );
	let reefFish = 0;
	for ( let i = 0; i < 500; i ++ ) if ( FISH[ pickSpecies( habitatAt( spots.reef ), 12, rng ) ].habitat.reef ) reefFish ++;
	ok( reefFish > 300, `the reef gives mostly reef fish (${ reefFish / 5 }%)` );

}
{

	let tarponNight = 0, tarponDay = 0;
	for ( let i = 0; i < 4000; i ++ ) {

		if ( pickSpecies( habitatAt( spots.pier ), 22, rng ) === 'tarpon' ) tarponNight ++;
		if ( pickSpecies( habitatAt( spots.pier ), 12, rng ) === 'tarpon' ) tarponDay ++;

	}

	ok( tarponNight > tarponDay * 2, `tarpon bite at night (${ tarponNight } vs ${ tarponDay } by day)` );

}
for ( const id of FISH_IDS ) {

	const w = rollWeight( id, rng );
	if ( w < FISH[ id ].kg[ 0 ] || w > FISH[ id ].kg[ 1 ] ) ok( false, `weight in range for ${ id }` );

}
ok( fishValue( 'redSnapper', 5 ) > fishValue( 'redSnapper', 2 ), 'bigger fish is worth more' );

// ---- the fight: three players
const policies = {
	careful: ( g ) => g.tension < 0.68 && g.surge < 0.6,
	mash: () => true,
	idle: () => false,
};
const fight = ( species, kg, policy, lineKg = 7, reelSpeed = 1.1 ) => {

	const g = new CatchMinigame( { species, kg, lineKg, reelSpeed, distance: 18, rng } );
	let st = 'fighting';
	for ( let i = 0; i < 60 * 180 && st === 'fighting'; i ++ ) st = g.update( 1 / 60, policy( g ) );
	return { st, t: g.time };

};
const table = {};
for ( const [ species, kg ] of [ [ 'grunt', 0.8 ], [ 'yellowtail', 1.2 ], [ 'jack', 6 ], [ 'redSnapper', 5 ], [ 'tuna', 6 ], [ 'tuna', 13 ], [ 'tarpon', 35 ] ] ) {

	for ( const p of Object.keys( policies ) ) {

		const r = fight( species, kg, policies[ p ] );
		table[ `${ species }/${ p }` ] = r;
		console.log( `     ${ species } ${ kg } kg, ${ p }: ${ r.st } after ${ r.t.toFixed( 1 ) } s` );

	}

}
ok( table[ 'grunt/careful' ].st === 'caught' && table[ 'yellowtail/careful' ].st === 'caught', 'careful reeling lands small fish' );
ok( table[ 'jack/careful' ].st === 'caught', 'careful reeling lands a 6 kg jack on the starter line' );
ok( table[ 'tuna/mash' ].st === 'snapped' && table[ 'tarpon/mash' ].st === 'snapped', 'holding reel on a big fish snaps the line' );
ok( table[ 'tuna/careful' ].st !== 'caught' && fight( 'tuna', 13, policies.careful, 26, 1.6 ).st === 'caught', 'a 13 kg tuna needs the 30 lb line' );
ok( [ 'escaped' ].includes( table[ 'grunt/idle' ].st ), 'never reeling loses the fish' );
ok( fight( 'tarpon', 35, policies.careful ).st !== 'caught', 'a 35 kg tarpon beats the starter line' );
ok( fight( 'tarpon', 35, policies.careful, 50, 2.2 ).st === 'caught', 'the top line and reel land it' );

// ---- inventory, wallet, save round trip
const mem = new Map();
const storage = { getItem: ( k ) => mem.get( k ) ?? null, setItem: ( k, v ) => mem.set( k, v ) };
const s = new GameState( storage );
ok( s.stats.holdKg === 30, 'cooler holds 30 kg' );
const a = s.addFish( 'grunt', 0.84, 9.5 );
const b = s.addFish( 'yellowtail', 1.31, 10 );
ok( a && b && s.inventory.length === 2, 'fish go into the cooler' );
const p1 = s.addFish( 'permit', 14 );
ok( p1 && s.addFish( 'permit', 14.5 ) === null && s.log.permit.count === 2, 'a cheap fish too big for the hold is logged but not kept' );
const tro = s.addFish( 'tarpon', 40, 22 );
ok( tro && s.lastCatch.onDeck && tro.value >= TROPHY_VALUE, 'a trophy that does not fit is strapped on deck' );
s.release( p1.id );
s.release( tro.id );
const value = s.holdValue;
const sale = s.sell( [ a.id ] );
ok( sale.count === 1 && s.money === a.value && s.inventory.length === 1, 'selling one fish pays for it' );
s.upgrades.hold = 1;
const s2 = new GameState( storage );
s.save();
ok( s2.load() && s2.money === s.money && s2.inventory.length === 1 && s2.log.grunt.bestKg === 0.84 && s2.stats.holdKg === 70, 'save / load round trip' );
ok( s2.addFish( 'grunt', 0.5 ).id > b.id, 'ids keep counting after a load' );
// ---- lengths and the catch card's record logic
{

	let sane = true;
	for ( const id of FISH_IDS ) {

		const f = FISH[ id ];
		const lo = fishLengthCm( id, f.kg[ 0 ] ), hi = fishLengthCm( id, f.kg[ 1 ] );
		const maxCm = f.tier === 'giant' ? 1700 : 450;
		if ( ! ( lo > 5 && hi < maxCm && hi > lo && typeof f.sci === 'string' ) ) sane = false;

	}

	ok( sane, 'every species has a scientific name and a plausible, increasing length (5–450 cm, giants to 17 m)' );
	ok( Math.abs( fishLengthCm( 'mahi', 10 ) - 108 ) < 3 && Math.abs( fishLengthCm( 'grunt', 0.84 ) - 36 ) < 2, 'length-weight: a 10 kg mahi ~108 cm, a 0.84 kg grunt ~36 cm' );
	const m = new Map();
	const st = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) } );
	const c1 = st.addFish( 'jack', 3.2 ), i1 = st.lastCatch;
	ok( c1 && i1.newSpecies && ! i1.record && c1.cm === i1.cm && i1.cm > 50, 'first of a species: new species, not a record, length stored' );
	st.addFish( 'jack', 2.1 );
	const i2 = st.lastCatch;
	ok( ! i2.newSpecies && ! i2.record && i2.prevBestKg === 3.2 && st.log.jack.bestKg === 3.2, 'a smaller one: no record, best unchanged' );
	st.addFish( 'jack', 4.05 );
	const i3 = st.lastCatch;
	ok( i3.record && i3.prevBestKg === 3.2 && i3.prevBestCm === i1.cm && st.log.jack.bestKg === 4.05 && st.log.jack.bestCm === i3.cm, 'a bigger one: new record, previous best reported, log updated' );
	st.addFish( 'permit', 14 );
	st.addFish( 'permit', 14.5 );
	ok( st.lastCatch.kept === false && ! st.lastCatch.newSpecies && st.log.permit.count === 2, 'a fish that does not fit: logged, card says released' );
	// a save from before lengths: inventory and log get lengths on load
	const old = { v: 1, money: 5, inventory: [ { id: 1, species: 'grunt', kg: 0.84, value: 6, caughtAt: 9 } ], log: { grunt: { count: 1, bestKg: 0.84 } }, upgrades: {}, fuel: null, nextId: 2 };
	const st2 = new GameState( { getItem: () => JSON.stringify( old ), setItem: () => {} } );
	ok( st2.load() && st2.inventory[ 0 ].cm === 36 && st2.log.grunt.bestCm === 36, 'old saves load with lengths filled in' );

}
ok( new GameState( { getItem: () => { throw new Error( 'blocked' ); }, setItem: () => { throw new Error( 'blocked' ); } } ).load() === false, 'blocked storage does not throw' );
ok( s.spend( 1e9 ) === false, 'cannot spend more than you have' );
ok( Object.keys( defaultUpgrades() ).length === Object.keys( UPGRADES ).length && gearStats( defaultUpgrades() ).finder === false, 'gear stats' );
{

	const m = new Map();
	const st = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) } );
	st.money = 100;
	ok( st.buy( 'reel' ) && st.upgrades.reel === 1 && st.money === 10 && st.stats.reelSpeed === 1.6, 'buying the reel upgrade' );
	ok( st.buy( 'reel' ) === null && st.upgrades.reel === 1, 'cannot buy what you cannot afford' );
	ok( st.fuelL === 40 && st.burn( 30 ) === 10 && st.refuelCost() === 30 * FUEL_PRICE, 'fuel burns and costs to refill' );
	st.money = 13 * FUEL_PRICE;
	ok( st.refuel() === 13 && st.money === 0 && Math.abs( st.fuelL - 23 ) < 1e-6, 'refuel stops when the money runs out' );
	ok( FUEL_PRICE >= 10, 'diesel is dear' );
	st.money = 1000;
	st.money = 1000;
	ok( st.buy( 'fuel' ) && st.fuelL === 80, 'a new tank comes full' );
	ok( st.buy( 'fishFinder' ) && st.stats.finder === true && st.buy( 'fishFinder' ) === null, 'fish finder: one level' );

}
// ---- Water Wars: hull, repairs, shells, armour, wanted level and the pirate record survive a save
{

	const m = new Map();
	const st = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) } );
	ok( st.hullHP === 100 && st.damage( 30 ) === 70 && st.repairCost() === 60, 'hull damage and repair cost' );
	st.money = 40;
	ok( st.repair() === 20 && st.money === 0 && st.hullHP === 90, 'repairs stop when the money runs out' );
	st.money = 1000;
	ok( st.buy( 'armor' ) && st.stats.hullHP === 160 && st.hullHP === 150, 'new armour adds its points to a damaged hull' );
	ok( st.stats.canRateMul === 1 && UPGRADES.locker.levels.every( ( l ) => l.canRateMul >= 1 ), 'the cannon loader speeds up the (unlimited) cannon' );
	st.heal( 1000 );
	ok( st.hull === null && st.hullHP === 160, 'healing past full clears the damage' );
	st.wanted = 3;
	st.pirate.piratesSunk = 2;
	st.save();
	const st2 = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: () => {} } );
	ok( st2.load() && st2.wanted === 3 && st2.pirate.piratesSunk === 2 && st2.upgrades.armor === 1, 'combat state round-trips through the save' );
	ok( Object.values( UPGRADES ).every( ( t ) => [ 'boat', 'weapons', 'fishing' ].includes( t.cat ) && t.levels[ 0 ].cost === 0 ), 'every upgrade track has a shop tab and a free first level' );

}
// ---- Water Wars: bought boats and the danger waters
{

	const m = new Map();
	const st = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) } );
	st.money = 1000;
	ok( st.buyBoat( 'trawler' ) === null && st.boat === 'lobster' && st.money === 1000, 'boats cost real money' );
	st.money = BOATS.trawler.price + 5;
	ok( st.buyBoat( 'trawler' ) && st.boat === 'trawler' && st.money === 5 && st.boats.includes( 'trawler' ), 'buying a boat puts it in use' );
	ok( st.stats.hullHP === Math.round( 100 * BOATS.trawler.hullMul ) && st.stats.holdKg === 30 + BOATS.trawler.holdKg, 'boat stats multiply the upgrades' );
	ok( st.buyBoat( 'trawler' ) === null, 'cannot buy a boat twice' );
	ok( st.useBoat( 'lobster' ) && st.boat === 'lobster' && st.useBoat( 'ship' ) === false, 'switch between owned boats only' );
	st.useBoat( 'trawler' );
	const st2 = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: () => {} } );
	ok( st2.load() && st2.boat === 'trawler' && st2.boats.length === 2, 'owned boats survive a save' );
	ok( Object.values( BOATS ).every( ( b ) => b.price === 0 || b.price >= 20000 ), 'new boats are big purchases' );
	ok( DANGER_ZONES.every( ( z ) => dangerZoneAt( z.x, z.z ) === z ) && dangerZoneAt( 55, 0 ) === null && dangerZoneAt( 64.5, 36.5 ) === null, 'danger zones: the harbour is safe' );

}
// ---- Water Wars: 30+ species, $75 - $80,000 by rarity
{

	ok( FISH_IDS.length >= 30, `at least 30 species (${ FISH_IDS.length })` );
	let inBand = true;
	for ( const id of FISH_IDS ) {

		const f = FISH[ id ], T = TIERS[ f.tier ];
		if ( ! T || f.value[ 0 ] < T.min || f.value[ 1 ] > T.max || f.value[ 0 ] >= f.value[ 1 ] ) inBand = false;

	}

	ok( inBand, 'every species sits in its tier\'s value band' );
	ok( fishValue( 'silverside', 0.02 ) === 225 && fishValue( 'marlin', 200 ) === 240000, 'values run from $225 to $240,000' );
	ok( TIER_IDS.every( ( t ) => FISH_IDS.some( ( id ) => FISH[ id ].tier === t ) ), 'every tier has fish' );
	let over60 = 0, rare = 0;
	const N = 20000, h = habitatAt( spots.pier );
	for ( let i = 0; i < N; i ++ ) {

		const id = pickSpecies( h, 12, rng );
		if ( fishValue( id, rollWeight( id, rng ) ) > 180000 ) over60 ++;
		if ( [ 'rare', 'epic', 'legendary' ].includes( FISH[ id ].tier ) ) rare ++;

	}

	ok( rare / N > 0.25 && rare / N < 0.45, `rare-or-better fish are common (${ ( rare / N * 100 ).toFixed( 1 ) }%)` );
	ok( over60 / N > 0.005 && over60 / N < 0.04, `fish over $180,000 turn up now and then (${ ( over60 / N * 100 ).toFixed( 2 ) }%)` );
	const d = tierChances( habitatAt( spots.deep ), { danger: true } ), c = tierChances( habitatAt( spots.pier ) );
	ok( d.legendary > c.legendary && d.legendary < 0.06, 'deep and danger water tilt the odds, within reason' );

}
// ---- Water Wars 1.4: more tiers and new upgrade tracks
{

	const longer = [ 'line', 'reel', 'rod', 'armor', 'engine', 'hold', 'fuel', 'pumps', 'gun', 'cooling', 'cannon', 'locker' ];
	ok( longer.every( ( k ) => UPGRADES[ k ].levels.length >= 6 ), 'every main track goes to at least 6 levels' );
	ok( [ 'bait', 'chum', 'targeting', 'salvage' ].every( ( k ) => UPGRADES[ k ] && UPGRADES[ k ].levels[ 0 ].cost === 0 ), 'new tracks: bait, chum, targeting, salvage' );
	ok( Object.values( UPGRADES ).every( ( t ) => t.levels.every( ( l, i ) => i === 0 || l.cost > t.levels[ i - 1 ].cost ) ), 'every track gets dearer level by level' );
	const base = tierChances( habitatAt( spots.deep ) ), lucky = tierChances( habitatAt( spots.deep ), { luck: 2 } );
	ok( lucky.legendary > base.legendary * 1.6 && lucky.rare > base.rare && lucky.common < base.common, 'better bait brings rarer fish' );
	const g = gearStats( { ...defaultUpgrades(), bait: 4, chum: 3, targeting: 3, salvage: 3 } );
	ok( g.luck === 2 && g.biteMul === 0.5 && g.aimMul === 0.3 && g.lootMul === 2, 'the new tracks feed the stats' );

}
// ---- Water Wars 1.5: giant fish
{

	const giants = FISH_IDS.filter( ( id ) => FISH[ id ].tier === 'giant' );
	ok( giants.length >= 4 && giants.every( ( id ) => FISH[ id ].value[ 0 ] >= 250000 && FISH[ id ].giantL ), 'four or more giant species worth $250,000+' );
	ok( giants.every( ( id ) => Math.abs( fishLengthCm( id, FISH[ id ].kg[ 1 ] ) / 100 - FISH[ id ].giantL[ 1 ] ) < 0.3 ), 'giant weights match their lengths' );
	let rodGiant = 0;
	for ( const spot of Object.values( spots ) ) for ( let i = 0; i < 3000; i ++ ) {

		const id = pickSpecies( habitatAt( spot ), 12, rng, { danger: true, luck: 2 } );
		if ( id && FISH[ id ].tier === 'giant' ) rodGiant ++;

	}

	ok( rodGiant === 0, 'giants never bite on a rod' );
	ok( UPGRADES.harpoon && UPGRADES.harpoon.levels.length >= 3 && ! gearStats( defaultUpgrades() ).harpoon && gearStats( { ...defaultUpgrades(), harpoon: 2 } ).harpRange > 50, 'the harpoon is an upgrade' );
	const m = new Map();
	const st = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) } );
	const big = st.addFish( 'leviathan', 20000 );
	ok( big && st.lastCatch.onDeck && st.sell().total === big.value && big.value >= 250000, 'a landed giant sells like any other fish' );

}
console.log( `value check ${ value }` );
console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
