import { Group, Mesh, Vector3, Quaternion, BoxGeometry } from '../../engine/index.js';
import { LAYERS } from '../../core/SceneRenderer.js';
import { standard } from '../../materials/Materials.js';
import { roofTopY } from '../../world/boat/Wheelhouse.js';
import { SPRAY } from '../../fx/Spray.js';
import { FISH } from '../FishTable.js';
import { rollWeight, pickSpecies } from '../Bites.js';
import { buildGunTurret, buildCannon, buildFlag, buildLightBar } from './WeaponModels.js';
import { DANGER_TIERS, dangerZoneAt, randomInZone, HARBOUR, WORLD_RADIUS } from '../DangerZones.js';

// The other boats on the water. They reuse the player's lobster-boat geometry (shared buffers and
// materials, so a boat costs draw calls but no memory), with their own hull paint per faction and a
// few props: a deck gun, the pirates' black flag, the coast guard's light bar.
//
//   fisher      steams between fishing spots and sits on them a while; sometimes carries a rifle.
//               Honest: attacking one makes you wanted.
//   trader      runs long routes with cash aboard and a machine gun; flees and fires back.
//   pirate      lives in the Danger Waters (red on the map) and only attacks on sight in there, or
//               when you shoot first; bounty on its head (no wanted level for sinking it).
//   coastguard  only out when you are wanted (two stars and up): it hunts you down.
//
// A boat brought to 0 hp is disabled: dead in the water and burning, lootable (G) for a while, then
// it sinks and a new boat comes over the horizon some time later.

export const NPC_TYPES = {
	fisher: {
		label: 'Fishing boat', hp: 70, speed: 5.5, armedChance: 0.35, honest: true,
		gun: { tier: 0, dmg: 3, rate: 0.9, range: 95, spread: 0.05, speed: 200 },
		cash: [ 200, 700 ], fish: [ 1, 4 ],
		names: [ 'Lucky Lou', 'Marlin Mary', 'Sea Biscuit', 'Reel Deal', 'Salty Sue', 'Knot Working', 'Bait & Switch', 'Codfather', 'Fin & Tonic', 'Wet Dream', 'Hooked', 'Tuna Turner' ],
	},
	trader: {
		label: 'Trader', hp: 140, speed: 7.5, armedChance: 1, honest: true,
		gun: { tier: 2, dmg: 2.5, rate: 4, range: 120, spread: 0.055, speed: 220 },
		cash: [ 1200, 3500 ], fish: [ 0, 2 ],
		names: [ 'Island Trader', 'Copra Queen', 'Rum Runner', 'Cargo Cult', 'Tradewind', 'Spice Isle', 'Mangrove Merchant' ],
	},
	pirate: {
		label: 'Pirate', hp: 100, speed: 8.5, armedChance: 1, hostile: true,
		gun: { tier: 2, dmg: 2, rate: 3, range: 120, spread: 0.065, speed: 220 },
		cash: [ 900, 2100 ], fish: [ 0, 2 ], bounty: 1000,
		names: [ 'Black Gull', 'Sea Wolf', 'Bloody Barracuda', 'Rusty Cutlass', 'Widowmaker', 'Salt Reaper', 'Kraken\'s Kiss', 'Mad Morgan' ],
	},
	coastguard: {
		label: 'Coast guard', hp: 230, speed: 11.5, armedChance: 1, law: true,
		gun: { tier: 3, dmg: 3.5, rate: 6, range: 160, spread: 0.05, speed: 240 },
		cannon: { dmg: 18, rate: 0.14, range: 220, splash: 5 },
		cash: [ 200, 600 ], fish: [ 0, 0 ],
		names: [ 'CG Patrol 7', 'CG Vigilant', 'CG Resolute', 'CG Sentinel', 'CG Guardian' ],
	},
};

// hull paint (linear rgb) over the white topsides of the shared hull shader
const PAINT = {
	trader: [ 0.02, 0.085, 0.05 ],
	pirate: [ 0.012, 0.011, 0.012 ],
	coastguard: [ 0.33, 0.36, 0.4 ],
};

