import { Group, Mesh, Vector3, Quaternion } from '../../engine/index.js';
import { loadBoatGeometry, boatModelMaterial } from '../Boats.js';
import { buildGunTurret, buildCannon, buildFlag } from './WeaponModels.js';
import { segmentBox } from './NPCBoats.js';
import { hullOutline } from './HullContact.js';
import { MissileBattery } from './Missiles.js';

// Bosses: big pirate ships with a shared health bar.
//
//   Iron Kraken      (Water Wars 1.14) the boss of the Deadwater (danger tier 3): the deep-sea fishing
//                    ship's hull blown up to 34 m, painted black and red, with twin machine guns on the
//                    bridge roof, chasers fore and aft and a broadside gun each side. 85,000 hp (about a
//                    minute of fire from a fully upgraded deck gun and rail cannon), $600,000 of plunder.
//   Black Tempest    (1.17) a second boss of the Deadwater, on her own patrol far from the Kraken's: the
//                    WaveCutter's hull at 28 m, gunmetal grey, with two missile racks. Big, slow missiles that
//                    home on you for a few seconds (Missiles.js): turn hard across their path or outrun
//                    them, or take a massive hit (300). 60,000 hp, $1,000,000 of plunder.
//   Crimson Corsair  (1.15) the mini boss of the Open Sea (tier 2): the old fishing launch's hull at 22 m,
//                    crimson with a gold stripe, a twin machine gun on the wheelhouse and a bow chaser.
//                    45,000 hp, $150,000 of plunder.
//   Leviathan        (1.20) a sea monster, the night boss of the Deadwater: Leviathan.js (a Boss of her own kind)
//
// Each fires back at anyone who attacks her or comes too close. Shared in multiplayer with no host: her
// course and her generation come from the wall clock (the same clock as the waves), so every player sees
// her in the same place. Each player reports the damage they have done to this generation of her
// (Multiplayer snapshot `bd`, by boss id); her health is what's left after all of it, so the bar goes down
// for everyone. When she goes down, everyone who hit her shares the plunder by the damage they did (a
// bigger pool the more captains joined in). A new one sails out at the next generation (every cycleS
// seconds); one that survives a generation is repaired.

