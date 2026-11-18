import { Group, Mesh, Vector3 } from '../engine/index.js';
import { prepare, mergePrepared, box, cylinder, sphere, mat4 } from '../world/boat/GeoKit.js';
import { createPropMaterial } from './GameMaterials.js';
import { standard } from '../materials/Materials.js';
import { loadBoatGeometry } from './Boats.js';
import { dangerZoneAt, harbourDistance, DANGER_TIERS, HARBOUR } from './DangerZones.js';
import { UPGRADES, CAPTAIN_TRACKS } from './Gear.js';

// Treasure diving (Water Wars 1.19). Wrecks lie on the seabed in the danger tiers: a few in the Coastal
// Waters (10-30 m down), more in the Open Sea (25-55 m) and the richest in the Deadwater (55-90 m). The fish
// finder picks them up under the boat (and swimming close finds them too): then they're on the minimap.
// Anchor (step off the helm and go over the side), dive (look down + W, or C), and press E at a chest for
// gold, now and then a piece of rare gear (a free upgrade) or a treasure map (an X on the minimap: a hidden
// chest worth three times as much). Opened chests fill again after a while.
//
// Air: your scuba gear (the Diving tab at harbour services) sets how long you can stay down, how fast you
// swim and how deep it's rated for; below that depth the air goes three times as fast. Run out and you
// black out, and wake up back aboard your boat. Sharks patrol the wrecks of the Open Sea and the Deadwater:
// a bite costs you air.
//
// The wrecks are laid out from a fixed seed over the terrain, so every player (multiplayer too) finds them
// in the same places; the chests and their loot are each player's own.

export const WRECK_PLAN = [
	// [ danger tier, how many, depth range m ]
	[ 1, 4, [ 10, 30 ] ],
	[ 2, 5, [ 25, 55 ] ],
	[ 3, 3, [ 55, 89 ] ], // (the Deadwater reaches the charted terrain only in its corners, 60-90 m down)
];
export const CHEST_REFILL_S = 30 * 60; // an opened chest fills again after this long
export const LOOT = {
	1: { cash: [ 2000, 6000 ], gear: 0.1, map: 0.15 },
	2: { cash: [ 12000, 35000 ], gear: 0.2, map: 0.2 },
	3: { cash: [ 60000, 150000 ], gear: 0.35, map: 0.25 },
};
export const MAP_MUL = 3; // a treasure-map chest pays this many times a chest of its tier
export const SHARKS = { 1: 0, 2: 1, 3: 2 }; // per wreck, while you dive at it
const SHARK_BITE = 0.22; // of your gear's air
const FIND_SONAR = 160; // m: the fish finder picks up a wreck this far from the boat
const FIND_SWIM = 45; // m: swimming this close finds one
const OPEN_REACH = 2.6; // m: from a chest to open it