const STATIC_BUCKETS = [ 'hull', 'gelcoat', 'wood', 'fittings', 'trap', 'glow', 'glass' ];
export const BOAT_HALF = new Vector3( 1.55, 1.9, 4.15 ); // local OBB half extents (centre y 1.3)
export const BOAT_CENTER_Y = 1.3;

const _v = new Vector3();
const _w = new Vector3();
const _q = new Quaternion();
const rand = ( a, b ) => a + Math.random() * ( b - a );
const pick = ( arr ) => arr[ Math.floor( Math.random() * arr.length ) ];
const wrap = ( a ) => Math.atan2( Math.sin( a ), Math.cos( a ) );

export class NPCBoat {

	constructor( fleet, index ) {

		this.fleet = fleet;
		this.index = index;
		this.group = new Group();
		this.group.name = 'npc-boat-' + index;
		this.group.visible = false;
		const src = fleet.app.boat.meshes;
		this.meshes = {};
		for ( const name of STATIC_BUCKETS ) {

			const s = src[ name ];
			if ( ! s ) continue;
			const m = new Mesh( s.geometry, s.material );
			m.name = 'npc-' + name;
			m.castShadow = name !== 'glass';
			m.receiveShadow = true;
			if ( name === 'trap' || name === 'glass' ) m.layers.set( LAYERS.TRANSPARENT );
			if ( name === 'glass' ) m.renderOrder = 1;
			this.group.add( m );
			this.meshes[ name ] = m;

		}

		if ( src.propeller ) {

			this.prop = new Mesh( src.propeller.geometry, src.propeller.material );
			this.prop.position.copy( src.propeller.position );
			this.group.add( this.prop );

		}

		const roof = roofTopY( 0 );
		// props, switched per type
		this.rifle = buildGunTurret( 0 );
		this.mg = buildGunTurret( 2 );
		this.twin = buildGunTurret( 3 );
		for ( const t of [ this.rifle, this.mg, this.twin ] ) {

			t.root.position.set( 0, roof - 0.02, - 0.35 );
			this.group.add( t.root );

		}

		this.cannon = buildCannon( 2 );
		this.cannon.root.position.set( 0, fleet.foredeckY, 3.0 );
		this.group.add( this.cannon.root );
		this.flag = buildFlag();
		this.flag.position.set( 0.85, roof - 0.02, - 0.85 );
		this.group.add( this.flag );
		this.lightBar = buildLightBar();
		this.lightBar.position.set( 0, roof, 0.25 );
		this.group.add( this.lightBar );
		this.beacons = [ fleet.beaconRed, fleet.beaconBlue ].map( ( mat, i ) => {

			const b = new Mesh( fleet.beaconGeo, mat );
			b.position.set( i ? 0.32 : - 0.32, roof + 0.16, 0.25 );
			this.group.add( b );
			return b;

		} );

		fleet.scene.add( this.group );

		this.pos = new Vector3();
		this.vel = new Vector3();
		this.yaw = 0;
		this.speed = 0;
		this.state = 'inactive';
		this.respawnT = rand( 1, 8 ) * ( index + 1 ) * 0.5;
		this.heave = 0;
		this.pitch = 0;
		this.roll = 0;
		this.list = 0;
		this.sink = 0;
		this.phase = Math.random() * 10;
		this.slot = fleet.allocSlot( 2 );
		this.lastHitT = 99;
		this.burnPts = [ new Vector3( 0.3, 1.2, - 1.2 ), new Vector3( - 0.4, 2.2, 0.2 ), new Vector3( 0.2, 1.0, 2.2 ) ];

	}

	get active() {

		return this.state !== 'inactive';

	}

	get alive() {

		return this.state !== 'inactive' && this.state !== 'disabled' && this.state !== 'sinking';

	}

	get lootable() {

		return this.state === 'disabled' && ! this.looted;

	}

	// ---------------------------------------------------------------- spawning

