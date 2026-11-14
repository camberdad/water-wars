import { Vector3, Quaternion } from '../../engine/index.js';
import { roofTopY } from '../../world/boat/Wheelhouse.js';
import { WORLD } from '../../world/WorldLayout.js';
import { FISH, fishValue, fishLengthCm } from '../FishTable.js';
import { CombatFX } from './CombatFX.js';
import { CombatSFX } from './CombatSFX.js';
import { NPCFleet, NPC_TYPES, BOAT_HALF, BOAT_CENTER_Y, segmentBox } from './NPCBoats.js';
import { buildGunTurret, buildCannon } from './WeaponModels.js';
import { CombatHUD } from './CombatHUD.js';

// Water Wars' combat layer on top of the fishing game:
//   at the helm   left mouse fires the deck gun (it overheats), right mouse the bow cannon (shells)
//   G             loot a disabled boat alongside (cash, fish, shells)
//   U             harbour services when the boat is by the pier (repairs, shells, upgrades, sell fish)
// Sinking honest boats (fishers, traders) or firing on the coast guard raises your wanted level;
// from two stars the coast guard comes for you. Pirates carry a bounty. If your hull goes to zero
// you lose your catch and part of your money, and start again at the pier.

const _v = new Vector3();
const _w = new Vector3();
const _a = new Vector3();
const _q = new Quaternion();
const FWD = new Vector3( 0, 0, - 1 );
const BULLET_SPEED = 260;
const SHELL_SPEED = 85;
const POPULATION = { fisher: 3, trader: 1, pirate: 2 };
const DOCK_RADIUS = 45;

const wrap = ( a ) => Math.atan2( Math.sin( a ), Math.cos( a ) );

export class Combat {

	constructor( game ) {

		this.game = game;
		const app = this.app = game.app;
		this.state = game.state;
		this.fx = new CombatFX( { scene: app.scene, spray: app.spray, terrain: app.terrainData } );
		this.fx.onImpact = ( p, point, target ) => this.onImpact( p, point, target );
		this.sfx = new CombatSFX( app );
		this.fleet = new NPCFleet( app );
		this.time = 0;

		// the player's guns
		this.gun = null;
		this.cannon = null;
		this._gunTier = - 1;
		this._cannonTier = - 1;
		this.heat = 0;
		this.overheated = false;
		this.gunT = 0;
		this.cannonT = 0;
		this.barrel = 0;
		this.firedT = 99;
		this.aim = new Vector3();
		this.aimTarget = null;

		this.dead = false;
		this.deadT = 0;
		this.hurtT = 99;
		this.crimeT = 0;
		this.loot = null;
		this.atDock = false;
		this.hud = null;
		this.dockVendor = { name: 'Harbour office', kind: 'dock', greeting: 'Repairs, shells, upgrades, and Joe takes your catch off the boat.' };
		const L = app.boat.lines;
		this.foredeckY = L.sheerY( L.tAtSheerZ( 3.0 ) ) + 0.05;
		this.applyGear();

	}

	// ---------------------------------------------------------------- gear

	applyGear() {

		const u = this.state.upgrades, boat = this.app.boat.group;
		if ( ( u.gun | 0 ) !== this._gunTier ) {

			if ( this.gun ) this.gun.dispose();
			this._gunTier = u.gun | 0;
			this.gun = buildGunTurret( this._gunTier );
			this.gun.root.position.set( 0, roofTopY( 0 ) - 0.02, - 0.4 );
			boat.add( this.gun.root );

		}

		if ( ( u.cannon | 0 ) !== this._cannonTier ) {

			if ( this.cannon ) this.cannon.dispose();
			this.cannon = null;
			this._cannonTier = u.cannon | 0;
			if ( this._cannonTier > 0 ) {

				this.cannon = buildCannon( this._cannonTier );
				this.cannon.root.position.set( 0, this.foredeckY, 3.0 );
				boat.add( this.cannon.root );

			}

		}

	}

	// ---------------------------------------------------------------- helpers

	get aboard() {

		const m = this.app.player.mode;
		return m === 'boat' || m === 'deck';

	}

	get atHelm() {

		return this.app.player.mode === 'boat' && ! this.app.freeCam;

	}

