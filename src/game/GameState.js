import { FISH, fishValue, fishLengthCm, TROPHY_VALUE } from './FishTable.js';
import { defaultUpgrades, gearStats, nextLevel, UPGRADES, FUEL_PRICE, REPAIR_PRICE, BOAT_TRACKS } from './Gear.js';
import { BOATS, applyBoat } from './BoatCatalog.js';

const SAVE_KEY = 'waterwars.save.v1';
const PIRATE_STATS = () => ( { sunk: 0, looted: 0, plunder: 0, bounties: 0, piratesSunk: 0, deaths: 0 } );

// Everything the player owns: wallet, the fish in the cooler / hold, the fish log and the gear
// levels. Saved to localStorage (per browser) after every change; storage can be missing or throw
// (private windows, blocked site data), so every access is guarded and the game runs without it.
export class GameState {

	constructor( storage = safeStorage() ) {

		this.storage = storage;
		this.money = 0;
		this.earned = 0; // lifetime money made (fish sold, bounties, plunder): the high-score
		this.furthest = 0; // the most dangerous tier sailed into (0 = the harbour only)
		this.inventory = []; // { id, species, kg, cm, value, caughtAt (game hours), record }
		this.log = {}; // species -> { count, bestKg, bestCm }
		// the last addFish: { species, kg, cm, value, newSpecies, record, prevBestKg, prevBestCm, kept } (the catch card)
		this.lastCatch = null;
		// the levels in effect: your tackle plus the gear fitted to the boat in use. Each boat's own gear is
		// kept in boatGear (boat id -> { track: level }) and swapped in when you switch boats (Water Wars 1.11)
		this.upgrades = defaultUpgrades();
		this.boatGear = {};
		this.fuel = null; // litres left (null = full tank)
		this.hull = null; // hull points left (null = fully repaired)
		this.shells = 5; // cannon shells in the locker
		this.wanted = 0; // 0..5 stars for piracy against honest boats (the coast guard hunts you from 2)
		this.pirate = PIRATE_STATS();
		this.boat = 'lobster'; // the boat in use (BoatCatalog)
		this.boats = [ 'lobster' ]; // boats owned
		this._nextId = 1;
		this.listeners = new Set();

	}

	get stats() {

		return applyBoat( gearStats( this.upgrades ), this.boat );

	}

	// buy a boat (it becomes the one in use); null when unknown, owned or unaffordable
	buyBoat( id ) {

		const b = BOATS[ id ];
		if ( ! b || this.boats.includes( id ) || b.price > this.money ) return null;
		this.money -= b.price;
		this.boats.push( id );
		this.useBoat( id );
		return b;

	}

	// switch to an owned boat: it comes repaired, fuelled and with the hold carried over (what fits), with
	// its own engine, armour, weapons and fittings (a new boat starts with the basics)
	useBoat( id ) {

		if ( ! this.boats.includes( id ) || ! BOATS[ id ] ) return false;
		if ( id !== this.boat ) {

			this.stashBoatGear();
			this.boat = id;
			this.loadBoatGear( id );

		}
		this.hull = null;
		this.fuel = null;
		this.save();
		this.emit();
		return true;

	}

	// the boat in use's fitted gear, from the levels in effect
	stashBoatGear() {

		const g = {};
		for ( const k of BOAT_TRACKS ) g[ k ] = this.upgrades[ k ] | 0;
		this.boatGear[ this.boat ] = g;

	}

	// a boat's fitted gear into the levels in effect (nothing fitted yet: the basics)
	loadBoatGear( id ) {

		const g = this.boatGear[ id ] || {};
		for ( const k of BOAT_TRACKS ) this.upgrades[ k ] = g[ k ] | 0;

	}

	// the levels a boat would sail with: your tackle plus that boat's own gear
	levelsFor( id ) {

		if ( id === this.boat ) return this.upgrades;
		const u = { ...this.upgrades }, g = this.boatGear[ id ] || {};
		for ( const k of BOAT_TRACKS ) u[ k ] = g[ k ] | 0;
		return u;

	}

	get holdKg() {

		let kg = 0;
		for ( const f of this.inventory ) kg += f.kg;
		return kg;

	}

	get holdValue() {

		let v = 0;
		for ( const f of this.inventory ) v += f.value;
		return v;

	}

	// room in the cooler / hold for a fish of `kg`?
	fits( kg ) {

		return this.holdKg + kg <= this.stats.holdKg + 1e-6;

	}

