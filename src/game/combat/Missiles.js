import { Mesh, Vector3, Quaternion } from '../../engine/index.js';
import { prepare, mergePrepared, cylinder, sphere, box, mat4 } from '../../world/boat/GeoKit.js';
import { createPropMaterial } from '../GameMaterials.js';
import { standard } from '../../materials/Materials.js';

// Missiles (Water Wars 1.17): the Black Tempest's weapon. Big and slow (slower than a fast boat), they climb
// out of the launch racks, then home on the player for `guide` seconds (all their fuel), turning at most `turn`
// rad/s, so they overshoot a boat that turns hard across their path near the end, and come round again. They go off near the boat (a proximity fuse) or when they hit the
// sea or run out of fuel: a huge blast that does `dmg` at its centre, falling off to nothing at `radius`. So
// they are dodged by turning hard across their path near the end, or by outrunning them in a fast boat; the
// deck gun can also shoot one down. Every player's Tempest fires at that player alone (no multiplayer sync).

const _v = new Vector3(), _w = new Vector3(), _q = new Quaternion();
const Z = new Vector3( 0, 0, 1 );
const CRUISE_Y = 6; // m above the sea while they close in
const FUSE = 8; // m from the boat: the proximity fuse
// m: inside this the missile is committed: its guidance locks and it flies straight at where the boat was (a
// boat moving across its path gets away). Once it has flown past and out to LOCK x 1.8 it comes round again
export const LOCK = 30;

let _geo = null, _mat = null, _glow = null, _glowGeo = null;
function missileGeometry() {

	if ( _geo ) return _geo;
	const parts = [];
	const add = ( geo, style, m ) => parts.push( prepare( geo, { ...style, matrix: m } ) );
	const BODY = { color: 0x8a8f92, rough: 0.45, metal: 0.6 }, DARK = { color: 0x1b1d1f, rough: 0.6, metal: 0.4 }, RED = { color: 0xb3140f, rough: 0.5 };
	// along +Z (nose forward): a 4 m body, a red warhead, a black nose, four tail fins
	add( cylinder( 0.32, 0.32, 3.2, 14 ), BODY, mat4( 0, 0, 0, Math.PI / 2 ) );
	add( cylinder( 0.08, 0.32, 1.0, 14 ), RED, mat4( 0, 0, 2.1, Math.PI / 2 ) );
	add( sphere( 0.09, 8, 6 ), DARK, mat4( 0, 0, 2.6 ) );
	add( cylinder( 0.3, 0.22, 0.4, 14 ), DARK, mat4( 0, 0, - 1.8, Math.PI / 2 ) );
	for ( let i = 0; i < 4; i ++ ) {

		const a = i * Math.PI / 2;
		add( box( 0.05, 0.6, 0.7 ), DARK, mat4( Math.cos( a ) * 0.5, Math.sin( a ) * 0.5, - 1.3, 0, 0, a ) );

	}

	_geo = mergePrepared( parts );
	_mat = createPropMaterial( 'missile' );
	_glowGeo = mergePrepared( [ prepare( sphere( 0.26, 10, 8 ), { color: 0xffffff } ) ] );
	_glow = standard( { color: 0x000000, emissive: 0xff8a2a, emissiveIntensity: 90 } );
	return _geo;

}

// the launch racks on the boat (local, boat frame): a box of four tubes each side, angled up and outboard
export function buildLauncher() {

	const parts = [];
	const add = ( geo, style, m ) => parts.push( prepare( geo, { ...style, matrix: m } ) );
	const GREY = { color: 0x50565a, rough: 0.6, metal: 0.5 }, DARK = { color: 0x111213, rough: 0.7 };
	add( box( 1.6, 0.4, 1.6 ), GREY, mat4( 0, 0.2, 0 ) ); // the turntable base
	add( box( 1.5, 1.5, 4.2 ), GREY, mat4( 0, 1.5, 0, - 0.5, 0, 0 ) ); // the tube box, raised 30 degrees
	for ( const [ x, y ] of [ [ - 0.36, - 0.36 ], [ 0.36, - 0.36 ], [ - 0.36, 0.36 ], [ 0.36, 0.36 ] ] ) add( cylinder( 0.3, 0.3, 0.06, 14 ), DARK, mat4( x, 1.5 + y * Math.cos( 0.5 ), 2.1 * Math.cos( 0.5 ) + y * Math.sin( 0.5 ), Math.PI / 2 - 0.5 ) );
	return new Mesh( mergePrepared( parts ), createPropMaterial( 'launcher' ) );

}

