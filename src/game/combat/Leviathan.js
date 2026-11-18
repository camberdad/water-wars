import { Group, Mesh, Vector3, CatmullRomCurve3, TubeGeometry } from '../../engine/index.js';
import { prepare, mergePrepared, cylinder, sphere, mat4 } from '../../world/boat/GeoKit.js';
import { standard } from '../../materials/Materials.js';
import { createPropMaterial } from '../GameMaterials.js';
import { Boss, bossPose } from './Boss.js';

// The Leviathan (Water Wars 1.20): a sea monster, the night boss of the Deadwater.
//
// By day she sleeps in the deep. After dark (19:30 to 05:30, your own clock: the time of day in the settings,
// or T to let the day run) her head surfaces on a slow round of the northern Deadwater, eyes glowing, and
// anyone who comes within her reach is hunted: tentacles 23 m long rise out of the sea around the boat.
//
//   rear and slam   a tentacle rears up and leans back (the warning: "steer clear!"), then crashes down
//                   along the line it faces. Under it: 180 damage. Steer out from under it in time.
//   grab            one coils over the gunwale and holds the boat (it hardly moves) while it crushes the
//                   hull (22 hp/s). Shoot it to break free, or wait for it to let go.
//
// One attack at a time: every 4.5 s, down to 3 s once she's badly hurt.
//
// Shoot the tentacles or her head: all of it hurts her (one shared health bar, as with the other bosses).
// A tentacle that takes enough fire is cut and sinks; another rises. More rise the more she's hurt. When
// she dies she sinks thrashing, and everyone who hurt her shares $1,500,000. Like the pirate bosses she's
// shared in multiplayer: her course and her generation come from the wall clock, and the damage from every
// captain's reports. (Each player sees the tentacles that rise around their own boat.) At sunrise she dives
// again, keeping her wounds until her next generation.

export const LEVIATHAN = {
	id: 'leviathan', tier: 3, mapKind: 'monster', hudClass: 'is-monster', icon: '🐙',
	name: 'Leviathan',
	label: 'Sea monster', waters: 'the Deadwater, at night',
	hp: 110000, // (about 70 s of the best guns, never missing)
	lair: { x: 100, z: - 1800 }, // the north of the Deadwater, far from the Kraken's and the Tempest's rounds
	radius: 150,
	speed: 2.2,
	cycleS: 20 * 60,
	aggro: 240, // m from her head: she hunts anyone this close
	chase: 420, // ...and someone who has hurt her, this far
	pool: 1500000,
	mg: { dmg: 0, rate: 0, range: 0, spread: 0, speed: 1 },
	cannon: { dmg: 0, rate: 0, range: 0, splash: 0, speed: 1 },
	half: new Vector3( 8, 6, 11 ), // her head
	centerY: 0,
	outline: [ 8, 10.5 ],
	poseArm: 9,
	model: null, mgs: [], cannons: [], flags: [], burn: [], smokeAt: [ 0, 3, 0 ],
	// the tentacles
	segs: 9, segLen: 2.6, // 23.4 m long
	slam: { dmg: 180, rear: 1.5, reach: 2.4 }, // rear: s of warning; reach: m either side of the boat's hull
	grab: { dps: 22, hold: 9 },
	severHp: 2600, // the damage that cuts a tentacle
};

const TAU = Math.PI * 2;
const _v = new Vector3(), _w = new Vector3();
const rand = ( a, b ) => a + Math.random() * ( b - a );

// night by the clock in the settings (the same hours the night fish bite: Bites.js)
export const isNight = ( hour ) => Number.isFinite( hour ) && ( hour >= 19.5 || hour < 5.5 );

export const leviathanPose = ( t ) => bossPose( t, LEVIATHAN );

// the joints of a tentacle, base to tip: rooted at base (world), facing yaw, each joint bent forward by its
// angle (radians from the one below; 0 = straight up). out: an array of Vector3 (segs + 1)
export function tentacleJoints( base, yaw, angles, segLen = LEVIATHAN.segLen, out = [] ) {

	const fx = Math.sin( yaw ), fz = Math.cos( yaw );
	let a = 0, x = base.x, y = base.y, z = base.z;
	for ( let i = 0; i <= angles.length; i ++ ) {

		( out[ i ] || ( out[ i ] = new Vector3() ) ).set( x, y, z );
		if ( i === angles.length ) break;
		a += angles[ i ];
		const s = Math.sin( a ) * segLen;
		x += fx * s;
		z += fz * s;
		y += Math.cos( a ) * segLen;

	}

	out.length = angles.length + 1;
	return out;

}