	// store a caught fish; returns the entry, or null when the hold is full (it is logged either way).
	// A record beats an earlier catch of the species; the first one of a species is a new species.
	addFish( species, kg, timeOfDay = 12 ) {

		kg = Math.round( kg * 100 ) / 100;
		const cm = Math.round( fishLengthCm( species, kg ) );
		const logEntry = this.log[ species ] || ( this.log[ species ] = { count: 0, bestKg: 0 } );
		const newSpecies = logEntry.count === 0;
		const prevBestKg = logEntry.bestKg, prevBestCm = logEntry.bestCm ?? ( prevBestKg > 0 ? Math.round( fishLengthCm( species, prevBestKg ) ) : 0 );
		const record = ! newSpecies && kg > prevBestKg;
		logEntry.count ++;
		if ( kg > prevBestKg ) {

			logEntry.bestKg = kg;
			logEntry.bestCm = cm;

		}

		const value = fishValue( species, kg );
		// trophies (rare and better) are strapped on deck when the hold is full: never thrown back for space
		const trophy = value >= TROPHY_VALUE;
		const kept = this.fits( kg ) || trophy;
		this.lastCatch = { species, kg, cm, value, newSpecies, record, prevBestKg, prevBestCm, kept, onDeck: kept && trophy && ! this.fits( kg ), tier: FISH[ species ].tier };
		if ( ! kept ) {

			this.save();
			this.emit();
			return null;

		}

		const f = { id: this._nextId ++, species, kg, cm, value, caughtAt: timeOfDay, record };
		this.inventory.push( f );
		this.save();
		this.emit();
		return f;

	}

	// sell the given fish ids (all when omitted); returns the money made
	sell( ids = null ) {

		const keep = [], sold = [];
		for ( const f of this.inventory ) ( ids === null || ids.includes( f.id ) ? sold : keep ).push( f );
		let total = 0;
		for ( const f of sold ) total += f.value;
		this.inventory = keep;
		this.money += total;
		this.earned += total;
		this.save();
		this.emit();
		return { total, count: sold.length };

	}

	release( id ) {

		this.inventory = this.inventory.filter( ( f ) => f.id !== id );
		this.save();
		this.emit();

	}

	// spend money (upgrade shop); false when it can't be afforded
	spend( amount ) {

		if ( amount > this.money ) return false;
		this.money -= amount;
		this.save();
		this.emit();
		return true;

	}

	// buy the next level of an upgrade track; returns the new level entry or null
	buy( key ) {

		if ( ! UPGRADES[ key ] ) return null;
		const next = nextLevel( this.upgrades, key );
		if ( ! next || next.cost > this.money ) return null;
		this.money -= next.cost;
		this.upgrades[ key ] = next.index;
		this.stashBoatGear();
		if ( key === 'fuel' ) this.fuel = null; // a new tank comes full
		// new plates come undamaged: the extra points are added to what is left
		if ( key === 'armor' && this.hull !== null ) this.hull += ( next.hullHP - UPGRADES.armor.levels[ next.index - 1 ].hullHP ) * ( BOATS[ this.boat ] || BOATS.lobster ).hullMul;
		this.save();
		this.emit();
		return next;

	}

	get fuelL() {

		return this.fuel === null ? this.stats.fuelL : Math.min( this.fuel, this.stats.fuelL );

	}

	// burn litres (no save: that happens when the boat stops or at the next sale / purchase)
	burn( litres ) {

		this.fuel = Math.max( 0, this.fuelL - litres );
		return this.fuel;

	}

	refuelCost() {

		return Math.ceil( ( this.stats.fuelL - this.fuelL ) * FUEL_PRICE );

	}

	// fill up as far as the money goes; returns litres bought
	refuel() {

		const missing = this.stats.fuelL - this.fuelL;
		const litres = Math.min( missing, Math.floor( this.money / FUEL_PRICE ) );
		if ( litres <= 0 ) return 0;
		this.money -= Math.ceil( litres * FUEL_PRICE );
		this.fuel = this.fuelL + litres;
		if ( this.fuel >= this.stats.fuelL - 1e-3 ) this.fuel = null;
		this.save();
		this.emit();
		return litres;

	}

	get hullHP() {

		return this.hull === null ? this.stats.hullHP : Math.max( 0, Math.min( this.hull, this.stats.hullHP ) );

	}

	// damage the hull (no save, like fuel); returns the points left
	damage( hp ) {

		this.hull = Math.max( 0, this.hullHP - hp );
		return this.hull;

	}

	heal( hp ) {

		const max = this.stats.hullHP;
		const v = Math.min( max, this.hullHP + hp );
		this.hull = v >= max - 1e-3 ? null : v;

	}

	repairCost() {

		return Math.ceil( ( this.stats.hullHP - this.hullHP ) * REPAIR_PRICE );

	}

	// patch the hull as far as the money goes; returns points repaired
	repair() {

		const missing = this.stats.hullHP - this.hullHP;
		const hp = Math.min( missing, Math.floor( this.money / REPAIR_PRICE ) );
		if ( hp <= 0 ) return 0;
		this.money -= Math.ceil( hp * REPAIR_PRICE );
		this.heal( hp );
		this.save();
		this.emit();
		return hp;

	}