class Missile {

	constructor( scene ) {

		this.mesh = new Mesh( missileGeometry(), _mat );
		this.mesh.castShadow = true;
		this.glow = new Mesh( _glowGeo, _glow );
		this.glow.position.set( 0, 0, - 2.05 );
		this.mesh.add( this.glow );
		this.mesh.visible = false;
		scene.add( this.mesh );
		this.pos = new Vector3();
		this.vel = new Vector3();
		this.alive = false;
		this.t = 0;
		this.name = 'missile';

	}

	// the deck gun hits it: it goes off where it is, harmless to the boat if it's far enough away
	damage( dmg, fromPlayer, ctx ) {

		if ( ! this.alive ) return false;
		this.battery.explode( this, ctx, true );
		return true;

	}

}

export class MissileBattery {

	// boss: the Boss carrying them; cfg: { dmg, radius, speed, turn, guide, every, range, life, maxOut }
	constructor( boss, cfg, launchers ) {

		this.boss = boss;
		this.cfg = cfg;
		this.app = boss.app;
		this.launchers = launchers.map( ( [ x, y, z, yaw ] ) => {

			const m = buildLauncher();
			m.position.set( x, y, z );
			m.rotation.y = yaw;
			m.castShadow = true;
			boss.group.add( m );
			return m;

		} );
		this.pool = [];
		for ( let i = 0; i < cfg.maxOut + 1; i ++ ) {

			const ms = new Missile( this.app.scene );
			ms.battery = this;
			this.pool.push( ms );

		}

		this.fireT = 3;
		this.next = 0;
		this.warned = 0;

	}

	get flying() {

		return this.pool.filter( ( m ) => m.alive );

	}

	// per frame: launch while hostile; fly every missile in the air (they fly on even if she sinks)
	update( dt, ctx, hostile, dist ) {

		const C = this.cfg;
		this.fireT -= dt;
		if ( hostile && dist < C.range && this.fireT <= 0 && this.flying.length < C.maxOut ) this.launch( ctx );
		for ( const m of this.pool ) if ( m.alive ) this.fly( m, dt, ctx );

	}

	launch( ctx ) {

		const C = this.cfg;
		const m = this.pool.find( ( x ) => ! x.alive );
		if ( ! m ) return;
		this.fireT = C.every * ( 0.85 + Math.random() * 0.3 );
		const L = this.launchers[ this.next ++ % this.launchers.length ];
		L.updateWorldMatrix( true, false );
		L.localToWorld( m.pos.set( 0, 1.9, 1.9 ) );
		// out of the tube: up and outboard, then it turns toward its target
		_w.set( 0, 0.5, 0.86 ).transformDirection( L.matrixWorld );
		m.vel.copy( _w ).multiplyScalar( C.speed * 0.45 );
		m.t = 0;
		m.locked = false;
		m.alive = true;
		m.mesh.visible = true;
		ctx.fx.muzzle( m.pos, _w, true );
		ctx.fx.explosion( m.pos, 0.35 );
		this.boss.combat.sfx.shot( m.pos, 'cannon', 1.5 );
		const now = this.boss.combat.time;
		if ( now - this.warned > 8 ) {

			this.warned = now;
			this.boss.game.toast( `🚀 The ${ this.boss.cfg.name } fired a missile! Turn hard across its path to dodge it, or outrun it`, 3600 );

		}

	}