	// launch velocity to hit `to` from `from` at `speed` (low arc); null when out of reach
	ballistic( from, to, speed ) {

		const dx = to.x - from.x, dz = to.z - from.z;
		const d = Math.hypot( dx, dz ), dy = to.y - from.y, g = 9.81, v2 = speed * speed;
		const disc = v2 * v2 - g * ( g * d * d + 2 * dy * v2 );
		const ang = disc < 0 ? Math.PI / 4 : Math.atan( ( v2 - Math.sqrt( disc ) ) / ( g * Math.max( d, 1e-3 ) ) );
		const h = Math.cos( ang ) * speed / Math.max( d, 1e-3 );
		return new Vector3( dx * h, Math.sin( ang ) * speed, dz * h );

	}

	aimTurret( group, turret, target, dt, minPitch = - 0.9, maxPitch = 0.35 ) {

		const local = group.worldToLocal( _w.copy( target ) );
		const p = turret.root.position;
		const yaw = Math.atan2( local.x - p.x, local.z - p.z );
		const pitch = - Math.atan2( local.y - p.y - 0.45, Math.hypot( local.x - p.x, local.z - p.z ) );
		turret.yaw.rotation.y += wrap( yaw - turret.yaw.rotation.y ) * Math.min( 1, dt * 14 );
		turret.pitch.rotation.x += ( Math.max( minPitch, Math.min( maxPitch, pitch ) ) - turret.pitch.rotation.x ) * Math.min( 1, dt * 14 );

	}

	playerBoxHit( a, b ) {

		const bc = this.app.boatCtl;
		_q.copy( bc.quaternion ).invert();
		const A = _v.copy( a ).sub( bc.position ).applyQuaternion( _q );
		const B = _w.copy( b ).sub( bc.position ).applyQuaternion( _q );
		A.y -= BOAT_CENTER_Y; B.y -= BOAT_CENTER_Y;
		return segmentBox( A, B, BOAT_HALF );

	}

	// ---------------------------------------------------------------- per frame