// does a tentacle crashing down from base along yaw land on a boat at p (half beam hb, half length hl)?
// It lies along its line out to its length; the boat is hit if any of its hull is within reach of it.
export function slamHits( base, yaw, p, hb, hl, length = LEVIATHAN.segs * LEVIATHAN.segLen, reach = LEVIATHAN.slam.reach ) {

	const fx = Math.sin( yaw ), fz = Math.cos( yaw );
	const dx = p.x - base.x, dz = p.z - base.z;
	const along = dx * fx + dz * fz, side = Math.abs( dx * fz - dz * fx );
	return along > 1 - hl && along < length + hl && side < reach + hb;

}

// closest approach of segments AB and PQ: { d, s } (s: the fraction along AB)
function segSeg( a, b, p, q ) {

	const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
	const vx = q.x - p.x, vy = q.y - p.y, vz = q.z - p.z;
	const wx = a.x - p.x, wy = a.y - p.y, wz = a.z - p.z;
	const A = ux * ux + uy * uy + uz * uz, B = ux * vx + uy * vy + uz * vz, C = vx * vx + vy * vy + vz * vz;
	const D = ux * wx + uy * wy + uz * wz, E = vx * wx + vy * wy + vz * wz;
	const den = A * C - B * B;
	let s = den > 1e-8 ? ( B * E - C * D ) / den : 0;
	s = Math.max( 0, Math.min( 1, s ) );
	let t = C > 1e-8 ? ( B * s + E ) / C : 0;
	t = Math.max( 0, Math.min( 1, t ) );
	s = A > 1e-8 ? Math.max( 0, Math.min( 1, ( B * t - D ) / A ) ) : 0;
	const dx = wx + ux * s - vx * t, dy = wy + uy * s - vy * t, dz = wz + uz * s - vz * t;
	return { d: Math.sqrt( dx * dx + dy * dy + dz * dz ), s };

}

// ---------------------------------------------------------------- her body

const SKIN = { color: 0x4e2236, rough: 0.45 }, BELLY = { color: 0x8a4a58, rough: 0.5 }, DARK = { color: 0x1e0b16, rough: 0.4 };

// value noise (for her mottled hide, painted into the vertex colours)
const hash3 = ( x, y, z ) => {

	const h = Math.sin( x * 127.1 + y * 311.7 + z * 74.7 ) * 43758.5453;
	return h - Math.floor( h );

};

function noise3( x, y, z ) {

	const ix = Math.floor( x ), iy = Math.floor( y ), iz = Math.floor( z );
	const fx = x - ix, fy = y - iy, fz = z - iz;
	const u = fx * fx * ( 3 - 2 * fx ), v = fy * fy * ( 3 - 2 * fy ), w = fz * fz * ( 3 - 2 * fz );
	const l = ( a, b, t ) => a + ( b - a ) * t;
	const c = ( dx, dy, dz ) => hash3( ix + dx, iy + dy, iz + dz );
	return l( l( l( c( 0, 0, 0 ), c( 1, 0, 0 ), u ), l( c( 0, 1, 0 ), c( 1, 1, 0 ), u ), v ), l( l( c( 0, 0, 1 ), c( 1, 0, 1 ), u ), l( c( 0, 1, 1 ), c( 1, 1, 1 ), u ), v ), w );

}

const fbm = ( x, y, z ) => noise3( x, y, z ) * 0.55 + noise3( x * 2.1, y * 2.1, z * 2.1 ) * 0.3 + noise3( x * 4.3, y * 4.3, z * 4.3 ) * 0.15;

// darken and lighten the colours in blotches, with pale freckles; bands: rings along local y (tentacles)
function mottle( g, scale, bands = 0 ) {

	const p = g.attributes.position, col = g.attributes.color;
	for ( let i = 0; i < p.count; i ++ ) {

		const x = p.getX( i ) * scale, y = p.getY( i ) * scale, z = p.getZ( i ) * scale;
		let k = 0.55 + 0.75 * fbm( x, y, z );
		if ( bands ) k *= 0.8 + 0.25 * Math.sin( p.getY( i ) * bands );
		const fr = noise3( x * 5, y * 5, z * 5 ) > 0.8 ? 1.6 : 1;
		col.setXYZ( i, col.getX( i ) * k * fr, col.getY( i ) * k * fr, col.getZ( i ) * k * fr );

	}

	col.needsUpdate = true;
	return g;

}

// a tube along points, tapering from r0 to r1 (an arm)
function taperedTube( points, r0, r1, tubular = 24, radial = 12 ) {

	const curve = new CatmullRomCurve3( points );
	const g = new TubeGeometry( curve, tubular, 1, radial, false );
	const p = g.attributes.position, c = new Vector3();
	for ( let i = 0; i <= tubular; i ++ ) {

		curve.getPointAt( i / tubular, c );
		const r = r0 + ( r1 - r0 ) * ( i / tubular );
		for ( let j = 0; j <= radial; j ++ ) {

			const k = i * ( radial + 1 ) + j;
			p.setXYZ( k, c.x + ( p.getX( k ) - c.x ) * r, c.y + ( p.getY( k ) - c.y ) * r, c.z + ( p.getZ( k ) - c.z ) * r );

		}

	}

	g.computeVertexNormals();
	return g;

}
const GLOW = { color: 0xffffff };