	spawn( type, at, { tier = 1 } = {} ) {

		const T = NPC_TYPES[ type ];
		this.type = type;
		this.def = T;
		this.tier = tier;
		const k = 1 + 0.4 * ( tier - 1 );
		this.maxHp = Math.round( T.hp * k );
		this.hp = this.maxHp;
		this.gun = T.gun && Math.random() < T.armedChance ? { ...T.gun, dmg: T.gun.dmg * ( 1 + 0.25 * ( tier - 1 ) ) } : null;
		this.cannonDef = T.cannon || ( type === 'pirate' && tier >= 3 ? { dmg: 12, rate: 0.1, range: 180, splash: 4 } : null );
		this.name = pick( T.names ) + ( type === 'pirate' && tier > 1 ? [ '', '', ' (raider)', ' (warlord)' ][ tier ] : '' );
		this.cash = Math.round( rand( T.cash[ 0 ], T.cash[ 1 ] ) * ( type === 'pirate' ? tier : 1 ) );
		// pirates keep to one stretch of danger water
		this.home = type === 'pirate' ? ( dangerZoneAt( at.x, at.z ) || DANGER_TIERS[ 0 ] ) : null;
		// the further out, the richer the pickings
		if ( this.home ) this.cash = Math.round( this.cash * this.home.loot );
		this.fishCargo = [];
		const nf = Math.round( rand( T.fish[ 0 ], T.fish[ 1 ] ) );
		// their catch follows the same odds as yours (open water)
		const water = { shallows: 0.3, reef: 0.4, pier: 0.2, bay: 1, deep: 0.8 };
		for ( let i = 0; i < nf; i ++ ) {

			const s = pickSpecies( water, 12 ) || 'grunt';
			this.fishCargo.push( { species: s, kg: Math.round( rollWeight( s ) * 100 ) / 100 } );

		}

		this.pos.copy( at );
		this.pos.y = 0;
		this.yaw = Math.random() * Math.PI * 2;
		this.speed = 0;
		this.sink = 0;
		this.list = 0;
		this.looted = false;
		this.provoked = false;
		this.crimeLogged = false;
		this.lastHitT = 99;
		this.fireT = rand( 0.5, 2 );
		this.cannonT = rand( 2, 5 );
		this.circleSide = Math.random() < 0.5 ? 1 : - 1;
		this.state = 'cruise';
		this.waypoint = null;
		this.fishT = 0;
		this.stuckT = 0;
		this.lootT = 0;

		// paint and props
		const hullMat = this.fleet.hullMats[ type ];
		if ( this.meshes.hull ) this.meshes.hull.material = hullMat || this.fleet.app.boat.meshes.hull.material;
		this.turret = ! this.gun ? null : this.gun.tier === 0 ? this.rifle : this.gun.tier >= 3 ? this.twin : this.mg;
		for ( const t of [ this.rifle, this.mg, this.twin ] ) t.root.visible = t === this.turret;
		this.cannon.root.visible = !! this.cannonDef;
		this.flag.visible = type === 'pirate';
		this.lightBar.visible = type === 'coastguard';
		for ( const b of this.beacons ) b.visible = type === 'coastguard';
		this.group.visible = true;
		this.pickWaypoint();
		this.pose( 0.016 );

	}

	despawn( delay = rand( 25, 50 ) ) {

		this.state = 'inactive';
		this.group.visible = false;
		this.respawnT = delay;
		this.fleet.onDespawn && this.fleet.onDespawn( this );

	}

	// ---------------------------------------------------------------- navigation

	pickWaypoint() {

		const f = this.fleet;
		if ( this.type === 'pirate' && this.home ) this.waypoint = randomInZone( this.home, f.terrain, this.pos );
		else if ( this.type === 'fisher' ) this.waypoint = f.randomWater( 6, 30, this.pos, 120, 420 );
		else this.waypoint = f.randomWater( 10, 200, this.pos, 250, 700 );

	}