	update( dt ) {

		const app = this.app, game = this.game, s = this.state, p = app.player, inp = app.input, bc = app.boatCtl;
		this.time += dt;
		if ( ! this.hud && game.hud ) this.hud = new CombatHUD( app.ui.ui, this );
		const aboard = this.aboard;
		const panelOpen = game.hud && ( game.hud.invOpen || game.hud.standOpen || game.hud.catchOpen );

		// ---- the fleet
		const ctx = this._ctx || ( this._ctx = { fx: this.fx, combat: this, playerVel: new Vector3(), playerPos: new Vector3() } );
		ctx.playerPos.copy( aboard ? bc.position : p.position );
		ctx.playerVel.copy( aboard ? bc.velocity : _v.set( 0, 0, 0 ) );
		ctx.playerSpeed = aboard ? bc.velocity.length() : 0;
		ctx.playerAboard = aboard && ! this.dead;
		ctx.playerDead = this.dead;
		ctx.wanted = s.wanted;
		ctx.time = this.time;
		this.manageSpawns( dt, ctx.playerPos );
		this.fleet.update( dt, ctx );
		if ( aboard ) this.collideBoats( dt );

		// ---- the player's guns
		this.gunT -= dt;
		this.cannonT -= dt;
		this.firedT += dt;
		const st = s.stats;
		this.heat = Math.max( 0, this.heat - st.coolRate * dt * ( this.overheated ? 1.3 : 1 ) );
		if ( this.overheated && this.heat < 0.3 ) this.overheated = false;
		const helm = this.atHelm && ! this.dead;
		if ( helm ) {

			this.computeAim( st );
			this.aimTurret( app.boat.group, this.gun, this.aim, dt );
			if ( this.cannon ) this.aimTurret( app.boat.group, this.cannon, this.aim, dt, - 0.6, 0.12 );
			const lmb = inp.mouseDown && inp.enabled && ! panelOpen;
			const rmb = inp.rightDown && inp.enabled && ! panelOpen;
			if ( lmb && ! this.overheated && this.gunT <= 0 ) this.fireGun( st );
			if ( rmb && this.cannon && this.cannonT <= 0 ) this.fireCannon( st );

		} else if ( this.gun ) {

			// guns centre themselves when nobody mans them
			this.gun.yaw.rotation.y *= Math.exp( - dt * 2 );
			this.gun.pitch.rotation.x *= Math.exp( - dt * 2 );

		}

		p.aimLift = helm ? 3.4 : 0;
		p.holdOrbit = helm && ( this.firedT < 5 || inp.mouseDown || inp.rightDown );

		// ---- projectiles and effects
		this.fx.updateProjectiles( dt, ( pr, a, b ) => this.hitTest( pr, a, b ) );
		this.fx.updateEffects( dt );

		// ---- the hull: self repair, smoke, sinking
		this.hurtT += dt;
		if ( ! this.dead && st.repairHPs > 0 && this.hurtT > 6 && s.hullHP < st.hullHP ) s.heal( st.repairHPs * dt );
		const hp = s.hullHP / st.hullHP;
		if ( hp < 0.5 && ! this.dead ) this.fx.smoulder( app.boat.group.localToWorld( _a.set( 0.2, 2.3, - 1.2 ) ), ( 0.5 - hp ) * 2, dt );
		if ( hp < 0.2 && ! this.dead ) this.fx.burn( app.boat.group.localToWorld( _a.set( - 0.3, 1.0, - 2.2 ) ), 0.5, dt );
		if ( this.dead ) this.updateDeath( dt );

		// ---- wanted level cools off when you lie low
		if ( s.wanted > 0 ) {

			this.crimeT += dt;
			const chased = this.fleet.boats.some( ( b ) => b.type === 'coastguard' && b.alive && b.distToPlayer < 250 );
			if ( chased ) this.crimeT = Math.min( this.crimeT, 30 );
			if ( this.crimeT > 60 ) {

				s.wanted = Math.max( 0, s.wanted - 1 );
				this.crimeT = 30;
				s.save();
				game.toast( s.wanted ? `Lying low · wanted level down to ${ '★'.repeat( s.wanted ) }` : 'The coast guard has lost interest in you', 3000 );

			}

		}

		// ---- looting and the harbour
		this.updateLoot( inp, p, aboard, panelOpen );
		this.updateDock( inp, p, aboard );

		if ( this.hud ) this.hud.update( dt );

	}

	manageSpawns( dt, near ) {

		const counts = { fisher: 0, trader: 0, pirate: 0, coastguard: 0 };
		for ( const b of this.fleet.boats ) if ( b.active ) counts[ b.type ] ++;
		const want = { ...POPULATION, coastguard: this.state.wanted >= 2 ? Math.min( 3, this.state.wanted - 1 ) : 0 };
		for ( const b of this.fleet.boats ) {

			if ( b.active ) continue;
			b.respawnT -= dt;
			if ( b.respawnT > 0 ) continue;
			// the coast guard first, then whatever is short
			let type = null;
			if ( counts.coastguard < want.coastguard ) type = 'coastguard';
			else for ( const k of [ 'pirate', 'fisher', 'trader' ] ) if ( counts[ k ] < want[ k ] ) {

				type = k;
				break;

			}

			if ( ! type ) {

				b.respawnT = 4;
				continue;

			}

			const at = type === 'coastguard'
				? this.fleet.randomWater( 8, 400, near, 260, 420 )
				: this.fleet.randomWater( 8, 400, near, 330, 650 );
			// pirates get tougher as you do
			const u = this.state.upgrades;
			const prog = ( u.armor | 0 ) + ( u.gun | 0 ) + ( u.cannon | 0 ) + ( u.engine | 0 );
			const tier = type === 'pirate' ? Math.max( 1, Math.min( 3, 1 + Math.floor( prog / 4 + Math.random() * 1.3 ) ) ) : 1;
			b.spawn( type, at, { tier } );
			counts[ type ] ++;

		}

	}