// her head (+Z forward): a tall mantle rising up and swept back out of the sea over a broad face, big
// bulging eyes on its sides, thick arms curling down into the water round it
function headGeometry() {

	const g = [];
	// the mantle: a great bulb leaning back, its crown 11 m up
	g.push( prepare( sphere( 1, 32, 22 ), { ...SKIN, matrix: mat4( 0, 3.2, - 4.5, - 0.55, 0, 0, 6.6, 8.6, 8.4 ) } ) );
	// the face and the throat below it
	g.push( prepare( sphere( 1, 28, 18 ), { ...SKIN, matrix: mat4( 0, 0.8, 3.6, 0, 0, 0, 7.2, 4.6, 6 ) } ) );
	g.push( prepare( sphere( 1, 22, 14 ), { ...BELLY, matrix: mat4( 0, - 1.2, 5.2, 0, 0, 0, 5.4, 2.8, 4.4 ) } ) );
	// ridges down the crown and warts over the mantle
	for ( let i = 0; i < 6; i ++ ) g.push( prepare( sphere( 1, 12, 8 ), { ...DARK, matrix: mat4( 0, 10.6 - i * 1.25, - 3.2 - i * 1.5, - 0.55, 0, 0, 0.7, 0.55, 1.4 ) } ) );
	for ( let i = 0; i < 16; i ++ ) {

		const a = rand( - 2.2, 2.2 ), h = rand( 1, 9 );
		g.push( prepare( sphere( 1, 8, 6 ), { ...DARK, matrix: mat4( Math.sin( a ) * 6 * ( 1 - h / 14 ), h, - 4.5 - h * 0.5 + Math.cos( a ) * 4, 0, 0, 0, rand( 0.3, 0.7 ) ) } ) );

	}

	// eye sockets: heavy lids above and below each eye
	for ( const s of [ - 1, 1 ] ) {

		g.push( prepare( sphere( 1, 16, 10 ), { ...DARK, matrix: mat4( s * 5.4, 3.9, 5.6, 0.2, s * 0.5, s * 0.25, 2.3, 0.75, 1.5 ) } ) );
		g.push( prepare( sphere( 1, 16, 10 ), { ...SKIN, matrix: mat4( s * 5.5, 1.4, 5.7, - 0.1, s * 0.5, 0, 2.2, 0.8, 1.6 ) } ) );
		// the slit pupil, upright, on the front of the eye
		g.push( prepare( sphere( 1, 10, 8 ), { ...DARK, matrix: mat4( s * 6.48, 2.65, 7.08, 0, s * 0.62, 0, 0.18, 1.15, 0.25 ) } ) );

	}

	// eight thick arms arching out of the sea round the face and back down into it
	for ( let i = 0; i < 8; i ++ ) {

		const a = - 1.75 + i * ( 3.5 / 7 ) + rand( - 0.1, 0.1 );
		const sa = Math.sin( a ), ca = Math.cos( a ), out = rand( 0.9, 1.15 ), up = rand( 0.8, 1.3 );
		const at = ( r, y ) => new Vector3( sa * r * out, y, 2.5 + ca * r * out );
		g.push( prepare( taperedTube( [ at( 4.5, - 1.5 ), at( 7.5, 1.6 * up ), at( 11, 2.4 * up ), at( 14, 0.6 ), at( 15.5, - 3 ) ], 1.5, 0.35 ), { ...SKIN } ) );

	}

	return mottle( mergePrepared( g ), 0.45 );

}

// what glows on her (one emissive material): her eyes, and pale spots down the mantle
function eyeGeometry() {

	const g = [];
	for ( const s of [ - 1, 1 ] ) {

		g.push( prepare( sphere( 1, 20, 14 ), { ...GLOW, matrix: mat4( s * 5.6, 2.65, 5.9, 0, s * 0.62, 0, 1.6, 1.25, 1.3 ) } ) );
		for ( let i = 0; i < 5; i ++ ) g.push( prepare( sphere( 1, 8, 6 ), { ...GLOW, matrix: mat4( s * ( 2.6 + i * 0.35 ), 7.6 - i * 1.3, - 4.6 - i * 0.6 + 2.2, 0, 0, 0, 0.22 + 0.04 * i ) } ) );

	}

	return mergePrepared( g );

}

