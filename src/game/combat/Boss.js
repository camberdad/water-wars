import { Group, Mesh, Vector3, Quaternion } from '../../engine/index.js';
import { loadBoatGeometry, boatModelMaterial } from '../Boats.js';
import { buildGunTurret, buildCannon, buildFlag } from './WeaponModels.js';
import { segmentBox } from './NPCBoats.js';
import { hullOutline } from './HullContact.js';

// The boss (Water Wars 1.14): the Iron Kraken, a pirate warship that patrols the Deadwater (danger tier 3).
// She is the deep-sea fishing ship's hull blown up to 34 m, painted black and red and bristling with guns:
// two twin machine guns on the bridge roof and a heavy cannon fore and aft. She has a huge store of hit
// points (85,000: about a minute of fire from a fully upgraded deck gun and rail cannon) and fires back at
// anyone who attacks her or comes too close.
//
// Shared in multiplayer with no host: her course and her generation come from the wall clock (the same
// clock as the waves), so every player sees her in the same place. Each player reports the damage they
// have done to this generation of her (Multiplayer snapshot `bd`); her health is what's left after all of
// it, so the bar goes down for everyone. When she goes down, everyone who hit her shares the plunder by the
// damage they did (a bigger pool the more captains joined in). A new Kraken sails out every CYCLE_S
// seconds after one is sunk (the next generation); one that survives a generation is repaired.

export const BOSS = {
	name: 'Iron Kraken', // ("the Iron Kraken" in sentences)
	label: 'Pirate warship',
	hp: 85000,
	lair: { x: 900, z: 1500 }, // the middle of her patrol circle (about 1,700 m out: the Deadwater)
	radius: 210, // m
	speed: 3.2, // m/s around the circle (a lap is about 7 minutes)
	cycleS: 20 * 60, // s: one generation of her
	aggro: 150, // m: she opens fire on anyone this close, attacked or not
	pool: 600000, // $ of plunder for one captain (more for a crew: see bossPayout)
	mg: { dmg: 4, rate: 7, range: 260, spread: 0.035, speed: 240 },
	cannon: { dmg: 32, rate: 0.22, range: 380, splash: 7, speed: 75 },
	half: new Vector3( 6.2, 6.4, 17.2 ), // hit box half extents (local), centred CENTER_Y up
	centerY: 4.2,
};

// the fitting of her model: the fishing ship's hull at 34 m, black topsides over a red boot stripe
export const BOSS_MODEL = {
	model: 'ship', up: 'y', fwd: 'z', length: 34, beam: 12, draft: 2.4,
	paint: [ [ 0.2, [ 0.09, 0.012, 0.01 ] ], [ 1.0, [ 0.42, 0.02, 0.015 ] ], [ 5.4, [ 0.018, 0.018, 0.02 ] ], [ 99, [ 0.075, 0.07, 0.068 ] ] ],
	deckColor: [ 0.16, 0.11, 0.07 ], deckMinY: 0.25, deckMaxY: 6.8,
};

const TAU = Math.PI * 2;

// which generation of her sails at time t (s on the wall clock)
export const bossGen = ( t ) => Math.floor( t / BOSS.cycleS );