	earn( amount ) {

		this.money += Math.round( amount );
		this.earned += Math.max( 0, Math.round( amount ) );
		this.save();
		this.emit();

	}

	onChange( fn ) {

		this.listeners.add( fn );
		return () => this.listeners.delete( fn );

	}

	emit() {

		for ( const fn of this.listeners ) fn( this );

	}

	toJSON() {

		this.stashBoatGear();
		return { v: 1, money: this.money, earned: this.earned, furthest: this.furthest, boatGear: this.boatGear, inventory: this.inventory, log: this.log, upgrades: this.upgrades, fuel: this.fuel, nextId: this._nextId, hull: this.hull, shells: this.shells, wanted: this.wanted, pirate: this.pirate, boat: this.boat, boats: this.boats };

	}

	fromJSON( d ) {

		if ( ! d || d.v !== 1 ) return false;
		this.money = Number.isFinite( d.money ) ? d.money : 0;
		// saves from before 1.7 start the lifetime total at the cash in hand
		this.earned = Number.isFinite( d.earned ) ? Math.max( d.earned, this.money ) : Math.max( 0, this.money );
		this.furthest = Number.isFinite( d.furthest ) ? d.furthest : 0;
		this.inventory = Array.isArray( d.inventory ) ? d.inventory.filter( ( f ) => f && FISH[ f.species ] && Number.isFinite( f.kg ) ) : [];
		// saves from before lengths were recorded
		for ( const f of this.inventory ) if ( ! Number.isFinite( f.cm ) ) f.cm = Math.round( fishLengthCm( f.species, f.kg ) );
		this.log = d.log && typeof d.log === 'object' ? d.log : {};
		for ( const [ k, v ] of Object.entries( this.log ) ) if ( FISH[ k ] && v && v.bestKg > 0 && ! Number.isFinite( v.bestCm ) ) v.bestCm = Math.round( fishLengthCm( k, v.bestKg ) );
		this.upgrades = { ...defaultUpgrades(), ...( d.upgrades || {} ) };
		this.fuel = Number.isFinite( d.fuel ) ? d.fuel : null;
		this.hull = Number.isFinite( d.hull ) ? d.hull : null;
		this.shells = Number.isFinite( d.shells ) ? d.shells : 5;
		this.wanted = Number.isFinite( d.wanted ) ? d.wanted : 0;
		this.pirate = { ...PIRATE_STATS(), ...( d.pirate && typeof d.pirate === 'object' ? d.pirate : {} ) };
		this.boats = Array.isArray( d.boats ) ? [ 'lobster', ...d.boats.filter( ( b ) => BOATS[ b ] && b !== 'lobster' ) ] : [ 'lobster' ];
		this.boat = this.boats.includes( d.boat ) ? d.boat : 'lobster';
		// each boat's own gear; a save from before 1.11 had one set for every boat: each boat you own keeps it
		this.boatGear = {};
		if ( d.boatGear && typeof d.boatGear === 'object' ) {

			for ( const id of this.boats ) if ( d.boatGear[ id ] && typeof d.boatGear[ id ] === 'object' ) {

				const g = {};
				for ( const k of BOAT_TRACKS ) g[ k ] = Math.max( 0, d.boatGear[ id ][ k ] | 0 );
				this.boatGear[ id ] = g;

			}

			this.loadBoatGear( this.boat );

		} else {

			const g = {};
			for ( const k of BOAT_TRACKS ) g[ k ] = this.upgrades[ k ] | 0;
			for ( const id of this.boats ) this.boatGear[ id ] = { ...g };

		}
		this._nextId = Math.max( d.nextId | 0, ...this.inventory.map( ( f ) => f.id + 1 ), 1 );
		return true;

	}

	save() {

		if ( ! this.storage ) return;
		try {

			this.storage.setItem( SAVE_KEY, JSON.stringify( this.toJSON() ) );

		} catch ( e ) { /* storage full or blocked: keep playing */ }

	}

	load() {

		if ( ! this.storage ) return false;
		try {

			const raw = this.storage.getItem( SAVE_KEY );
			return raw ? this.fromJSON( JSON.parse( raw ) ) : false;

		} catch ( e ) {

			return false;

		}

	}

	reset() {

		this.money = 0;
		this.earned = 0;
		this.furthest = 0;
		this.inventory = [];
		this.log = {};
		this.upgrades = defaultUpgrades();
		this.boatGear = {};
		this.fuel = null;
		this.hull = null;
		this.shells = 5;
		this.wanted = 0;
		this.pirate = PIRATE_STATS();
		this.boat = 'lobster';
		this.boats = [ 'lobster' ];
		this.save();
		this.emit();

	}

}

function safeStorage() {

	try {

		return typeof localStorage !== 'undefined' ? localStorage : null;

	} catch ( e ) {

		return null;

	}

}