export const BOSSES = {
	kraken: {
		id: 'kraken', tier: 3, mapKind: 'boss',
		name: 'Iron Kraken', // ("the Iron Kraken" in sentences)
		label: 'Pirate warship', waters: 'the Deadwater',
		hp: 85000,
		lair: { x: 900, z: 1500 }, // the middle of her patrol circle (about 1,700 m out: the Deadwater)
		radius: 210, // m
		speed: 3.2, // m/s around the circle (a lap is about 7 minutes)
		cycleS: 20 * 60, // s: one generation of her
		aggro: 150, // m: she opens fire on anyone this close, attacked or not
		pool: 600000, // $ of plunder for one captain (more for a crew: see bossPayout)
		mg: { dmg: 4, rate: 7, range: 260, spread: 0.035, speed: 240 },
		cannon: { dmg: 32, rate: 0.22, range: 380, splash: 7, speed: 75 },
		half: new Vector3( 6.2, 6.4, 17.2 ), // hit box half extents (local), centred centerY up
		centerY: 4.2,
		outline: [ 5.6, 16.6 ], // half beam / half length at the waterline (collisions)
		poseArm: 13, // m fore and aft of the middle where the water is read for heave and pitch
		// the fitting of her model: the fishing ship's hull at 34 m, black topsides over a red boot stripe
		model: {
			model: 'ship', up: 'y', fwd: 'z', length: 34, beam: 12, draft: 2.4,
			paint: [ [ 0.2, [ 0.09, 0.012, 0.01 ] ], [ 1.0, [ 0.42, 0.02, 0.015 ] ], [ 5.4, [ 0.018, 0.018, 0.02 ] ], [ 99, [ 0.075, 0.07, 0.068 ] ] ],
			deckColor: [ 0.16, 0.11, 0.07 ], deckMinY: 0.25, deckMaxY: 6.8,
		},
		// (heights measured off the scaled model: the bridge roof 11.9 m, the fo'c'sle 8.1 m, the aft working
		// deck 1.05 m, the side decks about 5.3 m above the water)
		mgs: [ [ - 2.2, 11.94, 0, 2.4 ], [ 2.2, 11.94, 0, 2.4 ] ],
		// [ x, y, z, yaw, arc, scale ]: bow and stern chasers and a broadside gun each side
		cannons: [ [ 0, 8.1, 15.2, 0, 'bow', 3 ], [ 0, 1.05, - 11, Math.PI, 'stern', 3 ], [ 4.4, 5.3, - 3, Math.PI / 2, 'port', 3 ], [ - 4.4, 5.3, - 3, - Math.PI / 2, 'starboard', 3 ] ],
		flags: [ [ 0, 11.94, 0.8, 2.4 ], [ 0, 8.1, 16.4, 1.4 ] ],
		burn: [ [ 2, 5, - 6 ], [ - 2.5, 10, 2 ], [ 1.5, 6, 10 ], [ - 1, 3, - 12 ] ],
		smokeAt: [ 0, 12, - 2 ],
	},
	tempest: {
		id: 'tempest', tier: 3, mapKind: 'boss2',
		name: 'Black Tempest',
		label: 'Pirate missile boat', waters: 'the Deadwater',
		hp: 60000,
		lair: { x: - 1250, z: 1350 }, // about 1,850 m out, the far side of the Deadwater from the Kraken
		radius: 240,
		speed: 4.5,
		cycleS: 20 * 60,
		aggro: 280, // m: she spots you from further off, and her missiles reach further still
		pool: 1000000, // (1.17.1: was $450,000: the biggest prize at sea)
		mg: { dmg: 3, rate: 7, range: 220, spread: 0.04, speed: 230 }, // (close defence)
		cannon: { dmg: 0, rate: 0, range: 0, splash: 0, speed: 70 },
		// big slow missiles, 18 m/s (35 kn; 1.17.1: was 21): they home on you until their fuel runs out after 26 s, but turn at
		// most 0.42 rad/s (24 deg/s, a 50 m circle), so a hard turn across their path near the end makes them
		// overshoot, and a fast boat outruns them. They go off within 8 m of the boat: 300 close in (1.17.1: was 170), nothing
		// 15 m out
		missile: { dmg: 300, radius: 15, speed: 18, turn: 0.42, guide: 26, every: 6.5, range: 560, life: 26, maxOut: 3 },
		half: new Vector3( 4.1, 3.4, 14 ),
		centerY: 2.2,
		outline: [ 3.8, 13.4 ],
		poseArm: 10,
		// the WaveCutter's hull at 28 m (3.3x): gunmetal topsides over a black stripe and a dark red bottom
		model: {
			model: 'wavecutter', up: 'y', fwd: '-z', length: 28, beam: 8.1, draft: 1.49,
			paint: [ [ 0.16, [ 0.07, 0.015, 0.012 ] ], [ 0.66, [ 0.015, 0.015, 0.017 ] ], [ 99, [ 0.16, 0.17, 0.18 ] ] ],
			deckColor: [ 0.09, 0.095, 0.1 ], deckMaxY: 3.6,
		},
		// (measured off the scaled model: the aft side decks 2.75 m, the bow deck 2.8 m, the console top 4.9 m)
		mgs: [ [ 0, 2.77, 10.8, 1.8 ] ],
		cannons: [],
		launchers: [ [ 1.5, 2.75, - 10, 0.35 ], [ - 1.5, 2.75, - 10, - 0.35 ] ], // [ x, y, z, yaw ]: aft, angled outboard
		flags: [ [ 0, 4.91, 1, 1.8 ] ],
		burn: [ [ 1.5, 2.8, - 9 ], [ - 1.2, 3.5, 1 ], [ 1, 2.8, 9 ] ],
		smokeAt: [ 0, 4, - 4 ],
	},
	corsair: {
		id: 'corsair', tier: 2, mapKind: 'miniboss',
		name: 'Crimson Corsair',
		label: 'Pirate gunship', waters: 'the Open Sea',
		hp: 45000, // (1.15.5: was 22,000: too easy)
		lair: { x: - 500, z: 950 }, // about 1,080 m out: the Open Sea
		radius: 160,
		speed: 3.8,
		cycleS: 15 * 60,
		aggro: 160,
		pool: 150000,
		// (1.15.5: harder hitting, about twice the damage: was mg 3 dmg x 6/s, cannon 22 dmg every 5 s)
		mg: { dmg: 5, rate: 8, range: 250, spread: 0.035, speed: 235 },
		cannon: { dmg: 34, rate: 0.3, range: 340, splash: 6, speed: 74 },
		half: new Vector3( 4.3, 4.9, 11 ),
		centerY: 3.8,
		outline: [ 3.9, 10.4 ],
		poseArm: 8,
		// the old fishing launch's hull at 22 m (1.53x): crimson over a gold stripe, black topsides
		model: {
			model: 'oldboat', up: 'y', fwd: 'z', length: 22, beam: 8.7, draft: 1.15,
			paint: [ [ 0.15, [ 0.06, 0.02, 0.015 ] ], [ 0.46, [ 0.85, 0.62, 0.12 ] ], [ 1.76, [ 0.34, 0.015, 0.02 ] ], [ 99, [ 0.05, 0.045, 0.04 ] ] ],
			deckColor: [ 0.14, 0.09, 0.05 ],
		},
		// (measured off the scaled model: the wheelhouse roof flat at 5.45 m from 6 to 8 m aft, the foredeck 2.5 m)
		mgs: [ [ 0, 5.46, - 6.8, 2 ] ],
		cannons: [ [ 0, 2.49, 4.0, 0, 'bow', 2.4 ] ],
		flags: [ [ 1.6, 5.43, - 8, 1.8 ] ],
		burn: [ [ 1.2, 2.5, - 4 ], [ - 1.5, 5.5, - 7 ], [ 1, 2.5, 4 ] ],
		smokeAt: [ 0, 6, - 5 ],
	},
};
export const BOSS = BOSSES.kraken;
export const BOSS_MODEL = BOSS.model;