// a segment of a tentacle: a tapering cylinder (skin), and the suckers down the side that faces the prey
// (+Z), which glow faintly (so you can see them coming at night)
function segmentGeometry( i, n, L ) {

	const r = ( k ) => 1.35 * ( 1 - 0.9 * k / n );
	const r0 = r( i ), r1 = i === n - 1 ? 0.06 : r( i + 1 );
	const skin = [], glow = [];
	skin.push( prepare( cylinder( r1, r0, L * 1.06, 14, 2 ), { ...SKIN, matrix: mat4( 0, L * 0.5, 0 ) } ) );
	skin.push( prepare( sphere( r0, 12, 8 ), { ...SKIN } ) );
	// a paler underside where the suckers run
	skin.push( prepare( cylinder( r1 * 0.75, r0 * 0.75, L * 1.02, 10, 1 ), { ...BELLY, matrix: mat4( 0, L * 0.5, Math.max( 0.05, r0 * 0.3 ) ) } ) );
	for ( const k of [ 0.2, 0.5, 0.8 ] ) {

		const rr = r0 + ( r1 - r0 ) * k, rs = Math.max( 0.07, rr * 0.3 );
		glow.push( prepare( sphere( 1, 10, 6 ), { ...GLOW, matrix: mat4( 0, L * k, rr * 0.9, 0, 0, 0, rs, rs, rs * 0.45 ) } ) );

	}

	return { skin: mottle( mergePrepared( skin ), 0.9, 2.4 ), glow: mergePrepared( glow ) };

}

// ---------------------------------------------------------------- the tentacles

class Tentacle {

	constructor( scene, geos, mat, glowMat, cfg ) {

		this.cfg = cfg;
		this.root = new Group();
		this.root.name = 'leviathan-tentacle';
		this.root.visible = false;
		this.segs = [];
		let parent = this.root;
		for ( let i = 0; i < cfg.segs; i ++ ) {

			const s = new Group();
			if ( i ) s.position.y = cfg.segLen;
			s.add( new Mesh( geos[ i ].skin, mat ), new Mesh( geos[ i ].glow, glowMat ) );
			parent.add( s );
			this.segs.push( s );
			parent = s;

		}

		scene.add( this.root );
		this.base = new Vector3();
		this.yaw = 0;
		this.angles = new Array( cfg.segs ).fill( 0 );
		this.want = new Array( cfg.segs ).fill( 0 );
		this.joints = [];
		this.state = 'idle';
		this.rise = 0;
		this.timer = 0;
		this.hurt = 0;
		this.attacks = 0;
		this.phase = Math.random() * TAU;

	}

	get up() {

		return this.state !== 'idle' && this.rise > 0.05;

	}

}

export class Leviathan extends Boss {

	constructor( combat, cfg = LEVIATHAN ) {

		super( combat, cfg );
		this.surf = 0; // 0 in the deep, 1 surfaced
		this.night = false;
		this.hunting = false;
		this.spawnT = 0;
		this._hitPart = null;

		const mat = this.skinMat = createPropMaterial( 'leviathan' );
		// (a faint glow in her hide after dark, so her shape shows against the night sea: update)
		mat.emissive.setHex( 0x2e1238 );
		mat.emissiveIntensity = 0;
		const head = new Mesh( headGeometry(), mat );
		head.name = 'leviathan-head';
		head.castShadow = true;
		this.group.add( head );
		this.eyeMat = standard( { color: 0x000000, emissive: 0xd4ff3a, emissiveIntensity: 9 } );
		this.group.add( new Mesh( eyeGeometry(), this.eyeMat ) );

		const geos = [];
		for ( let i = 0; i < cfg.segs; i ++ ) geos.push( segmentGeometry( i, cfg.segs, cfg.segLen ) );
		this.tentacles = [];
		// (the suckers glow a little: you can see the tentacles coming at night)
		this.suckerMat = standard( { color: 0x000000, emissive: 0x9affd0, emissiveIntensity: 3.5 } );
		for ( let i = 0; i < 6; i ++ ) this.tentacles.push( new Tentacle( this.app.scene, geos, mat, this.suckerMat, cfg ) );

	}

	// she's only there to fight while surfaced
	get active() {

		return this.state !== 'gone' && this.surf > 0.5;

	}

	get alive() {

		return this.state === 'alive' && this.surf > 0.5;

	}

	// shots are checked against her tentacles round the player's boat too, far from her head
	get reach() {

		return 1e9;

	}

	get hour() {

		const s = this.app.settings;
		return s ? s.timeOfDay : 12;

	}