	// the hulls push apart; ramming at speed hurts both
	collideBoats( dt ) {

		const bc = this.app.boatCtl;
		for ( const b of this.fleet.boats ) {

			if ( ! b.active || b.state === 'sinking' ) continue;
			const dx = bc.position.x - b.pos.x, dz = bc.position.z - b.pos.z;
			const d = Math.hypot( dx, dz );
			if ( d > 7.2 || d < 1e-3 ) continue;
			const nx = dx / d, nz = dz / d, over = 7.2 - d;
			bc.position.x += nx * over * 0.5; bc.position.z += nz * over * 0.5;
			b.pos.x -= nx * over * 0.5; b.pos.z -= nz * over * 0.5;
			const rel = ( bc.velocity.x - b.vel.x ) * nx + ( bc.velocity.z - b.vel.z ) * nz;
			if ( rel < 0 ) {

				bc.velocity.x -= nx * rel * 1.3; bc.velocity.z -= nz * rel * 1.3;
				if ( - rel > 3 && ( this._ramT || 0 ) < this.time ) {

					this._ramT = this.time + 0.8;
					const dmg = ( - rel - 2 ) * 6;
					const at = _a.set( b.pos.x + nx * 3, 1.2, b.pos.z + nz * 3 );
					this.fx.hit( at, _w.set( nx, 0, nz ), 0.8 );
					this.sfx.shot( at, 'hit', 1.2 );
					b.damage( dmg, true, this._ctx );
					this.damagePlayer( dmg * 0.45 );
					this.game.toast( 'Ramming!', 1200 );

				}

			}

		}

	}

	computeAim( st ) {

		const cam = this.app.camera;
		const o = cam.position;
		const dir = _a.copy( FWD ).applyQuaternion( cam.quaternion );
		const reach = st.gunRange + 40;
		const end = _v.copy( o ).addScaledVector( dir, reach );
		let best = Infinity, tgt = null;
		for ( const b of this.fleet.boats ) {

			if ( ! b.active || b.state === 'sinking' ) continue;
			const t = b.intersect( o, end );
			if ( t >= 0 && t < best ) {

				best = t;
				tgt = b;

			}

		}

		let dist = tgt ? best * reach : Infinity;
		if ( dir.y < - 1e-4 ) dist = Math.min( dist, - o.y / dir.y );
		if ( dist === Infinity || dist > reach ) dist = reach;
		this.aim.copy( o ).addScaledVector( dir, dist );
		this.aimTarget = tgt && best * reach <= dist + 0.01 ? tgt : null;
		this.aimDist = dist;

	}

	fireGun( st ) {

		const g = this.gun, app = this.app;
		const muzzleL = g.muzzles[ this.barrel ++ % g.muzzles.length ];
		const muzzle = g.pitch.localToWorld( _w.copy( muzzleL ) );
		const dir = _v.copy( this.aim ).sub( muzzle ).normalize();
		const sp = st.gunSpread * ( this.heat > 0.7 ? 1.6 : 1 );
		dir.x += ( Math.random() - 0.5 ) * 2 * sp;
		dir.y += ( Math.random() - 0.5 ) * 2 * sp;
		dir.z += ( Math.random() - 0.5 ) * 2 * sp;
		dir.normalize();
		const vel = dir.clone().multiplyScalar( BULLET_SPEED ).add( app.boatCtl.velocity );
		this.fx.fire( { from: muzzle, vel, dmg: st.gunDmg, owner: 'player', life: st.gunRange / BULLET_SPEED } );
		this.fx.muzzle( muzzle, dir );
		this.sfx.shot( muzzle, st.gunRate > 6 ? 'mg' : 'rifle', 0.8 );
		this.gunT = 1 / st.gunRate;
		this.heat += st.gunHeat;
		this.firedT = 0;
		if ( this.heat >= 1 ) {

			this.heat = 1;
			this.overheated = true;
			this.sfx.shot( muzzle, 'clank' );

		}

	}