	// steer toward a heading with shallow-water avoidance; returns the heading actually used
	steer( wantYaw, wantSpeed, dt ) {

		const f = this.fleet;
		// look ahead for shallows / land and swing toward the deeper side
		const look = 16 + this.speed * 3.5;
		const depthAt = ( a, d ) => - f.terrain.heightAt( this.pos.x + Math.sin( a ) * d, this.pos.z + Math.cos( a ) * d );
		const ahead = Math.min( depthAt( this.yaw, look ), depthAt( this.yaw, look * 0.5 ) );
		if ( ahead < 3.5 ) {

			const l = depthAt( this.yaw + 0.7, look ), r = depthAt( this.yaw - 0.7, look );
			wantYaw = this.yaw + ( l > r ? 1.2 : - 1.2 );
			if ( ahead < 1.8 ) wantSpeed = Math.min( wantSpeed, 2 );

		}

		// stay inside the play area
		const R = Math.hypot( this.pos.x - HARBOUR.x, this.pos.z - HARBOUR.z );
		if ( R > WORLD_RADIUS - 30 ) wantYaw = Math.atan2( HARBOUR.x - this.pos.x, HARBOUR.z - this.pos.z );

		const d = wrap( wantYaw - this.yaw );
		const turn = 0.42 * Math.min( 1, Math.max( 0.35, this.speed / 4 ) );
		this.yaw = wrap( this.yaw + Math.max( - turn * dt, Math.min( turn * dt, d ) ) );
		// slow for sharp turns
		const sp = wantSpeed * ( 1 - Math.min( 0.5, Math.abs( d ) / Math.PI ) );
		const acc = sp > this.speed ? 1.6 : 2.4;
		this.speed += Math.max( - acc * dt, Math.min( acc * dt, sp - this.speed ) );
		this._turnRate = Math.max( - turn, Math.min( turn, d ) );

	}

	// ---------------------------------------------------------------- per frame