	update( dt, ctx ) {

		const C = this.cfg;
		// (the part a shot hit is set by intersect / splashDist just before its damage; the aim's
		// intersect each frame must not leave one behind for a ram's damage)
		this._hitPart = null;
		const t = this.clock();
		const gen = Math.floor( t / C.cycleS );
		if ( gen !== this.gen ) {

			this.gen = gen;
			this.myDmg = 0;
			this.remote.clear();
			this.provoked = false;
			this.state = 'alive';
			this.sink = 0;

		}

		const P = leviathanPose( t );
		this.yaw = P.yaw;
		this.vel.set( Math.sin( P.yaw ) * C.speed, 0, Math.cos( P.yaw ) * C.speed );
		this.pos.set( P.x, 0, P.z );
		this.lastHitT += dt;
		const dist = this.distToPlayer = Math.hypot( ctx.playerPos.x - this.pos.x, ctx.playerPos.z - this.pos.z );

		// night: up she comes; at sunrise she dives
		const night = isNight( this.hour );
		if ( night !== this.night ) {

			this.night = night;
			if ( ! night && this.surf > 0.5 && dist < 800 && this.state === 'alive' ) this.game.toast( `🐙 The sun's coming up: the ${ C.name } sinks back into the deep`, 4500 );

		}

		const wantSurf = night && this.state !== 'gone' ? 1 : 0;
		this.surf += Math.sign( wantSurf - this.surf ) * Math.min( Math.abs( wantSurf - this.surf ), dt / 6 );

		// the first time out in the Deadwater: what lives there
		const zone = ctx.playerZoneLoose;
		if ( zone && zone.tier === C.tier && ! this.told ) {

			this.told = true;
			this.game.toast( `🐙 Sailors say a ${ C.label.toLowerCase() }, the ${ C.name }, rises in the north of the Deadwater after dark · ${ C.hp.toLocaleString() } hp · $${ C.pool.toLocaleString() } of plunder · the green eye on the minimap at night (set the time of day in the settings, or press T to let the day run)`, 8000 );

		}

		if ( this.alive && this.hp <= 0 ) this.goDown( ctx, false );

		// the hunt: tentacles round the boat of anyone close to her (or who hurt her and hasn't got far)
		const hunt = this.alive && ctx.playerAboard && ! ctx.playerSafe && ! ctx.playerDead && ( dist < C.aggro || ( this.provoked && dist < C.chase ) );
		if ( hunt && ! this.hunting && ! this._huntTold ) {

			this._huntTold = true;
			this.game.toast( `🐙 The ${ C.name } has found you! Her tentacles are rising round the boat: shoot them or her head, and steer clear of any that rears up`, 6000 );

		}

		this.hunting = hunt;
		this.updateTentacles( dt, ctx, hunt );

		if ( this.state === 'sinking' ) {

			this.sink += dt * 0.5;
			if ( Math.random() < dt * 5 && this.sink < 6 ) ctx.fx.splash( _w.set( this.pos.x + rand( - 12, 12 ), 0, this.pos.z + rand( - 14, 14 ) ), rand( 0.4, 1 ) );
			if ( this.sink > 14 ) this.state = 'gone';

		} else if ( this.alive && this.hp < this.maxHp * 0.3 && Math.random() < dt * 2 ) {

			ctx.fx.splash( _w.set( this.pos.x + rand( - 9, 9 ), 0, this.pos.z + rand( - 9, 9 ) ), 0.35 );

		}

		this.pose( dt );
		this.group.position.y += - ( 1 - this.surf ) * 18;
		this.group.visible = this.group.visible && this.surf > 0.01;
		// the eyes: brighter as she's hurt
		this.eyeMat.emissiveIntensity = 7 + 10 * ( 1 - this.hp / this.maxHp );
		this.skinMat.emissiveIntensity = night ? 0.3 * this.surf : 0;
		this.shown = this.surf > 0.05 && this.state !== 'gone';
		this.updateHud( dist );
		this.updateWarn();

	}