	fireCannon( st ) {

		const s = this.state;
		if ( s.shells <= 0 ) {

			if ( ( this._noShellT || 0 ) < this.time ) {

				this._noShellT = this.time + 2;
				this.game.toast( 'Out of shells · buy more at the harbour (U by the pier) or from Marta', 2200 );
				this.sfx.shot( null, 'clank', 0.6 );

			}

			return;

		}

		const c = this.cannon;
		const muzzle = c.pitch.localToWorld( _w.copy( c.muzzles[ 0 ] ) );
		// land the shell on the aim point, within the gun's reach
		const tgt = _a.copy( this.aim );
		const dx = tgt.x - muzzle.x, dz = tgt.z - muzzle.z, d = Math.hypot( dx, dz );
		if ( d > st.canRange ) {

			tgt.x = muzzle.x + dx / d * st.canRange;
			tgt.z = muzzle.z + dz / d * st.canRange;
			tgt.y = 0;

		}

		const vel = this.ballistic( muzzle, tgt, SHELL_SPEED ).add( this.app.boatCtl.velocity );
		this.fx.fire( { from: muzzle, vel, dmg: st.canDmg, owner: 'player', kind: 'shell', splash: st.canSplash, life: 10 } );
		this.fx.muzzle( muzzle, vel.clone().normalize(), true );
		this.sfx.shot( muzzle, 'cannon' );
		s.shells --;
		s.emit();
		this.cannonT = 1 / st.canRate;
		this.firedT = 0;

	}

	hitTest( p, a, b ) {

		if ( p.owner === 'player' ) {

			let best = 2, tgt = null;
			for ( const n of this.fleet.boats ) {

				if ( ! n.active || n.state === 'sinking' ) continue;
				// cheap reject
				const mx = ( a.x + b.x ) * 0.5 - n.pos.x, mz = ( a.z + b.z ) * 0.5 - n.pos.z;
				if ( mx * mx + mz * mz > ( 6 + a.distanceTo( b ) ) ** 2 ) continue;
				const t = n.intersect( a, b );
				if ( t >= 0 && t < best ) {

					best = t;
					tgt = n;

				}

			}

			return tgt ? { point: new Vector3().lerpVectors( a, b, best ), target: tgt } : null;

		}

		if ( ! this.aboard || this.dead ) return null;
		const bc = this.app.boatCtl.position;
		const mx = ( a.x + b.x ) * 0.5 - bc.x, mz = ( a.z + b.z ) * 0.5 - bc.z;
		if ( mx * mx + mz * mz > ( 6 + a.distanceTo( b ) ) ** 2 ) return null;
		const t = this.playerBoxHit( a, b );
		return t >= 0 ? { point: new Vector3().lerpVectors( a, b, t ), target: 'player' } : null;

	}

	onImpact( p, point, target ) {

		const shell = p.kind === 'shell';
		if ( target && typeof target === 'object' && target.damage ) {

			// a hull hit
			const n = _v.set( point.x - target.pos.x, 0, point.z - target.pos.z ).normalize();
			if ( shell ) this.fx.explosion( point, 0.9 );
			else this.fx.hit( point, n, 0.25 );
			this.sfx.shot( point, shell ? 'explosion' : 'hit', shell ? 1 : 0.6 );
			if ( target.alive ) {

				const killed = target.damage( p.dmg, p.owner === 'player', this._ctx );
				if ( this.hud && p.owner === 'player' ) this.hud.hitMarker( killed );

			}

		} else if ( target === 'player' ) {

			const bc = this.app.boatCtl.position;
			const n = _v.set( point.x - bc.x, 0, point.z - bc.z ).normalize();
			if ( shell ) this.fx.explosion( point, 0.9 );
			else this.fx.hit( point, n, 0.25 );
			this.sfx.shot( point, shell ? 'explosion' : 'hit', shell ? 1 : 0.8 );
			this.damagePlayer( p.dmg );

		} else if ( shell ) {

			if ( target !== 'water' ) this.fx.explosion( point, 0.7 );
			this.sfx.shot( point, 'explosion', 0.8 );

		}

		// shells hurt everything around where they burst
		if ( shell && p.splash > 0 ) {

			if ( p.owner === 'player' ) {

				for ( const n of this.fleet.boats ) {

					if ( ! n.alive || n === target ) continue;
					const d = Math.max( 0, Math.hypot( n.pos.x - point.x, n.pos.z - point.z ) - 3 );
					if ( d < p.splash ) {

						const killed = n.damage( p.dmg * ( 1 - d / p.splash ) * 0.8, true, this._ctx );
						if ( this.hud ) this.hud.hitMarker( killed );

					}

				}

			} else if ( this.aboard && target !== 'player' ) {

				const bc = this.app.boatCtl.position;
				const d = Math.max( 0, Math.hypot( bc.x - point.x, bc.z - point.z ) - 3 );
				if ( d < p.splash ) this.damagePlayer( p.dmg * ( 1 - d / p.splash ) * 0.8 );

			}

		}

	}