const TAU = Math.PI * 2;

// which generation of her sails at time t (s on the wall clock)
export const bossGen = ( t, cfg = BOSS ) => Math.floor( t / cfg.cycleS );

// where she is at time t: on her patrol circle, heading along it (anticlockwise seen from above)
export function bossPose( t, cfg = BOSS ) {

	const w = cfg.speed / cfg.radius;
	const a = ( t * w ) % TAU;
	const x = cfg.lair.x + Math.cos( a ) * cfg.radius, z = cfg.lair.z + Math.sin( a ) * cfg.radius;
	// d/dt ( cos a, sin a ) = ( - sin a, cos a ): the heading (yaw about +Y, 0 = +Z)
	return { x, z, yaw: Math.atan2( - Math.sin( a ), Math.cos( a ) ) };

}

// one captain's plunder: the pool grows by half for every other captain who hit her, and is split by the
// damage each did. mine: my damage; others: the damage of every other captain who hit her
export function bossPayout( mine, others = [], pool = BOSS.pool ) {

	const crew = others.filter( ( d ) => d > 0 );
	if ( ! ( mine > 0 ) ) return { cash: 0, share: 0, captains: crew.length };
	const total = mine + crew.reduce( ( a, d ) => a + d, 0 );
	const captains = crew.length + 1;
	const big = pool * ( 1 + 0.5 * ( captains - 1 ) );
	const share = mine / total;
	return { cash: Math.round( big * share / 100 ) * 100, share, captains };

}

const _v = new Vector3(), _w = new Vector3(), _q = new Quaternion();
const rand = ( a, b ) => a + Math.random() * ( b - a );
const wrap = ( a ) => Math.atan2( Math.sin( a ), Math.cos( a ) );