	// ---- the tentacles: rise round the boat, sway, rear and slam, or grab; cut ones sink and others rise
	updateTentacles( dt, ctx, hunt ) {

		const C = this.cfg, bc = this.app.boatCtl, combat = this.combat;
		const boat = bc.position;
		const k = this.hp / this.maxHp;
		const want = ! hunt ? 0 : k > 0.66 ? 3 : k > 0.33 ? 4 : 5;
		const gap = k > 0.66 ? 4.5 : k > 0.33 ? 3.7 : 3;
		this.attackT = ( this.attackT || 0 ) - dt;
		const half = combat.hitHalf || _w.set( 1.6, 1, 4 );
		const T = combat.time;
		let up = 0, grabbing = null;
		for ( const tt of this.tentacles ) if ( tt.state !== 'idle' && tt.state !== 'sink' ) {

			up ++;
			if ( tt.state === 'grab' ) grabbing = tt;

		}

		// a new one rises
		this.spawnT -= dt;
		if ( up < want && this.spawnT <= 0 ) {

			const tt = this.tentacles.find( ( x ) => x.state === 'idle' );
			if ( tt ) this.raise( tt, boat, bc );
			this.spawnT = rand( 1.2, 2.2 );

		}

		for ( const tt of this.tentacles ) {

			if ( tt.state === 'idle' ) continue;
			tt.timer -= dt;
			const away = Math.hypot( boat.x - tt.base.x, boat.z - tt.base.z );
			// she lets go when the hunt is off, and leaves behind the ones a boat has outrun
			if ( tt.state !== 'sink' && ( ! hunt || ( away > 42 && tt.state !== 'slam' ) ) ) this.lower( tt );
			const w = tt.want, n = C.segs, ph = tt.phase;
			let rate = 3;
			switch ( tt.state ) {

				case 'rise':
					tt.rise = Math.min( 1, tt.rise + dt / 1.6 );
					if ( Math.random() < dt * 4 ) ctx.fx.splash( tt.base, 0.45 );
					this.sway( w, T, ph );
					if ( tt.rise >= 1 ) {

						tt.state = 'sway';
						tt.timer = rand( 1.5, 3.5 );

					}

					break;
				case 'sway':
					this.sway( w, T, ph );
					// keep facing the boat
					tt.yaw += Math.atan2( Math.sin( Math.atan2( boat.x - tt.base.x, boat.z - tt.base.z ) - tt.yaw ), Math.cos( Math.atan2( boat.x - tt.base.x, boat.z - tt.base.z ) - tt.yaw ) ) * Math.min( 1, dt * 2 );
					if ( tt.timer <= 0 ) {

						if ( tt.attacks >= 2 ) this.lower( tt );
						// one attack at a time (every 4.5 s; 3 s once she's badly hurt): the others wait their turn
						else if ( this.attackT > 0 ) tt.timer = rand( 0.4, 1.2 );
						else if ( ! grabbing && Math.random() < 0.25 && away < 22 ) {

							this.grab( tt, boat, bc );
							this.attackT = gap;

						} else {

							this.attackT = gap;

							tt.state = 'rear';
							tt.timer = C.slam.rear;
							// it faces where the boat is: steer off that line before it falls
							tt.yaw = Math.atan2( boat.x - tt.base.x, boat.z - tt.base.z );

						}

					}

					break;
				case 'rear':
					// up and back, the tip curled: the warning
					w[ 0 ] = - 0.38 + Math.sin( T * 9 + ph ) * 0.03;
					for ( let i = 1; i < n; i ++ ) w[ i ] = i > n - 4 ? 0.28 : - 0.015;
					if ( tt.timer <= 0 ) {

						tt.state = 'slam';
						tt.timer = 0.45;
						tt.hit = false;

					}

					break;
				case 'slam':
					rate = 11;
					w[ 0 ] = 1.5;
					for ( let i = 1; i < n; i ++ ) w[ i ] = 0.02;
					if ( ! tt.hit && ( tt.timer <= 0.12 ) ) {

						tt.hit = true;
						this.slam( tt, ctx, half );

					}

					if ( tt.timer <= 0 ) {

						tt.state = 'lift';
						tt.timer = 1.4;
						tt.attacks ++;

					}

					break;
				case 'lift':
					this.sway( w, T, ph );
					if ( tt.timer <= 0 ) {

						tt.state = 'sway';
						tt.timer = rand( 2, 4.5 );

					}

					break;
				case 'grab': {

					// coiled over the gunwale: the boat is held and crushed
					tt.rise = Math.min( 1, tt.rise + dt / 0.8 );
					w[ 0 ] = 0.5;
					for ( let i = 1; i < n; i ++ ) w[ i ] = 0.33 + Math.sin( T * 3 + i ) * 0.02;
					tt.yaw = Math.atan2( boat.x - tt.base.x, boat.z - tt.base.z );
					if ( ctx.playerAboard && ! ctx.playerSafe ) {

						const hold = Math.exp( - dt * 2.6 );
						bc.velocity.x *= hold;
						bc.velocity.z *= hold;
						// pulled back against the coil
						const d = away - 5;
						if ( d > 0 ) {

							bc.position.x -= ( boat.x - tt.base.x ) / away * d * Math.min( 1, dt * 2 );
							bc.position.z -= ( boat.z - tt.base.z ) / away * d * Math.min( 1, dt * 2 );

						}

						combat.damagePlayer( C.grab.dps * dt );

					}

					if ( tt.timer <= 0 || away > 14 ) this.lower( tt );
					break;

				}

				case 'sink':
					tt.rise = Math.max( 0, tt.rise - dt / ( tt.cut ? 1.1 : 2 ) );
					// cut: limp; otherwise curling as it goes
					for ( let i = 0; i < n; i ++ ) w[ i ] = tt.cut ? 0.25 : 0.12 + Math.sin( T * 2 + ph - i ) * 0.1;
					if ( tt.rise <= 0 ) {

						tt.state = 'idle';
						tt.root.visible = false;

					}

					break;

			}

			const kk = Math.min( 1, dt * rate );
			for ( let i = 0; i < n; i ++ ) tt.angles[ i ] += ( w[ i ] - tt.angles[ i ] ) * kk;
			this.place( tt );

		}

	}

	// a gentle S, leaning toward the boat, the tip curling and uncurling
	sway( w, T, ph ) {

		const n = w.length;
		w[ 0 ] = 0.16 + Math.sin( T * 0.8 + ph ) * 0.1;
		for ( let i = 1; i < n; i ++ ) w[ i ] = 0.07 + Math.sin( T * 1.5 + ph - i * 0.7 ) * 0.12 + ( i > n - 4 ? 0.22 : 0 );

	}