// a small seeded random (the same wrecks on every computer)
export function seeded( seed ) {

	let a = seed >>> 0;
	return () => {

		a = ( a + 0x6d2b79f5 ) >>> 0;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

// where the wrecks lie: on fairly flat seabed of the right depth in each tier, inside the charted terrain,
// well apart. terrain: { heightAt( x, z ) }. Returns [ { id, tier, x, z, y, yaw, chests: [ { id, x, y, z } ] } ]
export function placeWrecks( terrain, seed = 0x5eabed ) {

	const rnd = seeded( seed );
	const out = [];
	const LIMIT = 1010; // just inside the terrain's edge (it's -90 m and bare beyond)
	for ( const [ tier, n, [ d0, d1 ] ] of WRECK_PLAN ) {

		const band = DANGER_TIERS.find( ( t ) => t.tier === tier );
		let placed = 0;
		for ( let tries = 0; tries < 200000 && placed < n; tries ++ ) {

			// round the harbour within the tier's ring (the Deadwater's only charted seabed is in the corners)
			const m = tier === 3 ? 5 : 30, a = rnd() * Math.PI * 2, rr = band.r0 + m + rnd() * ( Math.min( band.r1, 1500 ) - band.r0 - 2 * m );
			const x = HARBOUR.x + Math.cos( a ) * rr, z = HARBOUR.z + Math.sin( a ) * rr;
			if ( Math.abs( x ) > LIMIT || Math.abs( z ) > LIMIT ) continue;
			const r = harbourDistance( x, z );
			if ( r < band.r0 + m || r > band.r1 - m ) continue;
			const d = - terrain.heightAt( x, z );
			if ( d < d0 || d > d1 ) continue;
			// flat enough to settle on (no cliff edge)
			let flat = true;
			for ( const [ ox, oz ] of [ [ 8, 0 ], [ - 8, 0 ], [ 0, 8 ], [ 0, - 8 ] ] ) if ( Math.abs( - terrain.heightAt( x + ox, z + oz ) - d ) > 3.5 ) flat = false;
			if ( ! flat ) continue;
			if ( out.some( ( w ) => Math.hypot( w.x - x, w.z - z ) < 220 ) ) continue;
			const yaw = rnd() * Math.PI * 2, id = `w${ tier }-${ placed }`;
			const y = terrain.heightAt( x, z );
			const chests = [];
			const nc = tier === 1 ? 1 : 2;
			for ( let c = 0; c < nc; c ++ ) {

				// beside the hull, one each side
				const side = c === 0 ? 1 : - 1, along = ( rnd() - 0.5 ) * 6;
				const lx = side * ( 4.2 + rnd() * 1.5 ), cx = x + Math.cos( yaw ) * lx + Math.sin( yaw ) * along, cz = z - Math.sin( yaw ) * lx + Math.cos( yaw ) * along;
				chests.push( { id: `${ id }-c${ c }`, x: cx, y: terrain.heightAt( cx, cz ), z: cz } );

			}

			out.push( { id, tier, x, z, y, yaw, chests } );
			placed ++;

		}

	}

	return out;

}

// a chest's loot: { cash, gear: upgrade key | null, map: bool }. upgrades: your levels (for the free gear)
export function rollLoot( tier, upgrades, rng = Math.random, mul = 1 ) {

	const L = LOOT[ tier ] || LOOT[ 1 ];
	const cash = Math.round( ( L.cash[ 0 ] + ( L.cash[ 1 ] - L.cash[ 0 ] ) * rng() ) * mul / 100 ) * 100;
	let gear = null;
	if ( rng() < L.gear ) {

		// a free next level of a piece of your own kit that isn't maxed
		const open = [ ...CAPTAIN_TRACKS ].filter( ( k ) => UPGRADES[ k ] && ( upgrades[ k ] | 0 ) < UPGRADES[ k ].levels.length - 1 );
		if ( open.length ) gear = open[ Math.floor( rng() * open.length ) ];

	}

	const map = mul === 1 && rng() < L.map;
	return { cash, gear, map };

}

// air left after dt seconds: drains while under (3x past the gear's depth rating), refills at the surface
export function breathe( air, airMax, dt, under, depth, rating ) {

	if ( ! under ) return Math.min( airMax, air + airMax * 0.25 * dt );
	return Math.max( 0, air - dt * ( depth > rating ? 3 : 1 ) );

}

const _v = new Vector3(), _w = new Vector3();
const CSS = /* css */`
.ww-dive { position: absolute; left: 50%; bottom: calc(max(calc(72 * var(--tw-u)), 13vh) + calc(10 * var(--tw-u))); transform: translateX(-50%);
	width: calc(300 * var(--tw-u)); padding: var(--tw-2) var(--tw-4); border-radius: var(--tw-r-lg); pointer-events: none; opacity: 0; transition: opacity 250ms;
	font: 600 var(--tw-fs-sm) var(--tw-font); color: var(--tw-ink); text-align: center; }
.ww-dive.is-on { opacity: 1; }
.ww-dive-bar { height: calc(8 * var(--tw-u)); margin: 5px 0 4px; border-radius: 99px; background: rgba(0,0,0,0.45); overflow: hidden; }
.ww-dive-bar > span { display: block; height: 100%; width: 100%; background: linear-gradient(90deg, #2f8fd4, #6fd6f6); transition: width 150ms linear; }
.ww-dive.is-low .ww-dive-bar > span { background: var(--tw-coral); animation: ww-blink 0.5s steps(2) infinite; }
.ww-dive-sub { font: 500 var(--tw-fs-xs) var(--tw-mono); color: var(--tw-ink-2); }
.ww-dive.is-deep .ww-dive-sub { color: var(--tw-coral); }
.gm-mk.is-wreck > i { background: #c9a34a; color: #20160a; width: calc(15 * var(--tw-u)); height: calc(15 * var(--tw-u)); margin: calc(-7.5 * var(--tw-u)) 0 0 calc(-7.5 * var(--tw-u)); }
.gm-mk.is-treasure > i { background: #ffd34a; color: #3a0a00; width: calc(18 * var(--tw-u)); height: calc(18 * var(--tw-u)); margin: calc(-9 * var(--tw-u)) 0 0 calc(-9 * var(--tw-u)); box-shadow: 0 0 8px rgba(255, 210, 70, 0.9); }
`;
const ANCHOR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="5" r="2"/><path d="M12 7v13M7 11h10M4 14c1 4 4 6 8 6s7-2 8-6"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

// ---- models
function chestGeometry() {

	const base = [], lid = [];
	const WOOD = { color: 0x9a6a3a, rough: 0.8, pattern: 1 }, BAND = { color: 0xd4a640, rough: 0.35, metal: 1 };
	base.push( prepare( box( 1.0, 0.55, 0.65 ), { ...WOOD, matrix: mat4( 0, 0.275, 0 ) } ) );
	for ( const x of [ - 0.35, 0.35 ] ) base.push( prepare( box( 0.07, 0.57, 0.67 ), { ...BAND, matrix: mat4( x, 0.275, 0 ) } ) );
	base.push( prepare( box( 0.16, 0.16, 0.04 ), { ...BAND, matrix: mat4( 0, 0.45, 0.335 ) } ) ); // the lock
	// the lid: hinged at the back edge (its own mesh, pivot at y 0.55, z -0.325)
	lid.push( prepare( cylinder( 0.33, 0.33, 1.0, 14, 1, false, 0, Math.PI ), { ...WOOD, matrix: mat4( 0, 0, 0.325, 0, 0, Math.PI / 2 ) } ) );
	for ( const x of [ - 0.35, 0.35 ] ) lid.push( prepare( cylinder( 0.345, 0.345, 0.07, 14, 1, false, 0, Math.PI ), { ...BAND, matrix: mat4( x, 0, 0.325, 0, 0, Math.PI / 2 ) } ) );
	return { base: mergePrepared( base ), lid: mergePrepared( lid ) };

}

function sharkGeometry() {

	const body = [], tail = [];
	const GREY = { color: 0x4f5b63, rough: 0.55 }, BELLY = { color: 0xc9cdd0, rough: 0.6 };
	// along +Z (nose forward), about 3 m
	body.push( prepare( sphere( 1, 18, 12 ), { ...GREY, matrix: mat4( 0, 0, 0, 0, 0, 0, 0.42, 0.5, 1.45 ) } ) );
	body.push( prepare( sphere( 1, 16, 10 ), { ...BELLY, matrix: mat4( 0, - 0.12, 0.1, 0, 0, 0, 0.36, 0.38, 1.3 ) } ) );
	body.push( prepare( box( 0.06, 0.62, 0.6 ), { ...GREY, matrix: mat4( 0, 0.55, - 0.05, - 0.5, 0, 0 ) } ) ); // dorsal fin
	for ( const s of [ - 1, 1 ] ) body.push( prepare( box( 0.75, 0.05, 0.36 ), { ...GREY, matrix: mat4( s * 0.5, - 0.22, 0.35, 0, s * 0.35, s * - 0.3 ) } ) ); // pectorals
	// the tail: its own mesh (pivot at the body's end), swept from side to side
	tail.push( prepare( cylinder( 0.08, 0.22, 0.8, 10 ), { ...GREY, matrix: mat4( 0, 0, - 0.4, Math.PI / 2, 0, 0 ) } ) );
	tail.push( prepare( box( 0.05, 1.0, 0.4 ), { ...GREY, matrix: mat4( 0, 0.12, - 0.85, - 0.35, 0, 0 ) } ) );
	return { body: mergePrepared( body ), tail: mergePrepared( tail ) };

}

const WRECK_MODEL = {
	model: 'oldboat', up: 'y', fwd: 'z', length: 15, beam: 5.9, draft: 0.8,
	// rust, weed and silt over the old paint
	paint: [ [ 0.1, [ 0.05, 0.04, 0.03 ] ], [ 0.35, [ 0.13, 0.07, 0.04 ] ], [ 1.2, [ 0.07, 0.09, 0.05 ] ], [ 99, [ 0.14, 0.12, 0.08 ] ] ],
	deckColor: [ 0.08, 0.07, 0.05 ], paintBlend: 0.3,
};

class Shark {

	constructor( scene, geo, mat ) {

		this.group = new Group();
		this.body = new Mesh( geo.body, mat );
		this.tail = new Mesh( geo.tail, mat );
		this.tail.position.set( 0, 0, - 1.35 );
		this.group.add( this.body, this.tail );
		this.group.visible = false;
		scene.add( this.group );
		this.pos = new Vector3();
		this.vel = new Vector3();
		this.active = false;
		this.phase = Math.random() * 10;

	}

}

export class Diving {

	constructor( game ) {

		this.game = game;
		this.app = game.app;
		this.wrecks = null;
		this.air = 35;
		this.under = false;
		this.sharks = [];
		this.marks = new Map();
		this.chestMeshes = new Map();
		this._t = 0;

	}

	get stats() {

		return this.game.state.stats;

	}

	get log() {

		const s = this.game.state;
		if ( ! s.diving ) s.diving = { opened: {}, found: [], maps: [] };
		return s.diving;

	}

	// built once the terrain is there (the first update)
	build() {

		const app = this.app, scene = app.scene;
		this.wrecks = placeWrecks( app.terrainData );
		const chestGeo = chestGeometry(), mat = createPropMaterial( 'treasure' );
		this.chestMat = mat;
		this.chestGeo = chestGeo;
		this.glowGeo = mergePrepared( [ prepare( sphere( 0.05, 8, 6 ), { color: 0xffffff } ) ] );
		this.glowMat = standard( { color: 0x000000, emissive: 0xffc84a, emissiveIntensity: 12 } );
		mat.side = 'double'; // (the lid is a half shell)
		const wreckMat = createPropMaterial( 'wreck' );
		wreckMat.side = 'double';
		loadBoatGeometry( 'wreck', WRECK_MODEL ).then( ( geo ) => {

			if ( ! geo ) return;
			for ( const w of this.wrecks ) {

				const m = new Mesh( geo, wreckMat );
				m.name = 'wreck-' + w.id;
				// settled on the bottom: listing over, the bow down a little, sunk into the silt
				m.position.set( w.x, w.y - 0.9, w.z );
				m.rotation.set( 0.08, w.yaw, 0.42, 'YXZ' );
				m.castShadow = false;
				scene.add( m );
				w.mesh = m;

			}

		} ).catch( ( e ) => console.warn( 'wreck model failed', e ) );
		for ( const w of this.wrecks ) for ( const c of w.chests ) this.addChest( c, w.tier, false );
		for ( const m of this.log.maps ) this.addChest( m, m.tier, true );
		// sharks (a small pool)
		const sg = sharkGeometry(), smat = createPropMaterial( 'shark' );
		for ( let i = 0; i < 3; i ++ ) this.sharks.push( new Shark( scene, sg, smat ) );
		// the HUD
		if ( typeof document !== 'undefined' ) {

			const style = document.createElement( 'style' );
			style.textContent = CSS;
			document.head.append( style );
			const ui = app.ui && app.ui.ui;
			this.el = document.createElement( 'div' );
			this.el.className = 'ww-dive tw-glass';
			this.el.innerHTML = '<div class="ww-dive-title">Air</div><div class="ww-dive-bar"><span></span></div><div class="ww-dive-sub"></div>';
			( ui ? ( ui.hud || ui.root ) : document.body ).append( this.el );
			this.barEl = this.el.querySelector( '.ww-dive-bar > span' );
			this.subEl = this.el.querySelector( '.ww-dive-sub' );

		}

		// the ones already found go on the minimap
		for ( const id of this.log.found ) {

			const w = this.wrecks.find( ( x ) => x.id === id );
			if ( w ) this.mark( w );

		}

		for ( const m of this.log.maps ) this.markTreasure( m );

	}

	addChest( c, tier, treasure ) {

		const g = new Group();
		const base = new Mesh( this.chestGeo.base, this.chestMat );
		const lid = new Mesh( this.chestGeo.lid, this.chestMat );
		lid.position.set( 0, 0.55, - 0.325 );
		const glow = new Mesh( this.glowGeo, this.glowMat );
		glow.position.set( 0, 0.45, 0.35 );
		g.add( base, lid, glow );
		g.position.set( c.x, c.y - 0.08, c.z ); // (settled into the sand)
		g.rotation.y = ( c.x * 7.13 + c.z * 3.31 ) % ( Math.PI * 2 );
		if ( treasure ) g.scale.setScalar( 1.5 );
		this.app.scene.add( g );
		this.chestMeshes.set( c.id, { g, lid, glow, c, tier, treasure } );

	}

	isOpen( id ) {

		const t = this.log.opened[ id ];
		return Number.isFinite( t ) && Date.now() / 1000 - t < CHEST_REFILL_S;

	}

	mark( w ) {

		const map = this.game.minimap;
		if ( ! map || ! map.addMarker || this.marks.has( w.id ) ) return;
		this.marks.set( w.id, map.addMarker( { id: 'wreck-' + w.id, kind: 'wreck', icon: ANCHOR, pos: () => w } ) );

	}

	markTreasure( m ) {

		const map = this.game.minimap;
		if ( ! map || ! map.addMarker || this.marks.has( m.id ) ) return;
		this.marks.set( m.id, map.addMarker( { id: 'treasure-' + m.id, kind: 'treasure', icon: CROSS, pos: () => ( this.log.maps.includes( m ) ? m : null ) } ) );

	}

	find( w, how ) {

		if ( this.log.found.includes( w.id ) ) return;
		this.log.found.push( w.id );
		this.game.state.save();
		this.mark( w );
		const tierName = [ '', 'Coastal Waters', 'Open Sea', 'Deadwater' ][ w.tier ];
		this.game.toast( `⚓ ${ how === 'sonar' ? 'Your fish finder picked up a wreck' : 'A wreck' } ${ Math.round( - w.y ) } m down (${ tierName }) · marked on the minimap. Leave the helm, go over the side and dive (C)`, 5200 );

	}

	update( dt ) {

		if ( ! this.wrecks ) {

			if ( ! this.app.terrainData || ! this.app.scene ) return;
			this.build();

		}

		const app = this.app, game = this.game, p = app.player, st = this.stats;
		this._t += dt;
		const airMax = st.airS || 35, rating = st.depthRating || 15;
		// swimming: your gear's fins
		p.swimMul = st.diveMul || 1;

		// ---- finding wrecks: the fish finder from the boat, or swimming close
		const aboard = p.mode === 'boat' || p.mode === 'deck';
		const here = aboard ? app.boatCtl.position : p.position;
		let sonarWreck = null;
		for ( const w of this.wrecks ) {

			const d = Math.hypot( w.x - here.x, w.z - here.z );
			if ( aboard && st.finder && d < FIND_SONAR ) {

				if ( ! sonarWreck || d < sonarWreck.d ) sonarWreck = { d, depth: - w.y };
				this.find( w, 'sonar' );

			} else if ( p.mode === 'swim' && d < FIND_SWIM ) this.find( w, 'swim' );

		}

		game._sonarWreck = sonarWreck;

		// ---- air
		const surface = p.waterH;
		const eyeY = app.camera.position.y;
		const under = p.mode === 'swim' && eyeY < surface - 0.1;
		const depth = Math.max( 0, surface - p.position.y );
		if ( under && ! this.under ) this.air = Math.min( this.air, airMax );
		this.under = under;
		this.air = breathe( this.air, airMax, dt, under, depth, rating );
		if ( under && this.air <= 0 ) this.blackout();

		// ---- chests: open with E within reach
		let near = null, nearD = OPEN_REACH;
		if ( p.mode === 'swim' ) for ( const ch of this.chestMeshes.values() ) {

			const c = ch.c;
			const d = Math.hypot( c.x - p.position.x, ( c.y + 0.4 ) - p.position.y, c.z - p.position.z );
			if ( d < nearD && ! this.isOpen( c.id ) ) {

				near = ch;
				nearD = d;

			}

		}

		if ( near && ! p.prompt ) p.prompt = { key: 'E', text: near.treasure ? 'Dig up the treasure' : 'Open the chest' };
		if ( near && app.input.hit( 'KeyE' ) ) this.open( near );

		// lids and glows
		for ( const ch of this.chestMeshes.values() ) {

			const open = this.isOpen( ch.c.id );
			const want = open ? - 1.9 : 0;
			ch.lid.rotation.x += ( want - ch.lid.rotation.x ) * Math.min( 1, dt * 3 );
			ch.glow.visible = ! open;
			const cam = app.camera.position;
			ch.g.visible = ( ch.c.x - cam.x ) ** 2 + ( ch.c.z - cam.z ) ** 2 < 500 * 500;

		}

		this.updateSharks( dt, under, depth );
		this.updateHud( under, depth, airMax, rating );

	}

	open( ch ) {

		const game = this.game, s = game.state;
		const loot = rollLoot( ch.tier, s.upgrades, Math.random, ch.treasure ? MAP_MUL : 1 );
		this.log.opened[ ch.c.id ] = Math.floor( Date.now() / 1000 );
		const bits = [ `$${ loot.cash.toLocaleString() }` ];
		s.earn( loot.cash );
		if ( loot.gear ) {

			s.upgrades[ loot.gear ] = ( s.upgrades[ loot.gear ] | 0 ) + 1;
			const lv = UPGRADES[ loot.gear ].levels[ s.upgrades[ loot.gear ] ];
			bits.push( `rare gear: ${ lv.label }` );
			if ( game.applyGear ) game.applyGear();

		}

		if ( loot.map ) {

			const m = this.treasureSpot( ch.tier );
			if ( m ) {

				this.log.maps.push( m );
				this.addChest( m, m.tier, true );
				this.markTreasure( m );
				bits.push( 'a treasure map (the gold X on the minimap)' );

			}

		}

		if ( ch.treasure ) {

			// dug up: the map is used; the chest goes for good
			this.log.maps = this.log.maps.filter( ( m ) => m.id !== ch.c.id );
			delete this.log.opened[ ch.c.id ];
			this.app.scene.remove( ch.g );
			this.chestMeshes.delete( ch.c.id );

		}

		s.save();
		s.emit();
		const au = this.app.audio;
		if ( au && au.coin ) au.coin();
		game.toast( `${ ch.treasure ? '🗺 Buried treasure!' : '💰 Treasure chest!' } ${ bits.join( ' · ' ) }`, 4600 );

	}

	// a hidden chest for a treasure map: diveable seabed in the same tier (or the next one out)
	treasureSpot( tier ) {

		const T = this.app.terrainData;
		const want = Math.min( 3, tier + ( Math.random() < 0.4 ? 1 : 0 ) );
		const [ , , [ d0, d1 ] ] = WRECK_PLAN.find( ( p ) => p[ 0 ] === want );
		for ( let i = 0; i < 4000; i ++ ) {

			const x = ( Math.random() * 2 - 1 ) * 1000, z = ( Math.random() * 2 - 1 ) * 1000;
			const zn = dangerZoneAt( x, z );
			if ( ! zn || zn.tier !== want ) continue;
			const d = - T.heightAt( x, z );
			if ( d < d0 || d > d1 ) continue;
			return { id: 't' + Date.now().toString( 36 ) + Math.floor( Math.random() * 1e4 ), tier: want, x, y: T.heightAt( x, z ), z };

		}

		return null;

	}

	// out of air: you black out and come round aboard your boat (or on the beach)
	blackout() {

		const app = this.app, p = app.player, game = this.game;
		const b = app.boatCtl;
		this.air = this.stats.airS || 35;
		for ( const sh of this.sharks ) this.park( sh );
		const fee = Math.min( 5000, Math.round( game.state.money * 0.02 ) );
		if ( fee > 0 ) {

			game.state.money -= fee;
			game.state.save();
			game.state.emit();

		}

		if ( Math.hypot( b.position.x - p.position.x, b.position.z - p.position.z ) < 400 ) p.boardBoat();
		game.toast( `😵 You ran out of air and blacked out · hauled back aboard${ fee ? ` · rescue $${ fee.toLocaleString() }` : '' }. Better scuba gear lets you stay down longer`, 4600 );
		if ( game.combat && game.combat.hud ) game.combat.hud.hurt( 1 );

	}

	// ---- sharks: they patrol the wrecks you dive at (Open Sea and Deadwater), and charge now and then
	updateSharks( dt, under, depth ) {

		const p = this.app.player, pos = p.position;
		// the wreck (or treasure) you're diving at
		let site = null, best = 70;
		if ( under ) {

			for ( const w of this.wrecks ) {

				const d = Math.hypot( w.x - pos.x, w.z - pos.z );
				if ( d < best ) {

					best = d;
					site = w;

				}

			}

			for ( const m of this.log.maps ) {

				const d = Math.hypot( m.x - pos.x, m.z - pos.z );
				if ( d < best ) {

					best = d;
					site = m;

				}

			}

		}

		const want = site ? ( SHARKS[ site.tier ] || 0 ) + ( site.chests ? 0 : 1 ) : 0;
		this.sharks.forEach( ( sh, i ) => {

			if ( i < want && ! sh.active ) this.spawn( sh, site, i );
			if ( ( i >= want || ! site ) && sh.active ) this.park( sh );
			if ( sh.active ) this.swimShark( sh, dt, site );

		} );

	}

	spawn( sh, site, i ) {

		sh.active = true;
		sh.site = site;
		sh.angle = i * 2.1;
		sh.r = 12 + i * 3;
		sh.state = 'circle';
		sh.timer = 4 + Math.random() * 4;
		sh.pos.set( site.x + Math.cos( sh.angle ) * sh.r, site.y + 4, site.z + Math.sin( sh.angle ) * sh.r );
		sh.group.visible = true;

	}

	park( sh ) {

		sh.active = false;
		sh.group.visible = false;

	}

	swimShark( sh, dt, site ) {

		const p = this.app.player, diver = _w.copy( p.position ).setY( p.position.y + 0.6 );
		const toDiver = _v.copy( diver ).sub( sh.pos );
		const dist = toDiver.length();
		sh.timer -= dt;
		let target, speed;
		if ( sh.state === 'circle' ) {

			// round the wreck, at the diver's depth or a little above the bottom
			sh.angle += dt * 0.35;
			const y = Math.max( site.y + 2.5, Math.min( diver.y, p.waterH - 2 ) );
			target = _v.set( site.x + Math.cos( sh.angle ) * sh.r, y, site.z + Math.sin( sh.angle ) * sh.r );
			speed = 2.8;
			if ( sh.timer <= 0 && dist < 22 && this.under ) {

				sh.state = 'charge';
				sh.timer = 4;

			}

		} else if ( sh.state === 'charge' ) {

			target = diver;
			speed = 6.5;
			if ( dist < 1.7 ) this.bite( sh );
			else if ( sh.timer <= 0 ) {

				sh.state = 'circle';
				sh.timer = 5 + Math.random() * 4;

			}

		} else {

			// after a bite: away for a while
			target = _v.copy( sh.pos ).addScaledVector( toDiver.normalize(), - 10 );
			speed = 4;
			if ( sh.timer <= 0 ) {

				sh.state = 'circle';
				sh.timer = 6 + Math.random() * 5;

			}

		}

		// steer smoothly toward the target
		const want = target.clone().sub( sh.pos );
		if ( want.lengthSq() > 1e-4 ) want.normalize().multiplyScalar( speed );
		sh.vel.lerp( want, Math.min( 1, dt * 2.2 ) );
		sh.pos.addScaledVector( sh.vel, dt );
		sh.pos.y = Math.min( sh.pos.y, p.waterH - 1 );
		sh.group.position.copy( sh.pos );
		if ( sh.vel.lengthSq() > 0.01 ) sh.group.lookAt( _w.copy( sh.pos ).add( sh.vel ) );
		sh.phase += dt * ( 3 + sh.vel.length() );
		sh.tail.rotation.y = Math.sin( sh.phase ) * 0.45;

	}

	bite( sh ) {

		const p = this.app.player;
		const airMax = this.stats.airS || 35;
		this.air = Math.max( 0, this.air - Math.max( 8, airMax * SHARK_BITE ) );
		sh.state = 'flee';
		sh.timer = 6 + Math.random() * 3;
		// shoved back by the bite
		const away = _v.copy( p.position ).sub( sh.pos ).setY( 0 );
		if ( away.lengthSq() > 1e-4 ) p.velocity.addScaledVector( away.normalize(), 3 );
		const combat = this.game.combat;
		if ( combat && combat.hud ) combat.hud.hurt( 0.8 );
		if ( this.app.audio && this.app.audio.fishSplash ) this.app.audio.fishSplash( p.position, 0.6 );
		if ( ! this._bitTold ) {

			this._bitTold = true;
			this.game.toast( '🦈 A shark bit you: you lost air! Keep an eye on the sharks round the wrecks', 3600 );

		}

	}

	updateHud( under, depth, airMax, rating ) {

		if ( ! this.el ) return;
		const on = under || ( this.app.player.mode === 'swim' && this.air < airMax - 0.5 );
		if ( this._on !== on ) this.el.classList.toggle( 'is-on', this._on = on );
		if ( ! on ) return;
		const k = this.air / airMax;
		this.barEl.style.width = `${ ( k * 100 ).toFixed( 1 ) }%`;
		this.el.classList.toggle( 'is-low', k < 0.2 );
		const deep = depth > rating;
		this.el.classList.toggle( 'is-deep', deep && under );
		const s = Math.ceil( this.air );
		const sub = `${ Math.floor( s / 60 ) }:${ String( s % 60 ).padStart( 2, '0' ) } of air · ${ Math.round( depth ) } m deep${ deep ? ` · past your gear's ${ rating } m: air going fast!` : ` (gear rated ${ rating } m)` }`;
		if ( this._sub !== sub ) this.subEl.textContent = this._sub = sub;

	}

}