	update( dt, ctx ) {

		if ( this.state === 'inactive' ) return;
		const T = this.def;
		this.lastHitT += dt;
		const toP = _v.set( ctx.playerPos.x - this.pos.x, 0, ctx.playerPos.z - this.pos.z );
		const dist = toP.length();
		this.distToPlayer = dist;
		const bearing = Math.atan2( toP.x, toP.z );
		// pirates: on sight only when you are in the danger waters (a little slack at the edge), or once
		// you have fired on them; the coast guard: whenever you are wanted
		if ( this.provoked && this.type === 'pirate' && dist > 320 ) this.provoked = false;
		// nobody hunts you in a safe zone (the harbour, the sea stations) or ashore
		const hunting = ! ctx.playerSafe && ( ( this.type === 'pirate' && ctx.playerAboard && ( ( ctx.playerZoneLoose && dist < ( this.home ? this.home.aggro : 200 ) ) || this.provoked ) ) || ( this.type === 'coastguard' && ctx.wanted >= 2 ) );

		switch ( this.state ) {

			case 'cruise':
			case 'fish': {

				// the coast guard doesn't come for you in a safe zone: it turns away and leaves (a new patrol
				// sets out once you are back in open water)
				if ( this.type === 'coastguard' && ctx.playerSafe ) {

					this.steer( bearing + Math.PI, T.speed, dt );
					if ( dist > 330 ) this.despawn( rand( 8, 15 ) );
					break;

				}

				if ( hunting ) {

					this.state = 'attack';
					if ( this.type === 'pirate' ) ctx.combat.onAggro( this );
					break;

				}

				if ( this.provoked && T.honest ) {

					this.state = 'flee';
					break;

				}

				if ( this.state === 'fish' ) {

					this.fishT -= dt;
					this.steer( this.yaw, 0, dt );
					if ( this.fishT <= 0 ) {

						this.state = 'cruise';
						this.pickWaypoint();

					}

					break;

				}

				if ( ! this.waypoint ) this.pickWaypoint();
				const w = this.waypoint;
				const dw = Math.hypot( w.x - this.pos.x, w.z - this.pos.z );
				this.steer( Math.atan2( w.x - this.pos.x, w.z - this.pos.z ), T.speed, dt );
				if ( dw < 18 ) {

					if ( this.type === 'fisher' ) {

						this.state = 'fish';
						this.fishT = rand( 20, 50 );

					} else this.pickWaypoint();

				}

				// the coast guard goes home when you are no longer wanted
				if ( this.type === 'coastguard' && ctx.wanted < 2 && dist > 380 ) this.despawn( rand( 8, 15 ) );
				break;

			}

			case 'flee': {

				this.steer( bearing + Math.PI, T.speed * 1.25, dt );
				if ( this.gun && dist < this.gun.range && ctx.playerAboard && ! ctx.playerSafe ) this.shoot( dt, ctx, dist );
				if ( dist > 280 && this.lastHitT > 12 ) {

					this.provoked = false;
					this.state = 'cruise';
					this.pickWaypoint();

				}

				break;

			}

			case 'attack': {

				if ( ! hunting ) {

					this.state = 'cruise';
					this.announced = false;
					this.pickWaypoint();
					break;

				}

				// close in, then circle broadside at 40-70 m
				let want;
				let sp = T.speed;
				if ( dist > 75 ) {

					// lead the target a little
					const lead = Math.min( 3, dist / 20 );
					want = Math.atan2( ctx.playerPos.x + ctx.playerVel.x * lead - this.pos.x, ctx.playerPos.z + ctx.playerVel.z * lead - this.pos.z );

				} else if ( dist < 32 ) {

					want = bearing + Math.PI - this.circleSide * 0.6;

				} else {

					want = bearing + this.circleSide * Math.PI / 2;
					sp = T.speed * 0.75;

				}

				this.steer( want, sp, dt );
				if ( ctx.playerAboard && ! ctx.playerDead ) {

					if ( this.gun && dist < this.gun.range ) this.shoot( dt, ctx, dist );
					if ( this.cannonDef && dist < this.cannonDef.range ) this.shootCannon( dt, ctx, dist );

				}

				break;

			}

			case 'disabled': {

				this.speed = Math.max( 0, this.speed - dt * 2 );
				this.list = Math.min( 0.18, this.list + dt * 0.01 );
				this.lootT -= dt;
				for ( const p of this.burnPts ) ctx.fx.burn( this.group.localToWorld( _w.copy( p ) ), this.looted ? 0.6 : 1, dt );
				if ( this.lootT <= 0 ) this.state = 'sinking';
				break;

			}

			case 'sinking': {

				this.speed = Math.max( 0, this.speed - dt * 2 );
				this.sink += dt * 0.42;
				this.list = Math.min( 0.6, this.list + dt * 0.05 );
				if ( this.sink < 2.5 ) ctx.fx.burn( this.group.localToWorld( _w.copy( this.burnPts[ 1 ] ) ), 0.5, dt );
				if ( this.sink > 1.0 && Math.random() < dt * 4 ) ctx.fx.splash( _w.set( this.pos.x + rand( - 3, 3 ), 0, this.pos.z + rand( - 3, 3 ) ), 0.15 );
				if ( this.sink > 5.5 ) this.despawn( this.type === "coastguard" ? rand( 8, 15 ) : rand( 25, 50 ) );
				break;

			}

		}

		// move
		const fx = Math.sin( this.yaw ), fz = Math.cos( this.yaw );
		this.vel.set( fx * this.speed, 0, fz * this.speed );
		this.pos.addScaledVector( this.vel, dt );
		// bow spray at speed
		if ( this.speed > 4.5 && ctx.fx.spray && this.group.visible && Math.random() < dt * 10 && this.distToPlayer < 260 ) {

			const bow = this.group.localToWorld( _w.set( Math.random() < 0.5 ? 0.9 : - 0.9, 0.1, 3.2 ) );
			ctx.fx.spray.emit( bow, _v.set( fx * this.speed * 0.4, 1.2 + this.speed * 0.12, fz * this.speed * 0.4 ), 14, 0.03, SPRAY.SPRAY, { spread: 0.9, jitter: 0.2, life: 1.0 } );

		}

		// damaged boats smoke
		if ( this.alive && this.hp < this.maxHp * 0.5 ) ctx.fx.smoulder( this.group.localToWorld( _w.set( 0, 2.2, - 0.8 ) ), 1 - this.hp / this.maxHp, dt );

		// coast-guard beacons
		if ( this.type === 'coastguard' ) {

			const on = Math.floor( ( ctx.time + this.phase ) * 3 ) % 2 === 0;
			this.beacons[ 0 ].visible = on && this.alive;
			this.beacons[ 1 ].visible = ! on && this.alive;

		}

		if ( this.prop ) this.prop.rotation.z += this.speed * dt * 6;
		this.pose( dt );

	}

