// Plain-node tests of the fishing game logic (no GPU): bites, the catch fight, inventory, save.
import { FISH, FISH_IDS, fishValue, fishLengthCm, TIERS, TIER_IDS, TROPHY_VALUE, cutPrice } from '../src/game/FishTable.js';
import { habitatAt, pickSpecies, rollWeight, biteDelay, tierChances, TIER_ODDS } from '../src/game/Bites.js';
import { CatchMinigame } from '../src/game/CatchMinigame.js';
import { GameState } from '../src/game/GameState.js';
import { gearStats, defaultUpgrades, UPGRADES, FUEL_PRICE, fuelBurn, isBoatTrack } from '../src/game/Gear.js';
import { BOATS, berthX } from '../src/game/BoatCatalog.js';
import { rollNetItem, PROTECTED, TRAWL_IDS, protectedLeft, followRope } from '../src/game/Trawl.js';
import { dangerZoneAt, DANGER_ZONES } from '../src/game/DangerZones.js';
import { hullOutline, placeOutline, hullContact } from '../src/game/combat/HullContact.js';
import { weatherAt, spellKind, WEATHER, WEATHER_KEYS, SPELL_S } from '../src/game/Weather.js';
import { Leaderboard, sanitize, oneRunPerPlayer, snapshotOf, LEADERBOARD_CONFIG } from '../src/game/HighScores.js';

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

	// (the trawl-only species draw from their own stream: the seeded one stays as the fight tests expect)
	const w = rollWeight( id, FISH[ id ].trawl ? Math.random : rng );
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
	ok( BOATS.workboat && BOATS.oldboat && BOATS.wavecutter && BOATS.superyacht && Object.keys( BOATS ).length === 8, 'eight boats: the workboat and the old launch (1.9), the WaveCutter (1.10), the superyacht (1.13)' );
	ok( BOATS.superyacht.price === 2500000 && BOATS.superyacht.sealed && BOATS.superyacht.length === 40 && Object.values( BOATS ).every( ( b ) => b.price <= BOATS.superyacht.price ), 'the superyacht: $2,500,000, 40 m, the dearest boat, its model sealed' );
	ok( BOATS.wavecutter.price === 800000 && Object.values( BOATS ).every( ( b ) => b.speedMul <= BOATS.wavecutter.speedMul ), 'the WaveCutter costs $800,000 and is the fastest boat' );
	ok( [ 'workboat', 'oldboat' ].every( ( id ) => BOATS[ id ].model === id && BOATS[ id ].length > 8 && BOATS[ id ].hitHalf ), 'the new boats are fitted models' );
	ok( dangerZoneAt( 55, 0 ) === null && dangerZoneAt( 64.5, 36.5 ) === null && dangerZoneAt( 40, 20 ) === null, 'danger zones: the harbour is safe' );
	ok( DANGER_ZONES.length === 3 && DANGER_ZONES.every( ( t ) => dangerZoneAt( 40 + ( t.r0 + t.r1 ) / 2, 20 ) === t ), 'three danger tiers, outward from the harbour' );
	ok( dangerZoneAt( 40, 20 + 500 ).tier === 1 && dangerZoneAt( 40, 20 + 1000 ).tier === 2 && dangerZoneAt( 40, 20 + 2000 ).tier === 3, 'the tiers get harder further out' );
	ok( DANGER_ZONES[ 0 ].fishMul < DANGER_ZONES[ 2 ].fishMul && DANGER_ZONES[ 0 ].loot < DANGER_ZONES[ 2 ].loot && DANGER_ZONES[ 0 ].aggro < DANGER_ZONES[ 2 ].aggro, 'harder tiers pay better and bite sooner' );

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
	ok( fishValue( 'silverside', 0.02 ) === 225 && fishValue( 'marlin', 200 ) === 144000, 'values run from $225 to $144,000 (1.7.1: 40% off over $1,000)' );
	ok( cutPrice( 800 ) === 800 && cutPrice( 1000 ) === 1000 && cutPrice( 1200 ) === 1000 && cutPrice( 10000 ) === 6000 && cutPrice( 240000 ) === 144000, 'fish over $1,000 sell for 40% less, never under $1,000' );
	ok( TROPHY_VALUE === TIERS.rare.min, 'the trophy line follows the rare band' );
	ok( TIER_IDS.every( ( t ) => FISH_IDS.some( ( id ) => FISH[ id ].tier === t ) ), 'every tier has fish' );
	let over60 = 0, rare = 0;
	const N = 20000, h = habitatAt( spots.pier );
	for ( let i = 0; i < N; i ++ ) {

		const id = pickSpecies( h, 12, rng );
		if ( fishValue( id, rollWeight( id, rng ) ) > TIERS.legendary.min ) over60 ++;
		if ( [ 'rare', 'epic', 'legendary' ].includes( FISH[ id ].tier ) ) rare ++;

	}

	ok( rare / N > 0.18 && rare / N < 0.33, `rare-or-better fish: about a quarter of bites, not a third (${ ( rare / N * 100 ).toFixed( 1 ) }%)` );
	ok( over60 / N > 0.005 && over60 / N < 0.04, `legendary-priced fish turn up now and then (${ ( over60 / N * 100 ).toFixed( 2 ) }%)` );
	const d = tierChances( habitatAt( spots.deep ), { danger: true } ), c = tierChances( habitatAt( spots.pier ) );
	ok( d.legendary > c.legendary && d.legendary < 0.06, 'deep and danger water tilt the odds, within reason' );
	// 1.7.1: the danger tier sets the odds of the valuable fish, the harbour lowest and the Deadwater highest
	const byTier = [ 0, 1, 2, 3 ].map( ( t ) => tierChances( habitatAt( spots.deep ), { tier: t } ) );
	ok( byTier.every( ( c, i ) => i === 0 || ( c.rare > byTier[ i - 1 ].rare && c.epic > byTier[ i - 1 ].epic && c.legendary > byTier[ i - 1 ].legendary ) ), 'rare, epic and legendary fish get likelier tier by tier' );
	ok( byTier[ 3 ].legendary > byTier[ 1 ].legendary * 2 && byTier[ 3 ].legendary < 0.08 && byTier[ 0 ].legendary < c.legendary, 'the Deadwater brings far more legendaries than coastal waters, within reason' );
	ok( TIER_ODDS.length === 4, 'odds for the harbour and the three tiers' );

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
	ok( giants.length >= 4 && giants.every( ( id ) => FISH[ id ].value[ 0 ] >= 150000 && FISH[ id ].giantL ), 'four or more giant species worth $150,000+' );
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
	ok( big && st.lastCatch.onDeck && st.sell().total === big.value && big.value >= 150000, 'a landed giant sells like any other fish' );

}
// ---- Water Wars 1.13: the licensed superyacht ships only sealed, and the game can open it
{

	const fsm = await import( 'node:fs' );
	const { openSealedModel } = await import( '../src/game/ModelKey.js' );
	const dir = new URL( '../public/models/boats/', import.meta.url );
	ok( ! fsm.existsSync( new URL( 'superyacht.bin', dir ) ) && ! fsm.existsSync( new URL( 'superyacht.json', dir ) ), 'no plain copy of the superyacht is published' );
	const sealed = fsm.readFileSync( new URL( 'superyacht.dat', dir ) );
	const { meta, bin } = await openSealedModel( sealed.buffer.slice( sealed.byteOffset, sealed.byteOffset + sealed.byteLength ) );
	ok( meta.vertexCount > 1000 && bin.byteLength === meta.vertexCount * 20 + meta.indexCount * 4, 'the sealed superyacht opens with the game key (' + meta.vertexCount + ' vertices)' );

}
// ---- Water Wars 1.12.1: a bought boat's water mask follows its real waterline
{

	const { BoxGeometry } = await import( '../src/engine/index.js' );
	const { hullVolumeFor } = await import( '../src/game/Boats.js' );
	const hull = new BoxGeometry( 2, 2, 6 ); // a 2 m wide, 6 m long box hull, half under the water
	const vol = hullVolumeFor( hull );
	const p = vol.attributes.position.array;
	let w = 0;
	for ( let i = 0; i < p.length; i += 3 ) w = Math.max( w, Math.abs( p[ i ] ) );
	ok( w > 0.9 && w < 1.0, 'the water mask sits just inside the hull at the waterline (' + w.toFixed( 2 ) + ' m of 1 m)' );

}
// ---- Water Wars 1.12: eight more fish, six of them cheap commons; the odds lean common
{

	const added = [ 'sardine', 'damselfish', 'tomtate', 'ballyhoo', 'sandPerch', 'chub', 'grayTrigger', 'rainbowRunner' ];
	ok( added.every( ( id ) => FISH[ id ] ) && FISH_IDS.filter( ( id ) => ! FISH[ id ].trawl ).length === 52, 'eight new species (52 on the rod in all)' );
	const cheap = added.filter( ( id ) => FISH[ id ].tier === 'common' );
	ok( cheap.length === 6 && cheap.every( ( id ) => FISH[ id ].value[ 1 ] <= 210 && FISH[ id ].value[ 1 ] < FISH.silverside.value[ 0 ] ), 'six of them are common, cheaper than any common fish before' );
	ok( TIERS.common.chance === 0.46 && TIERS.rare.chance < 0.2 && Math.abs( TIER_IDS.reduce( ( a, t ) => a + TIERS[ t ].chance, 0 ) - 1 ) < 1e-9, 'common bites are likelier, rare ones less so (the odds still add up)' );
	ok( fishValue( 'sardine', 0.03 ) === 60, 'the cheapest catch is $60' );

}
// ---- Water Wars 1.12: the dock is solid to boats, not to swimmers
{

	const { Colliders } = await import( '../src/world/Colliders.js' );
	const { Vector3 } = await import( '../src/engine/index.js' );
	const col = new Colliders();
	col.addBox( new Vector3( 0, 0, 0 ), new Vector3( 1, 2, 5 ), 0, { boatOnly: true } );
	const boat = new Vector3( 1.1, - 0.9, 0 ), swimmer = new Vector3( 1.1, - 0.9, 0 );
	ok( col.resolveCapsule( boat, 0.25, 1.6, 0, true ) && boat.x >= 1.25 - 1e-9, 'a boat\'s hull is pushed off the fender line' );
	ok( ! col.resolveCapsule( swimmer, 0.25, 1.6, 0 ) && swimmer.x === 1.1, 'a swimmer passes under the dock' );
	const { densify, hullOutline } = await import( '../src/game/combat/HullContact.js' );
	const pts = densify( hullOutline( 2.3, 6.5 ), 0.7 );
	let gap = 0;
	for ( let i = 0; i < pts.length; i ++ ) gap = Math.max( gap, Math.hypot( pts[ i ][ 0 ] - pts[ ( i + 1 ) % pts.length ][ 0 ], pts[ i ][ 1 ] - pts[ ( i + 1 ) % pts.length ][ 1 ] ) );
	ok( gap <= 0.7 + 1e-9 && pts.length > 30, 'a big hull is checked at points no more than 0.7 m apart' );

}
// ---- Water Wars 1.11: each boat has its own engine, armour, weapons and fittings
{

	const m = new Map();
	const st = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) } );
	st.money = 10000000;
	st.buy( 'engine' ); st.buy( 'engine' ); st.buy( 'gun' ); st.buy( 'reel' ); st.buy( 'fishFinder' );
	const lobster = { engine: st.upgrades.engine, gun: st.upgrades.gun, finder: st.stats.finder };
	st.buyBoat( 'trawler' );
	ok( st.upgrades.engine === 0 && st.upgrades.gun === 0 && ! st.stats.finder, 'a new boat starts with the basic engine, gun and fittings' );
	ok( st.upgrades.reel === 1, 'your tackle comes with you onto the new boat' );
	st.buy( 'armor' );
	ok( st.upgrades.armor === 1 && st.boatGear.trawler.armor === 1, 'an upgrade bought now is fitted to the trawler' );
	st.useBoat( 'lobster' );
	ok( st.upgrades.engine === lobster.engine && st.upgrades.gun === lobster.gun && st.stats.finder === lobster.finder && st.upgrades.armor === 0, 'back on the lobster boat: its own engine and gun, not the trawler\'s armour' );
	st.useBoat( 'trawler' );
	ok( st.upgrades.armor === 1 && st.upgrades.engine === 0, 'and the trawler keeps its own' );
	ok( st.levelsFor( 'lobster' ).engine === lobster.engine && st.levelsFor( 'ship' ).engine === 0, 'the Boats tab can show each boat with its own gear' );
	const st2 = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: () => {} } );
	ok( st2.load() && st2.boat === 'trawler' && st2.upgrades.armor === 1 && st2.boatGear.lobster.engine === lobster.engine, 'each boat\'s gear survives a save' );

	// a save from before 1.11 (one set of upgrades for every boat): each boat you own keeps it
	const old = new Map( [ [ 'waterwars.save.v1', JSON.stringify( { v: 1, money: 5, upgrades: { ...defaultUpgrades(), engine: 3, gun: 2, reel: 2 }, boat: 'trawler', boats: [ 'lobster', 'trawler' ] } ) ] ] );
	const st3 = new GameState( { getItem: ( k ) => old.get( k ) ?? null, setItem: () => {} } );
	ok( st3.load() && st3.upgrades.engine === 3 && st3.boatGear.lobster.engine === 3 && st3.boatGear.trawler.gun === 2 && st3.upgrades.reel === 2, 'an old save: every boat you own keeps the upgrades you had' );

}
// ---- Water Wars 1.8.3: fuel burns a little faster, in proportion to engine power
{

	ok( fuelBurn( 1 ) > 0.0265 * 1.15 && fuelBurn( 0.15 ) > 0.003, 'diesel burns about 20% faster than before' );
	ok( Math.abs( fuelBurn( 1, 2 ) - 2 * fuelBurn( 1 ) ) < 1e-12, 'twice the engine power burns twice the fuel' );
	ok( 40 / fuelBurn( 1 ) / 60 > 18 && 40 / fuelBurn( 1 ) / 60 < 23, 'the starting tank lasts about 20 minutes flat out' );

}
// ---- Water Wars 1.8.2: boats touch only where their hulls do
{

	const hull = hullOutline( 1.55, 4.15 ); // the lobster boat: 3.1 m beam, 8.3 m long
	const at = ( x, z, yaw ) => placeOutline( hull, x, z, yaw, [] );
	ok( hullContact( at( 0, 0, 0 ), at( 3.6, 0, 0 ) ) === null, 'side by side half a metre apart: no contact' );
	const side = hullContact( at( 0, 0, 0 ), at( 2.9, 0, 0 ) );
	ok( side && side.nx < - 0.95 && side.depth > 0.1 && side.depth <= 0.2 + 1e-6, 'overlapping beams touch, pushed apart sideways by the overlap' );
	ok( hullContact( at( 0, 0, 0 ), at( 0, 8.5, Math.PI ) ) === null && hullContact( at( 0, 0, 0 ), at( 0, 8.1, Math.PI ) ) !== null, 'bow to bow: contact only when the stems meet' );
	ok( hullContact( at( 0, 0, 0 ), at( 3.0, 7.9, 0 ) ) === null, 'a boat off the bow quarter, inside the old box, but clear of the tapered bow' );
	ok( hullContact( at( 0, 0, 0 ), at( 6.5, 0, 0 ) ) === null, 'what the old 7 m circle called a collision is open water' );

}
// ---- Water Wars 1.8: stern rod holders
{

	const t = UPGRADES.rodHolders;
	ok( t && t.cat === 'fishing' && t.levels.length === 4 && t.levels.every( ( l, i ) => l.sternRods === i ), 'the rod holder track: none, then 1, 2 and 3 stern rods' );
	ok( gearStats( defaultUpgrades() ).sternRods === 0 && gearStats( { ...defaultUpgrades(), rodHolders: 2 } ).sternRods === 2, 'stern rods come from the upgrade' );
	const m = new Map();
	const st = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) } );
	st.money = 5000;
	ok( st.buy( 'rodHolders' ) === null, 'the rod holder costs real money' );
	st.money = t.levels[ 1 ].cost;
	ok( st.buy( 'rodHolders' ) && st.stats.sternRods === 1 && st.money === 0, 'buying the holder gives a stern rod' );

}
// ---- Water Wars 1.7: lifetime earnings and the shared high-score board (a fake jsonbin)
{

	const m = new Map();
	const st = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) } );
	st.addFish( 'leviathan', 20000 );
	const sold = st.sell().total;
	st.earn( 500 );
	st.spend( 300 );
	ok( st.earned === sold + 500 && st.money === sold + 200, 'lifetime earnings count income, not spending' );
	st.furthest = 2;
	st.save();
	const st2 = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: () => {} } );
	ok( st2.load() && st2.earned === st.earned && st2.furthest === 2, 'earnings and the furthest tier survive a save' );
	const snap = snapshotOf( st );
	ok( snap.score === st.earned && snap.giants === 1 && snap.fish === 1 && snap.furthest === 2, 'the high-score row reads the save' );

	const clean = sanitize( { name: '   a very very long captain name   ', score: 1e15, fish: - 5, furthest: 9, active: true, t: Date.now() - 60000 } );
	ok( clean.name.length <= 18 && clean.score === LEADERBOARD_CONFIG.MAX_MONEY && clean.fish === 0 && clean.furthest === 3 && clean.active === false, 'rows are sanitised; stale rows are not active' );
	const merged = oneRunPerPlayer( [ sanitize( { name: 'Ahab', score: 100, fish: 9, t: 1 } ), sanitize( { name: 'ahab', score: 50, fish: 20, t: 2, active: true } ), sanitize( { name: 'Ishmael', score: 70 } ) ] );
	ok( merged.length === 2 && merged[ 0 ].name === 'Ahab' && merged[ 0 ].score === 100 && merged[ 0 ].fish === 20, 'one row per captain with their best stats' );

	// a fake jsonbin.io: GET returns the record, PUT stores it
	let bin = { scores: [ { name: 'Ishmael', score: 70, t: Date.now() } ] }, puts = 0;
	const fakeFetch = async ( url, opt = {} ) => {

		if ( opt.method === 'PUT' ) {

			puts ++;
			bin = JSON.parse( opt.body );
			return { ok: true, json: async () => ( {} ) };

		}

		return { ok: true, json: async () => JSON.parse( JSON.stringify( bin ) ) };

	};
	const store = new Map();
	const lb = new Leaderboard( { fetch: fakeFetch, storage: { getItem: ( k ) => store.get( k ) ?? null, setItem: ( k, v ) => store.set( k, v ) }, config: { ...LEADERBOARD_CONFIG, BIN_ID: 'test', MASTER_KEY: 'k' } } );
	for ( let i = 0; i < 9; i ++ ) lb.trackTime( 'Ahab', 1, () => ( { score: 1234 } ) );
	ok( puts === 0, 'no sync before SYNC_SECONDS of play' );
	lb.trackTime( 'Ahab', 1.5, () => ( { score: 1234, fish: 3 } ) );
	await new Promise( ( r ) => setTimeout( r, 20 ) );
	const row = bin.scores.find( ( r ) => r.name === 'Ahab' );
	ok( puts === 1 && row && row.score === 1234 && row.active && row.timePlayed === 10, 'a sync writes the captain\'s row to the bin, active' );
	const board = await lb.fetchBoard();
	ok( board.online && board.scores[ 0 ].name === 'Ahab' && board.scores.length === 2 && board.scores[ 0 ].active, 'the board reads back live, ranked' );
	const offline = new Leaderboard( { fetch: async () => { throw new Error( 'down' ); }, storage: { getItem: ( k ) => store.get( k ) ?? null, setItem: () => {} }, config: { ...LEADERBOARD_CONFIG, BIN_ID: 'test', MASTER_KEY: 'k' } } );
	const ob = await offline.fetchBoard();
	ok( ! ob.online && ob.scores.some( ( r ) => r.name === 'Ahab' ), 'offline, the board falls back to this device\'s copy' );

}