// where she is at time t: on her patrol circle, heading along it (anticlockwise seen from above)
export function bossPose( t ) {

	const w = BOSS.speed / BOSS.radius;
	const a = ( t * w ) % TAU;
	const x = BOSS.lair.x + Math.cos( a ) * BOSS.radius, z = BOSS.lair.z + Math.sin( a ) * BOSS.radius;
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
.ww-boss-name { letter-spacing: 0.08em; text-transform: uppercase; }
.ww-boss-name small { color: var(--tw-ink-3); text-transform: none; letter-spacing: 0; font-weight: 500; margin-left: 6px; }
.ww-boss-bar { position: relative; height: calc(12 * var(--tw-u)); margin-top: 6px; border-radius: 99px; background: rgba(0,0,0,0.45); overflow: hidden; border: 1px solid rgba(255, 90, 74, 0.35); }
.ww-boss-bar > span { position: absolute; inset: 0 auto 0 0; width: 100%; background: linear-gradient(90deg, #8a0f0a, #ff4a3a); transition: width 200ms linear; }
.ww-boss-bar > i { position: absolute; inset: 0 auto 0 0; width: 100%; background: rgba(255, 220, 200, 0.5); transition: width 900ms ease 300ms; }
.ww-boss-sub { margin-top: 4px; font: 500 var(--tw-fs-xs) var(--tw-mono); color: var(--tw-ink-2); }
.gm-mk.is-boss > i { background: #ff2a18; color: #fff; width: calc(20 * var(--tw-u)); height: calc(20 * var(--tw-u)); margin: calc(-10 * var(--tw-u)) 0 0 calc(-10 * var(--tw-u)); box-shadow: 0 0 8px rgba(255, 40, 20, 0.8); }
`;
const SKULL = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-4.4 0-8 3.1-8 7.2 0 2.4 1.2 4.4 3 5.6V19h2v-2h2v2h2v-2h2v2h2v-3.2c1.8-1.2 3-3.2 3-5.6C20 6.1 16.4 3 12 3Zm-3 9.5a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Zm6 0a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Z"/></svg>';

export class Boss {

	constructor( combat ) {

		this.combat = combat;
		this.app = combat.app;
		this.game = combat.game;
		this.name = BOSS.name;
		this.def = { label: BOSS.label };
		this.type = 'boss';
		this.maxHp = BOSS.hp;
		this.half = BOSS.half;
		this.outline = hullOutline( 5.6, 16.6 ); // (the hull at the waterline, for collisions)
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
		g.name = 'boss-iron-kraken';
		g.visible = false;
		this.app.scene.add( g );
		loadBoatGeometry( 'boss-kraken', BOSS_MODEL ).then( ( geo ) => {

			if ( ! geo ) return;
			const m = new Mesh( geo, boatModelMaterial() );
			m.name = 'boss-hull';
			m.castShadow = true;
			m.receiveShadow = true;
			g.add( m );

		} ).catch( ( e ) => console.warn( 'boss model failed', e ) );

		// her guns (fitted to the scaled ship: the bridge roof, the foredeck, the aft deck)
		const mg = ( x, y, z ) => {

			const t = buildGunTurret( 3 );
			t.root.position.set( x, y, z );
			t.root.scale.setScalar( 2.4 );
			g.add( t.root );
			return { t, fireT: rand( 0.5, 2 ), burst: 0 };

		};
		const gun = ( x, y, z, yaw ) => {

			const t = buildCannon( 3 );
			t.root.position.set( x, y, z );
			t.root.rotation.y = yaw;
			t.root.scale.setScalar( 3.0 );
			g.add( t.root );
			return { t, fireT: rand( 2, 5 ) };

		};
		// (heights measured off the scaled model: the bridge roof 11.9 m, the fo'c'sle 8.1 m, the aft working
		// deck 1.05 m, the side decks about 5.3 m above the water)
		this.mgs = [ mg( - 2.2, 11.94, 0 ), mg( 2.2, 11.94, 0 ) ];
		// bow and stern chasers, and a broadside gun each side; each fires only over its own arc (shoot)
		this.cannons = [
			{ ...gun( 0, 8.1, 15.2, 0 ), arc: 'bow' },
			{ ...gun( 0, 1.05, - 11, Math.PI ), arc: 'stern' },
			{ ...gun( 4.4, 5.3, - 3, Math.PI / 2 ), arc: 'port' },
			{ ...gun( - 4.4, 5.3, - 3, - Math.PI / 2 ), arc: 'starboard' },
		];
		for ( const [ x, y, z, s ] of [ [ 0, 11.94, 0.8, 2.4 ], [ 0, 8.1, 16.4, 1.4 ] ] ) {

			const f = buildFlag();
			f.position.set( x, y, z );
			f.scale.setScalar( s );
			g.add( f );

		}

		this.burnPts = [ new Vector3( 2, 5, - 6 ), new Vector3( - 2.5, 10, 2 ), new Vector3( 1.5, 6, 10 ), new Vector3( - 1, 3, - 12 ) ];
		try {

			this.slot = this.app.query.allocate( 'boss', 2 );

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
		this.remote.set( id, Math.max( this.remote.get( id ) || 0, Math.min( BOSS.hp, Math.max( 0, bd[ 1 ] ) ) ) );

	}

	// ---- per frame
	update( dt, ctx ) {

		const t = this.clock();
		const gen = bossGen( t );
		if ( gen !== this.gen ) {

			// a new generation: a fresh (or repaired) Kraken sails her circle
			const was = this.gen, sunk = this.state !== 'alive';
			this.gen = gen;
			this.myDmg = 0;
			this.remote.clear();
			this.provoked = false;
			this.announced = false;
			this.state = 'alive';
			this.sink = 0;
			if ( was !== null && this.distToPlayer < 1500 ) this.game.toast( sunk ? `☠ A new ${ BOSS.name } has sailed into the Deadwater` : `☠ The ${ BOSS.name } has been repaired`, 3600 );

		}

		const P = bossPose( t );
		this.yaw = P.yaw;
		this.vel.set( Math.sin( P.yaw ) * BOSS.speed, 0, Math.cos( P.yaw ) * BOSS.speed );
		this.pos.set( P.x, 0, P.z );
		this.lastHitT += dt;
		const dx = ctx.playerPos.x - this.pos.x, dz = ctx.playerPos.z - this.pos.z;
		const dist = this.distToPlayer = Math.hypot( dx, dz );

		// first time out in the Deadwater: where she is
		const zone = ctx.playerZoneLoose;
		if ( zone && zone.tier >= 3 && ! this.told && this.alive ) {

			this.told = true;
			this.game.toast( `☠ The ${ BOSS.name }, a pirate warship, patrols the Deadwater · ${ BOSS.hp.toLocaleString() } hp · $${ BOSS.pool.toLocaleString() } of plunder · the red skull on the minimap`, 6500 );

		}

		if ( this.alive && this.hp <= 0 ) this.goDown( ctx, false );
		if ( this.alive ) {

			// she fires on anyone who attacked her, and on anyone who comes too close
			const hostile = ( this.provoked || dist < BOSS.aggro ) && ctx.playerAboard && ! ctx.playerSafe && ! ctx.playerDead;
			if ( hostile && ! this.announced ) {

				this.announced = true;
				this.game.toast( `☠ The ${ BOSS.name } opens fire!`, 2600 );

			}

			if ( hostile ) this.shoot( dt, ctx, dist );
			if ( this.hp < this.maxHp * 0.5 ) ctx.fx.smoulder( this.group.localToWorld( _w.set( 0, 12, - 2 ) ), 1 - this.hp / this.maxHp, dt );
			if ( this.hp < this.maxHp * 0.25 ) ctx.fx.burn( this.group.localToWorld( _w.copy( this.burnPts[ 0 ] ) ), 0.6, dt );

		} else if ( this.state === 'sinking' ) {

			this.sink += dt * 0.35;
			for ( const p of this.burnPts ) if ( this.sink < 6 ) ctx.fx.burn( this.group.localToWorld( _w.copy( p ) ), 1, dt );
			if ( Math.random() < dt * 1.5 && this.sink < 5 ) ctx.fx.explosion( this.group.localToWorld( _w.set( rand( - 4, 4 ), rand( 2, 9 ), rand( - 14, 14 ) ) ), 1.1 );
			if ( this.sink > 2 && Math.random() < dt * 6 ) ctx.fx.splash( _w.set( this.pos.x + rand( - 8, 8 ), 0, this.pos.z + rand( - 18, 18 ) ), 0.3 );
			if ( this.sink > 12 ) this.state = 'gone';

		}

		this.pose( dt );
		this.updateHud( dist );

	}

	// heave and pitch from the water under her bow and stern; a slow roll (a big hull hardly moves)
	pose( dt ) {

		const q = this.app.query, fx = Math.sin( this.yaw ), fz = Math.cos( this.yaw );
		let hb = 0, hs = 0;
		if ( q && this.slot >= 0 ) {

			q.setPoint( this.slot, this.pos.x + fx * 13, this.pos.z + fz * 13 );
			q.setPoint( this.slot + 1, this.pos.x - fx * 13, this.pos.z - fz * 13 );
			if ( q.cpuValid ) {

				hb = q.cpu[ this.slot * 4 ];
				hs = q.cpu[ ( this.slot + 1 ) * 4 ];
				if ( ! Number.isFinite( hb ) || Math.abs( hb ) > 8 ) hb = 0;
				if ( ! Number.isFinite( hs ) || Math.abs( hs ) > 8 ) hs = 0;

			}

		}

		const k = 1 - Math.exp( - dt * 1.5 );
		this.heave += ( ( hb + hs ) * 0.5 - this.heave ) * k;
		this.pitch += ( - Math.atan2( hb - hs, 26 ) * 0.6 - this.pitch ) * k;
		const tt = this.combat.time;
		const list = this.state === 'sinking' ? Math.min( 0.35, this.sink * 0.04 ) : 0;
		this.roll += ( Math.sin( tt * 0.4 ) * 0.012 + list - this.roll ) * k;
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
		const M = BOSS.mg, C = BOSS.cannon;
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

		for ( const c of this.cannons ) {

			const tgt = _v.copy( ctx.playerPos ).addScaledVector( ctx.playerVel, dist / C.speed );
			tgt.y = 0.8;
			this.aim( c.t, tgt, dt );
			if ( dist > C.range ) continue;
			// each cannon only fires over its own arc (the bridge is in the way): the chasers over their end,
			// the broadside guns over their side (+x: port)
			const local = this.group.worldToLocal( _w.copy( ctx.playerPos ) );
			const inArc = c.arc === 'bow' ? local.z > - 4 : c.arc === 'stern' ? local.z < 4 : c.arc === 'port' ? local.x > 3 : local.x < - 3;
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

			this.myDmg = Math.min( BOSS.hp, this.myDmg + dmg );
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
		this.state = 'sinking';
		this.sink = 0;
		const fx = ctx ? ctx.fx : this.combat.fx;
		for ( let i = 0; i < 4; i ++ ) fx.explosion( this.group.localToWorld( _w.set( rand( - 4, 4 ), rand( 3, 10 ), rand( - 14, 14 ) ) ), 1.6 );
		this.combat.sfx.shot( this.pos, 'explosion', 1.6 );
		const pay = bossPayout( this.myDmg, [ ...this.remote.values() ] );
		const s = this.game.state;
		if ( pay.cash > 0 ) {

			s.pirate.piratesSunk ++;
			s.pirate.bounties += pay.cash;
			s.earn( pay.cash );
			if ( this.app.audio && this.app.audio.coin ) this.app.audio.coin();
			const crew = pay.captains > 1 ? ` · ${ Math.round( pay.share * 100 ) }% of the damage, shared with ${ pay.captains - 1 } other captain${ pay.captains > 2 ? 's' : '' }` : '';
			this.game.toast( `☠ The ${ BOSS.name } is going down! Plunder: $${ pay.cash.toLocaleString() }${ crew }`, 7000 );

		} else if ( this.distToPlayer < 1500 ) this.game.toast( `☠ Other captains sank the ${ BOSS.name }`, 4000 );

	}

	// segment a -> b (world) against her hit box; the hit fraction or -1
	intersect( a, b ) {

		_q.copy( this.group.quaternion ).invert();
		const o = this.group.position;
		const A = _v.copy( a ).sub( o ).applyQuaternion( _q );
		const B = _w.copy( b ).sub( o ).applyQuaternion( _q );
		A.y -= BOSS.centerY; B.y -= BOSS.centerY;
		return segmentBox( A, B, this.half );

	}

	// ---- HUD: her health bar at the top of the screen while you're near her; her mark on the minimap
	updateHud( dist ) {

		if ( typeof document === 'undefined' ) return;
		if ( ! this.el ) {

			const style = document.createElement( 'style' );
			style.textContent = CSS;
			document.head.append( style );
			const ui = this.app.ui && this.app.ui.ui;
			const root = ui ? ( ui.hud || ui.root ) : document.body;
			this.el = document.createElement( 'div' );
			this.el.className = 'ww-boss tw-glass';
			this.el.innerHTML = `<div class="ww-boss-name">☠ The ${ BOSS.name }<small>${ BOSS.label }</small></div><div class="ww-boss-bar"><i></i><span></span></div><div class="ww-boss-sub"></div>`;
			root.append( this.el );
			this.barEl = this.el.querySelector( '.ww-boss-bar > span' );
			this.lagEl = this.el.querySelector( '.ww-boss-bar > i' );
			this.subEl = this.el.querySelector( '.ww-boss-sub' );

		}

		if ( ! this.mark && this.game.minimap && this.game.minimap.addMarker ) this.mark = this.game.minimap.addMarker( { id: 'boss', kind: 'boss', icon: SKULL, pos: () => this.alive ? this.pos : null } );
		const on = this.state !== 'gone' && ( dist < 700 || this.lastHitT < 10 ) && this.combat.aboard;
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