	// heave / pitch from the water under bow and stern (GPU queries), roll from the sea and the turns
	pose( dt ) {

		const f = this.fleet;
		const fx = Math.sin( this.yaw ), fz = Math.cos( this.yaw );
		let hb = 0, hs = 0;
		if ( this.slot >= 0 && f.query ) {

			f.query.setPoint( this.slot, this.pos.x + fx * 3, this.pos.z + fz * 3 );
			f.query.setPoint( this.slot + 1, this.pos.x - fx * 3, this.pos.z - fz * 3 );
			if ( f.query.cpuValid ) {

				const c = f.query.cpu;
				hb = c[ this.slot * 4 ];
				hs = c[ ( this.slot + 1 ) * 4 ];
				if ( ! Number.isFinite( hb ) || Math.abs( hb ) > 8 ) hb = 0;
				if ( ! Number.isFinite( hs ) || Math.abs( hs ) > 8 ) hs = 0;

			}

		} else {

			const t = f.time + this.phase;
			hb = Math.sin( t * 1.1 ) * 0.25;
			hs = Math.sin( t * 1.1 - 0.9 ) * 0.25;

		}

		const k = 1 - Math.exp( - dt * 4 );
		const squat = this.speed * 0.012;
		this.heave += ( ( hb + hs ) * 0.5 - squat - this.heave ) * k;
		this.pitch += ( - Math.atan2( hb - hs, 6 ) - this.speed * 0.006 - this.pitch ) * k;
		const t = f.time + this.phase;
		const rollW = Math.sin( t * 0.85 ) * 0.035 + Math.sin( t * 1.9 ) * 0.012 - ( this._turnRate || 0 ) * this.speed * 0.025;
		this.roll += ( rollW + this.list - this.roll ) * k;
		this.group.position.set( this.pos.x, this.heave - this.sink, this.pos.z );
		this.group.rotation.set( this.pitch - ( this.state === 'sinking' ? this.sink * 0.06 : 0 ), this.yaw, this.roll, 'YXZ' );
		// far boats are not drawn (they still sail)
		const cam = f.app.camera.position;
		this.group.visible = this.state !== 'inactive' && ( this.pos.x - cam.x ) ** 2 + ( this.pos.z - cam.z ) ** 2 < 900 * 900;

	}

	// ---------------------------------------------------------------- weapons

	aimTurret( turret, target, dt ) {

		const local = this.group.worldToLocal( _w.copy( target ) );
		const yaw = Math.atan2( local.x - turret.root.position.x, local.z - turret.root.position.z );
		const flat = Math.hypot( local.x - turret.root.position.x, local.z - turret.root.position.z );
		const pitch = - Math.atan2( local.y - turret.root.position.y, flat );
		turret.yaw.rotation.y += wrap( yaw - turret.yaw.rotation.y ) * Math.min( 1, dt * 6 );
		turret.pitch.rotation.x += ( Math.max( - 0.5, Math.min( 0.25, pitch ) ) - turret.pitch.rotation.x ) * Math.min( 1, dt * 6 );

	}