	// ---------------------------------------------------------------- the player's hull

	damagePlayer( dmg ) {

		if ( this.dead || ! this.aboard ) return;
		const s = this.state;
		s.damage( dmg );
		this.hurtT = 0;
		if ( this.hud ) this.hud.hurt( Math.min( 1, dmg / 20 ) );
		if ( s.hullHP <= 0 ) this.die();

	}

	die() {

		this.dead = true;
		this.deadT = 0;
		const app = this.app;
		this.fx.explosion( app.boat.group.localToWorld( _a.set( 0, 1.5, - 0.5 ) ), 1.4 );
		this.sfx.shot( app.boatCtl.position, 'explosion', 1.3 );
		app.boatCtl.throttle = 0;
		if ( this.hud ) this.hud.showDeath( true );

	}

	updateDeath( dt ) {

		this.deadT += dt;
		const app = this.app, bc = app.boatCtl;
		bc.throttle = 0;
		bc.setInput( 0, 0, dt );
		if ( this.deadT < 3 ) this.fx.burn( app.boat.group.localToWorld( _a.set( 0, 1.2, - 1 ) ), 1.2, dt );
		if ( this.deadT < 4 ) return;
		// salvage: the catch is lost, the yard takes a quarter of your money, the boat is patched up
		const s = this.state;
		const fine = Math.round( s.money * 0.25 );
		const lost = s.inventory.length;
		s.money -= fine;
		s.inventory = [];
		s.hull = null;
		s.wanted = 0;
		s.fuel = null;
		s.pirate.deaths ++;
		s.save();
		s.emit();
		bc.reset();
		if ( app.player.mode === 'boat' ) {

			bc.moored = false;
			app.player.camInit = false;

		}

		// the coast guard goes home, pirates forget you
		for ( const b of this.fleet.boats ) {

			if ( b.type === 'coastguard' && b.active ) b.despawn( 10 );
			b.provoked = false;
			if ( b.state === 'attack' ) b.state = 'cruise';

		}

		this.heat = 0;
		this.overheated = false;
		this.dead = false;
		if ( this.hud ) this.hud.showDeath( false );
		this.game.toast( `Towed back to the pier · salvage cost $${ fine.toLocaleString() }${ lost ? ` and ${ lost } fish went down with her` : '' }`, 5000 );

	}

	// ---------------------------------------------------------------- crime and reward

	addWanted( n, why ) {

		const s = this.state;
		const before = s.wanted;
		s.wanted = Math.min( 5, s.wanted + n );
		this.crimeT = 0;
		s.save();
		if ( s.wanted > before ) {

			this.game.toast( `${ why } · Wanted ${ '★'.repeat( s.wanted ) }${ s.wanted >= 2 && before < 2 ? ' · the coast guard is coming' : '' }`, 3200 );
			if ( this.hud ) this.hud.wantedPulse();

		}

	}

	onAttack( npc ) {

		if ( npc.def.honest && ! npc.crimeLogged ) {

			npc.crimeLogged = true;
			this.addWanted( 1, `You opened fire on the ${ npc.name }` );

		} else if ( npc.def.law && ! npc.crimeLogged ) {

			npc.crimeLogged = true;
			this.addWanted( 1, 'Firing on the coast guard' );

		} else if ( npc.type === 'pirate' && ! npc.announced ) this.onAggro( npc );

	}

	onAggro( npc ) {

		if ( npc.announced ) return;
		npc.announced = true;
		this.game.toast( `☠ Pirates! The ${ npc.name } is coming for you`, 3000 );

	}

	onDisabled( npc, byPlayer ) {

		if ( ! byPlayer ) return;
		const s = this.state;
		if ( npc.type === 'pirate' ) {

			const bounty = npc.def.bounty * npc.tier;
			s.pirate.bounties += bounty;
			s.pirate.piratesSunk ++;
			s.earn( bounty );
			this.game.toast( `☠ ${ npc.name } disabled · bounty $${ bounty } · loot her with G`, 3600 );

		} else {

			s.pirate.sunk ++;
			if ( npc.def.law ) this.addWanted( 2, `You crippled the ${ npc.name }` );
			else this.addWanted( 1, `You crippled the ${ npc.name }` );
			this.game.toast( `${ npc.name } is dead in the water · loot her with G`, 3000 );

		}

		this.sfx.shot( npc.pos, 'explosion', 1.2 );

	}