const CSS = /* css */`
.ww-boss { position: absolute; left: 50%; top: calc(var(--tw-edge) + 6 * var(--tw-u)); transform: translateX(-50%); width: min(calc(460 * var(--tw-u)), 70vw);
	padding: var(--tw-2) var(--tw-4) var(--tw-3); border-radius: var(--tw-r-lg); pointer-events: none; opacity: 0; transition: opacity 400ms ease;
	font: 600 var(--tw-fs-sm) var(--tw-font); color: #ffb0a6; text-align: center; }
.ww-boss.is-on { opacity: 1; }
.ww-boss.is-mini { color: #ffc27a; width: min(calc(380 * var(--tw-u)), 64vw); }
.ww-boss-name { letter-spacing: 0.08em; text-transform: uppercase; }
.ww-boss-name small { color: var(--tw-ink-3); text-transform: none; letter-spacing: 0; font-weight: 500; margin-left: 6px; }
.ww-boss-bar { position: relative; height: calc(12 * var(--tw-u)); margin-top: 6px; border-radius: 99px; background: rgba(0,0,0,0.45); overflow: hidden; border: 1px solid rgba(255, 90, 74, 0.35); }
.ww-boss-bar > span { position: absolute; inset: 0 auto 0 0; width: 100%; background: linear-gradient(90deg, #8a0f0a, #ff4a3a); transition: width 200ms linear; }
.ww-boss.is-mini .ww-boss-bar { border-color: rgba(255, 170, 70, 0.4); }
.ww-boss.is-mini .ww-boss-bar > span { background: linear-gradient(90deg, #8a3a0a, #ff9a3a); }
.ww-boss-bar > i { position: absolute; inset: 0 auto 0 0; width: 100%; background: rgba(255, 220, 200, 0.5); transition: width 900ms ease 300ms; }
.ww-boss-sub { margin-top: 4px; font: 500 var(--tw-fs-xs) var(--tw-mono); color: var(--tw-ink-2); }
.gm-mk.is-boss > i { background: #ff2a18; color: #fff; width: calc(20 * var(--tw-u)); height: calc(20 * var(--tw-u)); margin: calc(-10 * var(--tw-u)) 0 0 calc(-10 * var(--tw-u)); box-shadow: 0 0 8px rgba(255, 40, 20, 0.8); }
.gm-mk.is-boss2 > i { background: #8a2aff; color: #fff; width: calc(20 * var(--tw-u)); height: calc(20 * var(--tw-u)); margin: calc(-10 * var(--tw-u)) 0 0 calc(-10 * var(--tw-u)); box-shadow: 0 0 8px rgba(150, 60, 255, 0.85); }
.ww-boss.is-tempest { color: #d6b8ff; }
.ww-boss.is-tempest .ww-boss-bar { border-color: rgba(170, 110, 255, 0.45); }
.ww-boss.is-tempest .ww-boss-bar > span { background: linear-gradient(90deg, #3a0f7a, #a46aff); }
.ww-missile { position: absolute; left: 50%; top: calc(var(--tw-edge) + 92 * var(--tw-u)); transform: translateX(-50%); padding: 4px 14px; border-radius: 999px;
	background: rgba(200, 20, 10, 0.75); color: #fff; font: 700 var(--tw-fs-sm) var(--tw-font); letter-spacing: 0.08em; text-transform: uppercase; pointer-events: none;
	opacity: 0; transition: opacity 150ms; animation: ww-mblink 0.5s steps(2) infinite; }
.ww-missile.is-on { opacity: 1; }
@keyframes ww-mblink { 50% { background: rgba(120, 10, 5, 0.75); } }
.ww-boss.is-monster { color: #b8ffd0; }
.ww-boss.is-monster .ww-boss-bar { border-color: rgba(120, 255, 170, 0.4); }
.ww-boss.is-monster .ww-boss-bar > span { background: linear-gradient(90deg, #0d5a3a, #4ae89a); }
.gm-mk.is-monster > i { background: #0f9a5a; color: #e4ff7a; width: calc(20 * var(--tw-u)); height: calc(20 * var(--tw-u)); margin: calc(-10 * var(--tw-u)) 0 0 calc(-10 * var(--tw-u)); box-shadow: 0 0 8px rgba(80, 255, 150, 0.85); }
.gm-mk.is-miniboss > i { background: #ff8a1a; color: #fff; width: calc(17 * var(--tw-u)); height: calc(17 * var(--tw-u)); margin: calc(-8.5 * var(--tw-u)) 0 0 calc(-8.5 * var(--tw-u)); box-shadow: 0 0 6px rgba(255, 140, 20, 0.8); }
`;
// (1.20: the Leviathan's mark: a slit eye)
const EYE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5C6.5 5 2.4 9.3 1 12c1.4 2.7 5.5 7 11 7s9.6-4.3 11-7c-1.4-2.7-5.5-7-11-7Zm0 11.5c-1.1 0-1.6-2-1.6-4.5s.5-4.5 1.6-4.5 1.6 2 1.6 4.5-.5 4.5-1.6 4.5Z"/></svg>';
const SKULL = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-4.4 0-8 3.1-8 7.2 0 2.4 1.2 4.4 3 5.6V19h2v-2h2v2h2v-2h2v2h2v-3.2c1.8-1.2 3-3.2 3-5.6C20 6.1 16.4 3 12 3Zm-3 9.5a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Zm6 0a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Z"/></svg>';
let _css = false;

export class Boss {

	constructor( combat, cfg = BOSS ) {

		this.combat = combat;
		this.app = combat.app;
		this.game = combat.game;
		this.cfg = cfg;
		this.id = cfg.id;
		this.name = cfg.name;
		this.def = { label: cfg.label };
		this.type = 'boss';
		this.maxHp = cfg.hp;
		this.half = cfg.half;
		this.outline = hullOutline( cfg.outline[ 0 ], cfg.outline[ 1 ] ); // (the hull at the waterline, for collisions)
		this.pos = new Vector3();
		this.vel = new Vector3();
		this.yaw = 0;
		this.gen = null;
		this.state = 'alive'; // 'alive' | 'sinking' | 'gone'
		this.myDmg = 0;
		this.remote = new Map(); // peer id -> damage they did to this generation
		this.provoked = false;
		this.announced = false;
		this.sink = 0;
		this.heave = 0;
		this.pitch = 0;
		this.roll = 0;
		this.lastHitT = 99;
		this.distToPlayer = Infinity;

		// the ship: built at once, the hull mesh added when its model has loaded
		const g = this.group = new Group();
		g.name = 'boss-' + cfg.id;
		g.visible = false;
		this.app.scene.add( g );
		if ( cfg.model ) loadBoatGeometry( 'boss-' + cfg.id, cfg.model ).then( ( geo ) => {

			if ( ! geo ) return;
			const m = new Mesh( geo, boatModelMaterial() );
			m.name = 'boss-hull';
			m.castShadow = true;
			m.receiveShadow = true;
			g.add( m );

		} ).catch( ( e ) => console.warn( 'boss model failed', e ) );

		// her guns (fitted to the scaled ship)
		this.mgs = cfg.mgs.map( ( [ x, y, z, s ] ) => {

			const t = buildGunTurret( 3 );
			t.root.position.set( x, y, z );
			t.root.scale.setScalar( s );
			g.add( t.root );
			return { t, fireT: rand( 0.5, 2 ), burst: 0 };

		} );
		// each cannon fires only over its own arc (shoot)
		this.cannons = cfg.cannons.map( ( [ x, y, z, yaw, arc, s ] ) => {

			const t = buildCannon( 3 );
			t.root.position.set( x, y, z );
			t.root.rotation.y = yaw;
			t.root.scale.setScalar( s );
			g.add( t.root );
			return { t, arc, fireT: rand( 2, 5 ) };

		} );
		for ( const [ x, y, z, s ] of cfg.flags ) {

			const f = buildFlag();
			f.position.set( x, y, z );
			f.scale.setScalar( s );
			g.add( f );

		}

		this.burnPts = cfg.burn.map( ( p ) => new Vector3().fromArray( p ) );
		this.missiles = cfg.missile ? new MissileBattery( this, cfg.missile, cfg.launchers || [] ) : null;
		try {

			this.slot = this.app.query.allocate( 'boss-' + cfg.id, 2 );

		} catch ( e ) {

			this.slot = - 1;

		}

	}