	shoot( dt, ctx, dist ) {

		const g = this.gun;
		const tgt = _v.copy( ctx.playerPos ).addScaledVector( ctx.playerVel, dist / g.speed );
		tgt.y = 1.2;
		this.aimTurret( this.turret, tgt, dt );
		this.fireT -= dt;
		if ( this.fireT > 0 ) return;
		// bursts: a few shots, then a pause
		this.burst = ( this.burst || 0 ) + 1;
		if ( this.burst > 3 + g.rate ) {

			this.burst = 0;
			this.fireT = rand( 1.4, 2.8 );
			return;

		}

		this.fireT = 1 / g.rate * rand( 0.8, 1.25 );
		const muzzle = this.turret.pitch.localToWorld( _w.copy( this.turret.muzzles[ 0 ] ) );
		const dir = tgt.clone().sub( muzzle ).normalize();
		// worse aim far away and at a fast-moving target
		const spread = g.spread * ( 1 + dist / 100 ) * ( 1 + ctx.playerSpeed / 10 );
		dir.x += ( Math.random() - 0.5 ) * 2 * spread;
		dir.y += ( Math.random() - 0.5 ) * 2 * spread * 0.6;
		dir.z += ( Math.random() - 0.5 ) * 2 * spread;
		dir.normalize();
		ctx.fx.fire( { from: muzzle, vel: dir.multiplyScalar( g.speed ), dmg: g.dmg, owner: 'npc', ownerRef: this, life: g.range * 1.2 / g.speed } );
		ctx.fx.muzzle( muzzle, dir.normalize() );
		ctx.combat.sfx.shot( muzzle, g.tier >= 2 ? 'mg' : 'rifle' );

	}

	shootCannon( dt, ctx, dist ) {

		const c = this.cannonDef;
		const tgt = _v.copy( ctx.playerPos ).addScaledVector( ctx.playerVel, dist / 70 );
		tgt.y = 0.8;
		this.aimTurret( this.cannon, tgt, dt );
		this.cannonT -= dt;
		if ( this.cannonT > 0 ) return;
		this.cannonT = 1 / c.rate * rand( 0.8, 1.3 );
		const muzzle = this.cannon.pitch.localToWorld( _w.copy( this.cannon.muzzles[ 0 ] ) );
		tgt.x += ( Math.random() - 0.5 ) * dist * 0.12;
		tgt.z += ( Math.random() - 0.5 ) * dist * 0.12;
		const vel = ctx.combat.ballistic( muzzle, tgt, 70 );
		if ( ! vel ) return;
		ctx.fx.fire( { from: muzzle, vel, dmg: c.dmg, owner: 'npc', ownerRef: this, kind: 'shell', splash: c.splash, life: 8 } );
		ctx.fx.muzzle( muzzle, vel.clone().normalize(), true );
		ctx.combat.sfx.shot( muzzle, 'cannon' );

	}

	// ---------------------------------------------------------------- damage

	damage( dmg, fromPlayer, ctx ) {

		if ( ! this.alive ) return false;
		this.hp -= dmg;
		this.lastHitT = 0;
		if ( fromPlayer ) {

			if ( ! this.provoked ) ctx.combat.onAttack( this );
			this.provoked = true;
			if ( this.type === 'pirate' || this.type === 'coastguard' ) this.state = 'attack';
			else if ( this.state !== 'flee' ) this.state = 'flee';

		}

		if ( this.hp <= 0 ) {

			this.hp = 0;
			this.state = 'disabled';
			this.lootT = 75;
			ctx.fx.explosion( this.group.localToWorld( _w.set( 0, 1.6, 0 ) ), 1.2 );
			ctx.combat.onDisabled( this, fromPlayer );
			return true;

		}

		return false;

	}

	// segment a -> b (world) against the hull box; returns the hit distance fraction or -1
	intersect( a, b ) {

		_q.copy( this.group.quaternion ).invert();
		const o = this.group.position;
		const A = _v.copy( a ).sub( o ).applyQuaternion( _q );
		const B = _w.copy( b ).sub( o ).applyQuaternion( _q );
		A.y -= BOAT_CENTER_Y; B.y -= BOAT_CENTER_Y;
		return segmentBox( A, B, BOAT_HALF );

	}

}