// ---- shared multiplayer weather (1.13.4): the same on every computer, smooth, mostly mild
{

	const t0 = 1.8e9;
	ok( JSON.stringify( weatherAt( t0 ) ) === JSON.stringify( weatherAt( t0 ) ), 'the weather at a given moment is always the same (every player works out the same)' );
	let jump = 0, dirJump = 0, prev = weatherAt( t0 );
	const seen = {};
	for ( let t = t0 + 1; t < t0 + 48 * 3600; t += 1 ) {

		const w = weatherAt( t );
		for ( const k of WEATHER_KEYS ) jump = Math.max( jump, Math.abs( w[ k ] - prev[ k ] ) / ( Math.max( ...WEATHER.map( ( x ) => x[ k ] ) ) || 1 ) );
		let d = Math.abs( w.windDir - prev.windDir ); d = Math.min( d, 360 - d );
		dirJump = Math.max( dirJump, d );
		prev = w;

	}

	for ( let i = 0; i < 4000; i ++ ) seen[ WEATHER[ spellKind( i ) ].id ] = ( seen[ WEATHER[ spellKind( i ) ].id ] || 0 ) + 1;
	ok( jump < 0.01 && dirJump < 0.1, `the weather changes smoothly, never in a jump (largest step a second: ${ ( jump * 100 ).toFixed( 2 ) }% of the range, wind ${ dirJump.toFixed( 3 ) }°)` );
	ok( seen.breezy > seen.choppy && seen.choppy > seen.calm && seen.calm > seen.storm && seen.storm > 250, `every kind of weather comes round, storms the rarest (${ JSON.stringify( seen ) })` );
	const mid = weatherAt( Math.floor( t0 / SPELL_S ) * SPELL_S + 60 ), kind = WEATHER.find( ( x ) => x.id === mid.id );
	ok( WEATHER_KEYS.every( ( k ) => Math.abs( mid[ k ] - kind[ k ] ) < 1e-9 ), 'early in a spell the sea is exactly that weather\'s conditions' );

}
// ---- the trawl net (1.13.5): fish, crabs and lobster to keep; protected animals that must go back
{

	const pool = { hab: habitatAt( spots.deep ), depth: 40, tier: 2, hour: 12 };
	let prot = 0, crust = 0, bad = 0, n = 4000;
	const seenP = {};
	for ( let i = 0; i < n; i ++ ) {

		const it = rollNetItem( pool );
		if ( it.protected ) {

			prot ++;
			seenP[ it.id ] = 1;
			if ( ! PROTECTED[ it.id ] || ! ( it.kg > 0 ) ) bad ++;

		} else {

			const f = FISH[ it.species ];
			if ( f.trawl ) crust ++;
			else if ( f.tier !== 'common' && f.tier !== 'uncommon' ) bad ++;
			if ( ! ( it.value > 0 ) || it.kg < f.kg[ 0 ] || it.kg > f.kg[ 1 ] ) bad ++;

		}

	}

	ok( bad === 0, 'a trawl keeps only everyday fish, crabs, lobster and squid; protected animals are named and weighed' );
	ok( prot / n > 0.1 && prot / n < 0.18, `now and then a protected animal is caught (${ ( prot / n * 100 ).toFixed( 1 ) }%)` );
	ok( crust / n > 0.25 && crust / n < 0.45, `a good share of crabs, lobster and squid (${ ( crust / n * 100 ).toFixed( 1 ) }%)` );
	ok( ! seenP.manatee && seenP.dolphin && seenP.seal && seenP.greenTurtle, 'dolphins, seals and turtles offshore, but no manatees in deep water' );
	let manatee = 0;
	for ( let i = 0; i < 3000; i ++ ) if ( rollNetItem( { hab: habitatAt( spots.shallows ), depth: 5, tier: 1 } ).id === 'manatee' ) manatee ++;
	ok( manatee > 0, 'manatees turn up in shallow water' );
	let onRod = 0;
	for ( const s of Object.values( spots ) ) for ( let i = 0; i < 2000; i ++ ) if ( FISH[ pickSpecies( habitatAt( s ), 12 ) ]?.trawl ) onRod ++;
	ok( onRod === 0 && TRAWL_IDS.length === 4, 'crabs, lobster and squid never bite on a rod' );
	const items = [ { protected: true }, { protected: false }, { protected: true, released: true } ];
	ok( protectedLeft( items ) === 1, 'the catch can\'t be kept while a protected animal is still in the net' );
	ok( UPGRADES.trawl && isBoatTrack( 'trawl' ) && gearStats( { trawl: 2 } ).netSize === 12 && gearStats( {} ).trawlNet === 0, 'the trawl net is a per-boat upgrade, none to start' );

}