	clock() {

		return Date.now() / 1000;

	}

	// what's left of her: her hit points less everyone's damage to this generation
	get totalDmg() {

		let d = this.myDmg;
		for ( const v of this.remote.values() ) d += v;
		return d;

	}

	get hp() {

		return Math.max( 0, this.maxHp - this.totalDmg );

	}

	get active() {

		return this.state !== 'gone';

	}

	get alive() {

		return this.state === 'alive';

	}

	// how far from her middle a shot can hit her (cheap rejects in Combat)
	get reach() {

		return this.half.z;

	}

	// how far a shell bursting at point is from her hull (splash damage): from the nearest point of her
	// centre line (her hull is long), less her half beam
	splashDist( point ) {

		const lx = point.x - this.pos.x, lz = point.z - this.pos.z, fx = Math.sin( this.yaw ), fz = Math.cos( this.yaw );
		const along = Math.max( - this.half.z + 2, Math.min( this.half.z - 2, lx * fx + lz * fz ) );
		return Math.max( 0, Math.hypot( lx - fx * along, lz - fz * along ) - this.half.x );

	}

	get captains() {

		let n = this.myDmg > 0 ? 1 : 0;
		for ( const v of this.remote.values() ) if ( v > 0 ) n ++;
		return n;

	}

	// ---- multiplayer: what we report, and the reports of others
	netState() {

		return this.gen !== null && this.myDmg > 0 ? [ this.gen, Math.round( this.myDmg ) ] : null;

	}

	remoteDamage( id, bd ) {

		if ( ! Array.isArray( bd ) || bd[ 0 ] !== this.gen || ! Number.isFinite( bd[ 1 ] ) ) return;
		// (only ever up: a report that arrives late never undoes damage)
		this.remote.set( id, Math.max( this.remote.get( id ) || 0, Math.min( this.cfg.hp, Math.max( 0, bd[ 1 ] ) ) ) );

	}