	fly( m, dt, ctx ) {

		const C = this.cfg;
		m.t += dt;
		const sp = Math.min( C.speed, C.speed * ( 0.45 + 0.55 * m.t / 1.2 ) );
		// guidance: steer toward the player (no lead: it chases), at most C.turn rad/s, for C.guide seconds
		const tgt = ctx.playerPos;
		const dx = tgt.x - m.pos.x, dz = tgt.z - m.pos.z, flat = Math.hypot( dx, dz );
		const d3 = Math.hypot( dx, tgt.y + 1.2 - m.pos.y, dz );
		if ( ! m.locked && d3 < LOCK && m.t > 0.8 ) {

			// the final run: straight at the boat as it is now
			m.locked = true;
			m.vel.set( dx, tgt.y + 1.2 - m.pos.y, dz ).setLength( sp );

		}
		else if ( m.locked && d3 > LOCK * 1.8 ) m.locked = false;
		if ( m.t > 0.8 && m.t < C.guide && ! m.locked && ctx.playerAboard && ! ctx.playerSafe ) {

			// cruise a few metres up, then dive onto the boat over the last stretch
			const wantY = flat > 35 ? CRUISE_Y : 0.8;
			_v.set( dx, wantY - m.pos.y, dz ).normalize();
			_w.copy( m.vel ).normalize();
			const ang = Math.acos( Math.max( - 1, Math.min( 1, _w.dot( _v ) ) ) );
			const step = Math.min( 1, C.turn * dt / Math.max( ang, 1e-4 ) );
			_w.lerp( _v, step ).normalize();
			m.vel.copy( _w ).multiplyScalar( sp );

		} else if ( m.t >= C.guide ) {

			// burnt out: on it goes, sinking slowly toward the sea
			m.vel.y -= 2.5 * dt;

		} else m.vel.setLength( sp );

		m.pos.addScaledVector( m.vel, dt );
		_q.setFromUnitVectors( Z, _w.copy( m.vel ).normalize() );
		m.mesh.position.copy( m.pos );
		m.mesh.quaternion.copy( _q );
		ctx.fx.trail( _v.copy( m.pos ).addScaledVector( _w, - 2.1 ), m.vel, dt );
		// fuses: near the boat, the sea, out of fuel
		const boat = ctx.playerPos;
		const near = ctx.playerAboard && Math.hypot( m.pos.x - boat.x, m.pos.y - 1.2, m.pos.z - boat.z ) < FUSE;
		if ( near || m.pos.y < 0.2 || m.t > C.life ) this.explode( m, ctx, false );

	}

	explode( m, ctx, shotDown ) {

		if ( ! m.alive ) return;
		const C = this.cfg, combat = this.boss.combat;
		m.alive = false;
		m.mesh.visible = false;
		ctx.fx.explosion( m.pos, shotDown ? 1.6 : 2.4 );
		if ( m.pos.y < 3 ) ctx.fx.splash( m.pos, 1 );
		combat.sfx.shot( m.pos, 'explosion', 1.8 );
		if ( shotDown ) this.boss.game.toast( '🚀 Missile shot down!', 1600 );
		// the blast: full damage close in, nothing at C.radius; a shove away from it
		if ( ! ctx.playerAboard || ctx.playerSafe ) return;
		const bc = this.app.boatCtl;
		const d = Math.hypot( bc.position.x - m.pos.x, ( bc.position.y + 1 ) - m.pos.y, bc.position.z - m.pos.z );
		if ( d >= C.radius ) return;
		// (full damage out to the fuse distance: a missile that reaches the boat hits it squarely, for C.dmg)
		const k = Math.min( 1, Math.max( 0, 1 - ( d - FUSE ) / ( C.radius - FUSE ) ) );
		combat.damagePlayer( C.dmg * k );
		_v.set( bc.position.x - m.pos.x, 0, bc.position.z - m.pos.z );
		if ( _v.lengthSq() > 1e-4 ) bc.velocity.addScaledVector( _v.normalize(), 4 * k );
		bc.angular.x += ( Math.random() - 0.5 ) * 0.6 * k;
		bc.angular.z += ( Math.random() - 0.5 ) * 0.8 * k;
		if ( k > 0.4 ) this.boss.game.toast( '💥 Missile hit!', 1400 );

	}

	// segment a -> b (a player's shot) against the missiles in the air: { t, m } or null
	intersect( a, b ) {

		let best = null;
		const ab = _v.copy( b ).sub( a ), L2 = ab.lengthSq();
		if ( L2 < 1e-8 ) return null;
		for ( const m of this.pool ) {

			if ( ! m.alive ) continue;
			const t = Math.max( 0, Math.min( 1, _w.copy( m.pos ).sub( a ).dot( ab ) / L2 ) );
			const px = a.x + ab.x * t - m.pos.x, py = a.y + ab.y * t - m.pos.y, pz = a.z + ab.z * t - m.pos.z;
			if ( px * px + py * py + pz * pz < 1.6 * 1.6 && ( ! best || t < best.t ) ) best = { t, m };

		}

		return best;

	}

}