// slab test: segment A -> B (box-local) against the box |p| <= half; t in [0, 1] or -1
export function segmentBox( A, B, half ) {

	let t0 = 0, t1 = 1;
	for ( const k of [ 'x', 'y', 'z' ] ) {

		const d = B[ k ] - A[ k ];
		if ( Math.abs( d ) < 1e-9 ) {

			if ( Math.abs( A[ k ] ) > half[ k ] ) return - 1;

		} else {

			let ta = ( - half[ k ] - A[ k ] ) / d, tb = ( half[ k ] - A[ k ] ) / d;
			if ( ta > tb ) [ ta, tb ] = [ tb, ta ];
			t0 = Math.max( t0, ta );
			t1 = Math.min( t1, tb );
			if ( t0 > t1 ) return - 1;

		}

	}

	return t0;

}

// The fleet: a fixed pool of boats, respawned over the horizon as they are sunk.
export class NPCFleet {

	constructor( app ) {

		this.app = app;
		this.scene = app.scene;
		this.terrain = app.terrainData;
		this.query = app.query;
		this.time = 0;
		const L = app.boat.lines;
		this.foredeckY = L.sheerY( L.tAtSheerZ( 3.0 ) ) + 0.05;

		// hull paint per faction: the shared hull shader with its white topsides repainted
		this.hullMats = {};
		for ( const [ type, rgb ] of Object.entries( PAINT ) ) {

			try {

				const m = app.boat.materials.createHull( L );
				m.name = 'npcHull-' + type;
				m.surface = m._surface + `
	s.albedo = mix( s.albedo, vec3f( ${ rgb.map( ( v ) => v.toFixed( 4 ) ).join( ', ' ) } ) * ( 1.0 - scum * 0.4 ), aboveStripe * ( 1.0 - cove ) );
`;
				m.underwaterLighting = 'lite';
				this.hullMats[ type ] = m;

			} catch ( e ) {

				console.warn( 'npc hull paint failed', e );

			}

		}

		this.beaconGeo = new BoxGeometry( 0.26, 0.12, 0.2 );
		this.beaconRed = standard( { color: 0x000000, emissive: 0xff1a1a, emissiveIntensity: 60 } );
		this.beaconBlue = standard( { color: 0x000000, emissive: 0x2a5aff, emissiveIntensity: 70 } );

		this.boats = [];
		const POOL = 11;
		for ( let i = 0; i < POOL; i ++ ) this.boats.push( new NPCBoat( this, i ) );

	}

	allocSlot( n ) {

		if ( ! this.query ) return - 1;
		try {

			return this.query.allocate( 'npc' + ( this._slotN = ( this._slotN || 0 ) + 1 ), n );

		} catch ( e ) {

			return - 1;

		}

	}

	// a random point of open water: depth in [minD, maxD], between rMin and rMax from `near`
	randomWater( minD, maxD, near, rMin, rMax ) {

		for ( let i = 0; i < 60; i ++ ) {

			const a = Math.random() * Math.PI * 2, r = rand( rMin, rMax );
			const x = near.x + Math.cos( a ) * r, z = near.z + Math.sin( a ) * r;
			if ( Math.hypot( x - HARBOUR.x, z - HARBOUR.z ) > WORLD_RADIUS - 60 ) continue;
			const d = - this.terrain.heightAt( x, z );
			if ( d >= minD && d <= maxD ) return new Vector3( x, 0, z );

		}

		return new Vector3( 0, 0, 420 );

	}

	update( dt, ctx ) {

		this.time += dt;
		for ( const b of this.boats ) b.update( dt, ctx );
		// boats keep apart
		const B = this.boats;
		for ( let i = 0; i < B.length; i ++ ) for ( let j = i + 1; j < B.length; j ++ ) {

			const a = B[ i ], b = B[ j ];
			if ( ! a.active || ! b.active ) continue;
			const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
			const d = Math.hypot( dx, dz );
			if ( d < 9 && d > 1e-3 ) {

				const push = ( 9 - d ) * 0.5 / d;
				a.pos.x -= dx * push; a.pos.z -= dz * push;
				b.pos.x += dx * push; b.pos.z += dz * push;

			}

		}

	}

}