	// ---- per frame
	update( dt, ctx ) {

		const C = this.cfg;
		const t = this.clock();
		const gen = bossGen( t, C );
		if ( gen !== this.gen ) {

			// a new generation: a fresh (or repaired) ship sails her circle
			const was = this.gen, sunk = this.state !== 'alive';
			this.gen = gen;
			this.myDmg = 0;
			this.remote.clear();
			this.provoked = false;
			this.announced = false;
			this.state = 'alive';
			this.sink = 0;

		}

		const P = bossPose( t, C );
		this.yaw = P.yaw;
		this.vel.set( Math.sin( P.yaw ) * C.speed, 0, Math.cos( P.yaw ) * C.speed );
		this.pos.set( P.x, 0, P.z );
		this.lastHitT += dt;
		const dx = ctx.playerPos.x - this.pos.x, dz = ctx.playerPos.z - this.pos.z;
		const dist = this.distToPlayer = Math.hypot( dx, dz );

		// the first time out in her waters: where she is
		const zone = ctx.playerZoneLoose;
		if ( zone && zone.tier === C.tier && ! this.told && this.alive ) {

			this.told = true;
			const mark = C.mapKind === 'boss' ? 'the red skull' : C.mapKind === 'boss2' ? 'the purple skull' : 'the orange skull';
			this.game.toast( `☠ The ${ C.name }, a ${ C.label.toLowerCase() }, patrols ${ C.waters } · ${ C.hp.toLocaleString() } hp · $${ C.pool.toLocaleString() } of plunder · ${ mark } on the minimap`, 6500 );

		}

		if ( this.alive && this.hp <= 0 ) this.goDown( ctx, false );
		// she fires on anyone who attacked her, and on anyone who comes too close
		const hostile = this.alive && ( this.provoked || dist < C.aggro ) && ctx.playerAboard && ! ctx.playerSafe && ! ctx.playerDead;
		if ( this.missiles ) this.missiles.update( dt, ctx, hostile, dist );
		if ( this.alive ) {

			if ( hostile ) this.shoot( dt, ctx, dist );
			if ( this.hp < this.maxHp * 0.5 ) ctx.fx.smoulder( this.group.localToWorld( _w.fromArray( C.smokeAt ) ), 1 - this.hp / this.maxHp, dt );
			if ( this.hp < this.maxHp * 0.25 ) ctx.fx.burn( this.group.localToWorld( _w.copy( this.burnPts[ 0 ] ) ), 0.6, dt );

		} else if ( this.state === 'sinking' ) {

			const L = C.half.z * 0.8, W = C.half.x * 0.6;
			this.sink += dt * 0.35;
			for ( const p of this.burnPts ) if ( this.sink < 6 ) ctx.fx.burn( this.group.localToWorld( _w.copy( p ) ), 1, dt );
			if ( Math.random() < dt * 1.5 && this.sink < 5 ) ctx.fx.explosion( this.group.localToWorld( _w.set( rand( - W, W ), rand( 2, C.centerY * 2 ), rand( - L, L ) ) ), 1.1 );
			if ( this.sink > 2 && Math.random() < dt * 6 ) ctx.fx.splash( _w.set( this.pos.x + rand( - W * 2, W * 2 ), 0, this.pos.z + rand( - L, L ) ), 0.3 );
			if ( this.sink > 12 ) this.state = 'gone';

		}

		this.pose( dt );
		this.updateHud( dist );

	}

	// heave and pitch from the water under her bow and stern; a slow roll (a big hull hardly moves)
	pose( dt ) {

		const q = this.app.query, fx = Math.sin( this.yaw ), fz = Math.cos( this.yaw ), arm = this.cfg.poseArm;
		let hb = 0, hs = 0;
		if ( q && this.slot >= 0 ) {

			q.setPoint( this.slot, this.pos.x + fx * arm, this.pos.z + fz * arm );
			q.setPoint( this.slot + 1, this.pos.x - fx * arm, this.pos.z - fz * arm );
			if ( q.cpuValid ) {

				hb = q.cpu[ this.slot * 4 ];
				hs = q.cpu[ ( this.slot + 1 ) * 4 ];
				if ( ! Number.isFinite( hb ) || Math.abs( hb ) > 8 ) hb = 0;
				if ( ! Number.isFinite( hs ) || Math.abs( hs ) > 8 ) hs = 0;

			}

		}

		const k = 1 - Math.exp( - dt * 1.5 );
		this.heave += ( ( hb + hs ) * 0.5 - this.heave ) * k;
		this.pitch += ( - Math.atan2( hb - hs, arm * 2 ) * 0.6 - this.pitch ) * k;
		const tt = this.combat.time;
		const list = this.state === 'sinking' ? Math.min( 0.35, this.sink * 0.04 ) : 0;
		this.roll += ( Math.sin( tt * 0.4 + this.cfg.tier ) * 0.012 + list - this.roll ) * k;
		this.group.position.set( this.pos.x, this.heave - this.sink, this.pos.z );
		this.group.rotation.set( this.pitch - ( this.state === 'sinking' ? this.sink * 0.02 : 0 ), this.yaw, this.roll, 'YXZ' );
		const cam = this.app.camera.position;
		this.group.visible = this.state !== 'gone' && ( this.pos.x - cam.x ) ** 2 + ( this.pos.z - cam.z ) ** 2 < 1600 * 1600;

	}

	// ---- her guns: twin machine guns in bursts, heavy cannons lobbing shells
	aim( turret, target, dt ) {

		const local = this.group.worldToLocal( _w.copy( target ) );
		const r = turret.root;
		const lx = local.x - r.position.x, lz = local.z - r.position.z;
		const yaw = Math.atan2( lx, lz ) - r.rotation.y;
		const pitch = - Math.atan2( local.y - r.position.y, Math.hypot( lx, lz ) );
		turret.yaw.rotation.y += wrap( yaw - turret.yaw.rotation.y ) * Math.min( 1, dt * 4 );
		turret.pitch.rotation.x += ( Math.max( - 0.5, Math.min( 0.3, pitch ) ) - turret.pitch.rotation.x ) * Math.min( 1, dt * 4 );

	}