	updateLoot( inp, p, aboard, panelOpen ) {

		this.loot = null;
		if ( ! aboard || this.dead ) return;
		const bc = this.app.boatCtl.position;
		let best = 18;
		for ( const b of this.fleet.boats ) {

			if ( ! b.lootable ) continue;
			const d = Math.hypot( b.pos.x - bc.x, b.pos.z - bc.z );
			if ( d < best ) {

				best = d;
				this.loot = b;

			}

		}

		if ( ! this.loot ) return;
		p.prompt = { key: 'G', text: `Loot the ${ this.loot.name }` };
		if ( inp.hit( 'KeyG' ) && ! panelOpen ) this.plunder( this.loot );

	}

	plunder( b ) {

		const s = this.state, game = this.game;
		b.looted = true;
		b.lootT = Math.min( b.lootT, 10 );
		let cash = b.cash;
		let fishN = 0, lostN = 0, fishV = 0;
		for ( const f of b.fishCargo ) {

			if ( s.fits( f.kg ) ) {

				const value = fishValue( f.species, f.kg );
				s.inventory.push( { id: s._nextId ++, species: f.species, kg: f.kg, cm: Math.round( fishLengthCm( f.species, f.kg ) ), value, caughtAt: game.hour, record: false } );
				fishN ++;
				fishV += value;

			} else lostN ++;

		}

		let shells = 0;
		if ( b.def.shells ) shells = Math.min( b.def.shells, s.stats.shellCap - s.shells );
		if ( b.type === 'pirate' || b.type === 'trader' ) shells += Math.min( Math.floor( Math.random() * 3 ), s.stats.shellCap - s.shells - shells );
		s.shells += Math.max( 0, shells );
		s.money += cash;
		s.pirate.looted ++;
		s.pirate.plunder += cash + fishV;
		s.save();
		s.emit();
		if ( this.app.audio && this.app.audio.coin ) this.app.audio.coin();
		const bits = [ `$${ cash }` ];
		if ( fishN ) bits.push( `${ fishN } fish` );
		if ( shells > 0 ) bits.push( `${ shells } shell${ shells > 1 ? 's' : '' }` );
		game.toast( `Plundered the ${ b.name }: ${ bits.join( ', ' ) }${ lostN ? ` · no room for ${ lostN } more fish` : '' }`, 3800 );

	}

	updateDock( inp, p, aboard ) {

		const hud = this.game.hud;
		const bc = this.app.boatCtl.position, d = WORLD.boatDock.position;
		this.atDock = aboard && Math.hypot( bc.x - d.x, bc.z - d.z ) < DOCK_RADIUS;
		if ( hud && hud.standOpen && hud.vendor === this.dockVendor && ! this.atDock ) hud.closeStand();
		if ( ! this.atDock || this.dead || this.loot ) return;
		if ( hud && hud.standOpen && hud.vendor === this.dockVendor ) {

			p.prompt = { key: 'U', text: 'Close harbour services' };
			if ( inp.hit( 'KeyU' ) ) hud.closeStand();
			return;

		}

		if ( ! p.prompt || p.mode === 'boat' ) p.prompt = { key: 'U', text: 'Harbour services' + ( p.mode === 'boat' ? '   ·   E  leave helm' : '' ) };
		if ( inp.hit( 'KeyU' ) && hud ) hud.openStand( this.dockVendor );

	}

	// pay off the wanted level at the harbour office
	fineCost() {

		return this.state.wanted * 300;

	}

	payFine() {

		const s = this.state, c = this.fineCost();
		if ( ! c || s.money < c ) return false;
		s.money -= c;
		s.wanted = 0;
		this.crimeT = 0;
		s.save();
		s.emit();
		this.game.toast( 'Fine paid · your record is clean', 2600 );
		return true;

	}

}

export { NPC_TYPES, FISH };