	raise( tt, boat, bc ) {

		// round the boat, more often ahead of her (you sail into them), not on top of another
		const heading = Math.atan2( bc.velocity.x, bc.velocity.z );
		const moving = bc.velocity.lengthSq() > 4;
		for ( let i = 0; i < 12; i ++ ) {

			const a = moving && Math.random() < 0.6 ? heading + rand( - 1.2, 1.2 ) : Math.random() * TAU;
			const d = rand( 10, 15 );
			_v.set( boat.x + Math.sin( a ) * d, - 1.8, boat.z + Math.cos( a ) * d );
			if ( this.tentacles.every( ( o ) => o === tt || ! o.up || Math.hypot( o.base.x - _v.x, o.base.z - _v.z ) > 8 ) ) break;

		}

		tt.base.copy( _v );
		tt.yaw = Math.atan2( boat.x - tt.base.x, boat.z - tt.base.z );
		tt.state = 'rise';
		tt.rise = 0;
		tt.hurt = 0;
		tt.attacks = 0;
		tt.cut = false;
		tt.angles.fill( 0.05 );
		tt.root.visible = true;
		const au = this.app.audio;
		if ( au && au.fishSplash ) au.fishSplash( tt.base, 0.9 );

	}

	grab( tt, boat ) {

		// it rises again right alongside and coils over the gunwale
		const side = Math.random() < 0.5 ? - 1 : 1;
		const yaw = this.app.boatCtl.getYaw ? this.app.boatCtl.getYaw() : 0;
		tt.base.set( boat.x + Math.cos( yaw ) * 5 * side, - 1.8, boat.z - Math.sin( yaw ) * 5 * side );
		tt.yaw = Math.atan2( boat.x - tt.base.x, boat.z - tt.base.z );
		tt.state = 'grab';
		tt.rise = 0;
		tt.timer = this.cfg.grab.hold;
		tt.attacks = 2; // (it lets go and sinks afterwards)
		this.combat.fx.splash( tt.base, 0.8 );
		if ( ! this._grabTold ) {

			this._grabTold = true;
			this.game.toast( '🐙 A tentacle has your boat! Shoot it to break free', 4000 );

		}

	}

	lower( tt ) {

		if ( tt.state === 'idle' || tt.state === 'sink' ) return;
		tt.state = 'sink';

	}

	slam( tt, ctx, half ) {

		const bc = this.app.boatCtl, C = this.cfg;
		const len = C.segs * C.segLen;
		// where it lands: a long line of white water
		for ( let d = 4; d < len; d += 5 ) ctx.fx.splash( _w.set( tt.base.x + Math.sin( tt.yaw ) * d, 0, tt.base.z + Math.cos( tt.yaw ) * d ), 0.7 );
		this.combat.sfx.shot( _w.set( tt.base.x + Math.sin( tt.yaw ) * 12, 0, tt.base.z + Math.cos( tt.yaw ) * 12 ), 'explosion', 1.3 );
		if ( ! ctx.playerAboard || ctx.playerSafe ) return;
		if ( ! slamHits( tt.base, tt.yaw, bc.position, half.x, half.z, len ) ) return;
		this.combat.damagePlayer( C.slam.dmg );
		// knocked away along the blow
		bc.velocity.x += Math.sin( tt.yaw ) * 3;
		bc.velocity.z += Math.cos( tt.yaw ) * 3;
		ctx.fx.splash( bc.position, 1 );
		if ( ! this._slamTold ) {

			this._slamTold = true;
			this.game.toast( `🐙 A tentacle crashed down on your boat (${ C.slam.dmg } damage)! When one rears up, steer out from under it`, 4500 );

		}

	}

	// the meshes from the joint angles (the same chain tentacleJoints walks)
	place( tt ) {

		const C = this.cfg;
		tt.root.position.set( tt.base.x, tt.base.y - ( 1 - tt.rise ) * ( C.segs * C.segLen + 2 ), tt.base.z );
		tt.root.rotation.set( 0, tt.yaw, 0 );
		for ( let i = 0; i < C.segs; i ++ ) tt.segs[ i ].rotation.x = tt.angles[ i ];
		tentacleJoints( tt.root.position, tt.yaw, tt.angles, C.segLen, tt.joints );

	}