	shoot( dt, ctx, dist ) {

		const fx = ctx.fx, combat = this.combat;
		const M = this.cfg.mg, C = this.cfg.cannon;
		for ( const g of this.mgs ) {

			const tgt = _v.copy( ctx.playerPos ).addScaledVector( ctx.playerVel, dist / M.speed );
			tgt.y = 1.2;
			this.aim( g.t, tgt, dt );
			if ( dist > M.range ) continue;
			g.fireT -= dt;
			if ( g.fireT > 0 ) continue;
			g.burst ++;
			if ( g.burst > 8 ) {

				g.burst = 0;
				g.fireT = rand( 1.2, 2.4 );
				continue;

			}

			g.fireT = 1 / M.rate * rand( 0.8, 1.2 );
			const muzzle = g.t.pitch.localToWorld( _w.copy( g.t.muzzles[ g.burst % g.t.muzzles.length ] ) );
			const dir = tgt.clone().sub( muzzle ).normalize();
			const spread = M.spread * ( 1 + dist / 150 ) * ( 1 + ctx.playerSpeed / 12 );
			dir.x += ( Math.random() - 0.5 ) * 2 * spread;
			dir.y += ( Math.random() - 0.5 ) * 2 * spread * 0.6;
			dir.z += ( Math.random() - 0.5 ) * 2 * spread;
			dir.normalize();
			fx.fire( { from: muzzle, vel: dir.clone().multiplyScalar( M.speed ), dmg: M.dmg, owner: 'npc', ownerRef: this, life: M.range * 1.2 / M.speed } );
			fx.muzzle( muzzle, dir );
			combat.sfx.shot( muzzle, 'mg' );

		}

		const reach = this.cfg.half.z * 0.25, wide = this.cfg.half.x * 0.5;
		for ( const c of this.cannons ) {

			const tgt = _v.copy( ctx.playerPos ).addScaledVector( ctx.playerVel, dist / C.speed );
			tgt.y = 0.8;
			this.aim( c.t, tgt, dt );
			if ( dist > C.range ) continue;
			// each cannon only fires over its own arc (the bridge is in the way): the chasers over their end,
			// the broadside guns over their side (+x: port). A lone bow chaser covers all round.
			const local = this.group.worldToLocal( _w.copy( ctx.playerPos ) );
			const lone = this.cannons.length === 1;
			const inArc = lone || ( c.arc === 'bow' ? local.z > - reach : c.arc === 'stern' ? local.z < reach : c.arc === 'port' ? local.x > wide : local.x < - wide );
			if ( ! inArc ) continue;
			c.fireT -= dt;
			if ( c.fireT > 0 ) continue;
			c.fireT = 1 / C.rate * rand( 0.8, 1.3 );
			const muzzle = c.t.pitch.localToWorld( _w.copy( c.t.muzzles[ 0 ] ) );
			tgt.x += ( Math.random() - 0.5 ) * dist * 0.08;
			tgt.z += ( Math.random() - 0.5 ) * dist * 0.08;
			const vel = combat.ballistic( muzzle, tgt, C.speed );
			if ( ! vel ) continue;
			fx.fire( { from: muzzle, vel, dmg: C.dmg, owner: 'npc', ownerRef: this, kind: 'shell', splash: C.splash, life: 9 } );
			fx.muzzle( muzzle, vel.clone().normalize(), true );
			combat.sfx.shot( muzzle, 'cannon', 1.3 );

		}

	}

	// ---- damage (Combat.onImpact, splash, ramming)
	damage( dmg, fromPlayer, ctx ) {

		if ( ! this.alive || ! ( dmg > 0 ) ) return false;
		this.lastHitT = 0;
		if ( fromPlayer ) {

			this.myDmg = Math.min( this.cfg.hp, this.myDmg + dmg );
			this.provoked = true;

		}

		if ( this.hp <= 0 ) {

			this.goDown( ctx, fromPlayer );
			return true;

		}

		return false;

	}

	// she's beaten: down she goes, and everyone who hit her shares the plunder
	goDown( ctx, byMe ) {

		if ( ! this.alive ) return;
		const C = this.cfg;
		this.state = 'sinking';
		this.sink = 0;
		const fx = ctx ? ctx.fx : this.combat.fx;
		const L = C.half.z * 0.8, W = C.half.x * 0.6;
		for ( let i = 0; i < 4; i ++ ) fx.explosion( this.group.localToWorld( _w.set( rand( - W, W ), rand( 2, C.centerY * 2.2 ), rand( - L, L ) ) ), 1.6 );
		this.combat.sfx.shot( this.pos, 'explosion', 1.6 );
		this.pay( `☠ The ${ C.name } is going down!` );

	}