// ---- 1.13.5: a wide boat moors further out from the pier head (the superyacht rubbed the dock)
{

	ok( berthX( BOATS.lobster ) === 64.5 && berthX( {} ) === 64.5, 'the lobster boat keeps its berth' );
	const side = berthX( BOATS.superyacht ) - BOATS.superyacht.beam / 2;
	ok( side - 62 > 2, `the superyacht's side lies ${ ( side - 62 ).toFixed( 1 ) } m off the pier head` );
	ok( BOATS.superyacht.handling && BOATS.superyacht.handling.waveSmooth > 0 && BOATS.superyacht.speedMul < 2, 'the superyacht rides steadier and drives heavier' );

}
// ---- 1.13.6: the net's warps are a rope: dead astern on a straight course, at an angle after a turn
{

	const L = 17; // half the warp (two knots)
	const stern = { x: 0, z: 0 }, mid = { x: 0, z: - L }, net = { x: 0, z: - 2 * L };
	let hx = 0, hz = 1, yaw = 0; // heading (+z), turning to port then straight
	const angle = () => {

		const bx = - Math.sin( yaw ), bz = - Math.cos( yaw ); // astern
		const nx = net.x - stern.x, nz = net.z - stern.z, n = Math.hypot( nx, nz );
		return Math.acos( Math.max( - 1, Math.min( 1, ( nx * bx + nz * bz ) / n ) ) ) * 180 / Math.PI;

	};
	const step = ( turn, dt = 1 / 30, v = 2 ) => {

		yaw += turn * dt;
		hx = Math.sin( yaw ); hz = Math.cos( yaw );
		stern.x += hx * v * dt; stern.z += hz * v * dt;
		followRope( mid, stern, L );
		followRope( net, mid, L );

	};
	for ( let i = 0; i < 300; i ++ ) step( 0 );
	const straight = angle();
	for ( let i = 0; i < 30 * 8; i ++ ) step( Math.PI / 2 / 8 ); // a 90 degree turn in 8 s
	const afterTurn = angle();
	for ( let i = 0; i < 30 * 40; i ++ ) step( 0 );
	const later = angle();
	ok( straight < 0.5 && afterTurn > 25 && later < 3, `the net streams astern, swings out in a turn and pulls at an angle (${ afterTurn.toFixed( 0 ) }° off), then falls in behind again (${ later.toFixed( 1 ) }°)` );
	const d = Math.hypot( net.x - stern.x, net.z - stern.z );
	ok( d <= 2 * L + 1e-6 && d > 2 * L * 0.9, 'the warps keep their length' );

}
console.log( `value check ${ value }` );
console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