	// ---- hits: her head (an ellipsoid round the mantle) and her tentacles (tapering capsules)
	intersect( a, b ) {

		let best = - 1, part = null;
		if ( this.surf > 0.5 ) {

			// the head: a sphere of 8.5 m about the middle of the face and mantle
			const c = _v.set( this.group.position.x, this.group.position.y + 2.5, this.group.position.z );
			const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
			const ox = a.x - c.x, oy = a.y - c.y, oz = a.z - c.z;
			const A = dx * dx + dy * dy + dz * dz, B = ox * dx + oy * dy + oz * dz, Cc = ox * ox + oy * oy + oz * oz - 8.5 * 8.5;
			const disc = B * B - A * Cc;
			if ( disc >= 0 && A > 1e-9 ) {

				const t = ( - B - Math.sqrt( disc ) ) / A;
				if ( t >= 0 && t <= 1 ) {

					best = t;
					part = 'head';

				} else if ( Cc < 0 ) {

					best = 0;
					part = 'head';

				}

			}

		}

		const n = this.cfg.segs;
		for ( const tt of this.tentacles ) {

			if ( ! tt.up || tt.state === 'sink' || tt.joints.length < n + 1 ) continue;
			// cheap reject: the segment's middle far from the tentacle's
			const mid = tt.joints[ n >> 1 ];
			const mx = ( a.x + b.x ) * 0.5 - mid.x, mz = ( a.z + b.z ) * 0.5 - mid.z;
			if ( mx * mx + mz * mz > ( 16 + a.distanceTo( b ) * 0.5 ) ** 2 ) continue;
			for ( let i = 0; i < n; i ++ ) {

				const r = 1.35 * ( 1 - 0.9 * ( i + 0.5 ) / n ) + 0.35;
				const h = segSeg( a, b, tt.joints[ i ], tt.joints[ i + 1 ] );
				if ( h.d < r && ( best < 0 || h.s < best ) ) {

					best = h.s;
					part = tt;

				}

			}

		}

		if ( best >= 0 ) this._hitPart = part;
		return best;

	}

	// how far a shell bursting at point is from her (the head's surface, or the nearest tentacle)
	splashDist( point ) {

		let best = Math.max( 0, Math.hypot( point.x - this.pos.x, point.z - this.pos.z ) - 8 ), part = 'head';
		for ( const tt of this.tentacles ) {

			if ( ! tt.up || tt.state === 'sink' ) continue;
			for ( const j of tt.joints ) {

				const d = Math.max( 0, Math.hypot( point.x - j.x, point.y - j.y, point.z - j.z ) - 1 );
				if ( d < best ) {

					best = d;
					part = tt;

				}

			}

		}

		this._hitPart = part;
		return best;

	}

	damage( dmg, fromPlayer, ctx ) {

		const part = this._hitPart;
		this._hitPart = null;
		if ( ! this.alive || ! ( dmg > 0 ) ) return false;
		if ( part && part !== 'head' && fromPlayer ) {

			part.hurt += dmg;
			if ( part.hurt >= this.cfg.severHp && part.state !== 'sink' ) {

				part.cut = true;
				this.lower( part );
				const fx = ( ctx || this.combat._ctx || {} ).fx || this.combat.fx;
				if ( part.joints.length ) fx.splash( part.joints[ 3 ], 0.9 );
				if ( ! this._cutTold ) {

					this._cutTold = true;
					this.game.toast( '🐙 You cut a tentacle! It sinks away. Another will rise: keep firing', 3500 );

				}

			}

		}

		return super.damage( dmg, fromPlayer, ctx );

	}

	// she's beaten: she rolls and sinks, thrashing, and everyone who hurt her shares the plunder
	goDown( ctx, byMe ) {

		if ( this.state !== 'alive' ) return;
		this.state = 'sinking';
		this.sink = 0;
		const fx = ctx ? ctx.fx : this.combat.fx;
		for ( let i = 0; i < 8; i ++ ) fx.splash( _w.set( this.pos.x + rand( - 14, 14 ), 0, this.pos.z + rand( - 14, 14 ) ), 1 );
		this.combat.sfx.shot( this.pos, 'explosion', 1.6 );
		for ( const tt of this.tentacles ) {

			tt.cut = true;
			this.lower( tt );

		}

		this.pay( `🐙 The ${ this.cfg.name } is dying! She sinks into the deep.` );

	}

	updateWarn() {

		if ( typeof document === 'undefined' ) return;
		if ( ! this.warnEl ) {

			const ui = this.app.ui && this.app.ui.ui;
			this.warnEl = document.createElement( 'div' );
			this.warnEl.className = 'ww-missile';
			( ui ? ( ui.hud || ui.root ) : document.body ).append( this.warnEl );

		}

		let txt = '';
		if ( this.hunting ) {

			if ( this.tentacles.some( ( t ) => t.state === 'grab' ) ) txt = '🐙 Grabbed! Shoot the tentacle';
			else if ( this.tentacles.some( ( t ) => t.state === 'rear' ) ) txt = '🐙 Tentacle rearing · steer clear!';

		}

		const on = !! txt && this.combat.aboard;
		if ( this._warn !== on ) this.warnEl.classList.toggle( 'is-on', this._warn = on );
		if ( on && this._warnTxt !== txt ) this.warnEl.textContent = this._warnTxt = txt;

	}

}