	// everyone who hit her shares the plunder (by the damage they did)
	pay( headline ) {

		const C = this.cfg;
		const pay = bossPayout( this.myDmg, [ ...this.remote.values() ], C.pool );
		const s = this.game.state;
		if ( pay.cash > 0 ) {

			s.pirate.piratesSunk ++;
			s.pirate.bounties += pay.cash;
			s.earn( pay.cash );
			if ( this.app.audio && this.app.audio.coin ) this.app.audio.coin();
			const crew = pay.captains > 1 ? ` · ${ Math.round( pay.share * 100 ) }% of the damage, shared with ${ pay.captains - 1 } other captain${ pay.captains > 2 ? 's' : '' }` : '';
			this.game.toast( `${ headline } Plunder: $${ pay.cash.toLocaleString() }${ crew }`, 7000 );

		} else if ( this.distToPlayer < 1500 ) this.game.toast( `${ C.icon || '☠' } Other captains ${ C.model ? 'sank' : 'killed' } the ${ C.name }`, 4000 );

	}

	// segment a -> b (world) against her hit box; the hit fraction or -1
	intersect( a, b ) {

		_q.copy( this.group.quaternion ).invert();
		const o = this.group.position;
		const A = _v.copy( a ).sub( o ).applyQuaternion( _q );
		const B = _w.copy( b ).sub( o ).applyQuaternion( _q );
		A.y -= this.cfg.centerY; B.y -= this.cfg.centerY;
		return segmentBox( A, B, this.half );

	}

	// ---- HUD: her health bar at the top of the screen while you're near her; her mark on the minimap
	updateHud( dist ) {

		if ( typeof document === 'undefined' ) return;
		const C = this.cfg;
		if ( ! this.el ) {

			if ( ! _css ) {

				_css = true;
				const style = document.createElement( 'style' );
				style.textContent = CSS;
				document.head.append( style );

			}

			const ui = this.app.ui && this.app.ui.ui;
			const root = ui ? ( ui.hud || ui.root ) : document.body;
			this.el = document.createElement( 'div' );
			this.el.className = 'ww-boss tw-glass' + ( C.hudClass ? ' ' + C.hudClass : C.mapKind === 'miniboss' ? ' is-mini' : C.mapKind === 'boss2' ? ' is-tempest' : '' );
			this.el.innerHTML = `<div class="ww-boss-name">${ C.icon || '☠' } The ${ C.name }<small>${ C.label }</small></div><div class="ww-boss-bar"><i></i><span></span></div><div class="ww-boss-sub"></div>`;
			root.append( this.el );
			this.barEl = this.el.querySelector( '.ww-boss-bar > span' );
			this.lagEl = this.el.querySelector( '.ww-boss-bar > i' );
			this.subEl = this.el.querySelector( '.ww-boss-sub' );

		}

		if ( ! this.mark && this.game.minimap && this.game.minimap.addMarker ) this.mark = this.game.minimap.addMarker( { id: 'boss-' + C.id, kind: C.mapKind, icon: C.mapKind === 'monster' ? EYE : SKULL, pos: () => this.alive ? this.pos : null } );
		if ( this.missiles ) {

			if ( ! this.warnEl ) {

				const ui = this.app.ui && this.app.ui.ui;
				this.warnEl = document.createElement( 'div' );
				this.warnEl.className = 'ww-missile';
				( ui ? ( ui.hud || ui.root ) : document.body ).append( this.warnEl );

			}

			const p = this.combat.app.boatCtl.position;
			let near = Infinity;
			for ( const m of this.missiles.flying ) near = Math.min( near, Math.hypot( m.pos.x - p.x, m.pos.z - p.z ) );
			const warn = near < 400 && this.combat.aboard;
			if ( this._warn !== warn ) this.warnEl.classList.toggle( 'is-on', this._warn = warn );
			if ( warn ) {

				const txt = `🚀 Missile incoming · ${ Math.round( near ) } m`;
				if ( this._warnTxt !== txt ) this.warnEl.textContent = this._warnTxt = txt;

			}

		}

		const on = this.state !== 'gone' && this.shown !== false && ( dist < 700 || this.lastHitT < 10 ) && this.combat.aboard;
		if ( this._on !== on ) {

			this._on = on;
			this.el.classList.toggle( 'is-on', on );

		}

		if ( ! on ) return;
		const k = this.hp / this.maxHp;
		const w = `${ ( k * 100 ).toFixed( 2 ) }%`;
		if ( this._w !== w ) {

			this._w = w;
			this.barEl.style.width = w;
			this.lagEl.style.width = w;

		}

		const n = this.captains;
		const sub = this.state === 'sinking' ? 'going down…' : `${ Math.ceil( this.hp ).toLocaleString() } / ${ this.maxHp.toLocaleString() } hp${ n > 1 ? ` · ${ n } captains attacking` : '' }${ this.myDmg > 0 ? ` · your damage ${ Math.round( this.myDmg ).toLocaleString() }` : '' }`;
		if ( this._sub !== sub ) this.subEl.textContent = this._sub = sub;

	}

}
