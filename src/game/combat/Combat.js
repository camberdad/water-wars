import { Vector3, Quaternion } from '../../engine/index.js';
import { roofTopY } from '../../world/boat/Wheelhouse.js';
import { WORLD } from '../../world/WorldLayout.js';
import { FISH, fishValue, fishLengthCm, TROPHY_VALUE } from '../FishTable.js';
import { CombatFX } from './CombatFX.js';
import { CombatSFX } from './CombatSFX.js';
import { NPCFleet, NPC_TYPES, BOAT_HALF, BOAT_CENTER_Y, segmentBox } from './NPCBoats.js';
import { buildGunTurret, buildCannon } from './WeaponModels.js';
import { CombatHUD } from './CombatHUD.js';
import { hullOutline, placeOutline, hullContact, densify } from './HullContact.js';
import { BOATS } from '../BoatCatalog.js';
import { createBoatMesh, surfaceY, buildDeckMap, hullVolumeFor } from '../Boats.js';
import { DANGER_TIERS, dangerZoneAt, randomInZone, buildDangerBuoys, HARBOUR, WORLD_RADIUS, harbourDistance } from '../DangerZones.js';
import { STATIONS, SERVICE_RADIUS, safeZoneAt, stationNear, buildStations, buildDockKiosk, DOCK_KIOSK, buildDockFenders } from '../Harbours.js';

// Water Wars' combat layer on top of the fishing game:
//   at the helm   left mouse fires the deck gun (it overheats), right mouse the bow cannon (unlimited shells)
//   G             loot a disabled boat alongside (cash and fish)
//   U             harbour services by the pier or at a sea station (repairs, fuel, upgrades, boats, sell fish)
// Sinking honest boats (fishers, traders) or firing on the coast guard raises your wanted level;
// from two stars the coast guard comes for you. Pirates carry a bounty. If your hull goes to zero
// you lose your catch and part of your money, and start again at the pier.

const _v = new Vector3();
const _w = new Vector3();
const _a = new Vector3();
const _q = new Quaternion();
const FWD = new Vector3( 0, 0, - 1 );
const BULLET_SPEED = 300;
const BULLET_REACH = 1.4; // bullets fly on past the gun's range (losing punch) before they drop out
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
		// the boat in use: the lobster boat or a bought model (look, gun mounts, hit box)
		this.mounts = { gun: new Vector3( 0, roofTopY( 0 ) - 0.02, - 0.4 ), cannon: new Vector3( 0, this.foredeckY, 3.0 ), stern: new Vector3( 0, L.sheerY( 0 ) + 0.05, L.zAft + 0.45 ) };
		this._sternLobster = this.mounts.stern.clone();
		this.hitHalf = BOAT_HALF.clone();
		this.skinMesh = null;
		this._skinId = 'lobster';
		// the danger waters: red buoys around them, and where the player is
		this.buoys = buildDangerBuoys( app.scene, app.terrainData );
		this.zone = null;
		// safe zones: the harbour and the four sea stations (harbour services at each)
		this.stations = buildStations( app.scene, app.colliders );
		// a harbour services kiosk at the end of the main dock (U on foot)
		this.kiosk = buildDockKiosk( app.scene, app.colliders );
		// the dock is solid to boats: a fender line around it and rubber bumpers on its sides
		this.fenders = buildDockFenders( app.scene, app.colliders, app.terrainData );
		this.applyHullOutline( BOATS.lobster );
		this.stationList = STATIONS;
		this.safe = null;
		this.stationVendors = new Map( STATIONS.map( ( s ) => [ s.id, { name: s.name, kind: 'dock', greeting: 'Safe harbour out here: repairs, fuel, upgrades, boats, and we buy your catch.' } ] ) );
		this.service = null; // the vendor of the service point alongside, or null
		this.applyGear();

	}

	// ---------------------------------------------------------------- gear

	applyGear() {

		const u = this.state.upgrades, boat = this.app.boat.group;
		if ( ( u.gun | 0 ) !== this._gunTier ) {

			if ( this.gun ) this.gun.dispose();
			this._gunTier = u.gun | 0;
			this.gun = buildGunTurret( this._gunTier );
			this.gun.root.position.copy( this.mounts.gun );
			boat.add( this.gun.root );

		}

		if ( ( u.cannon | 0 ) !== this._cannonTier ) {

			if ( this.cannon ) this.cannon.dispose();
			this.cannon = null;
			this._cannonTier = u.cannon | 0;
			if ( this._cannonTier > 0 ) {

				this.cannon = buildCannon( this._cannonTier );
				this.cannon.root.position.copy( this.mounts.cannon );
				boat.add( this.cannon.root );

			}

		}

		if ( this.state.boat !== this._skinId ) this.setSkin( this.state.boat );

	}

	// show the boat in use: hide the lobster boat's meshes and hang the bought model on its group
	// (the physics stays the lobster boat's); move the guns to the model's mounts
	async setSkin( id ) {

		this._skinId = id;
		const def = BOATS[ id ] || BOATS.lobster;
		let mesh = null;
		try {

			mesh = def.model ? await createBoatMesh( id ) : null;

		} catch ( e ) {

			console.warn( 'boat model failed to load', e );
			this.game.toast( `Could not load the ${ def.name } model; showing the old boat`, 3000 );

		}

		if ( this._skinId !== id ) return; // switched again meanwhile
		const app = this.app, boat = app.boat;
		if ( this.skinMesh ) boat.group.remove( this.skinMesh );
		this.skinMesh = mesh;
		if ( mesh ) boat.group.add( mesh );
		for ( const m of Object.values( boat.meshes ) ) m.visible = ! mesh;
		this.mounts.gun.set( 0, roofTopY( 0 ) - 0.02, - 0.4 );
		this.mounts.cannon.set( 0, this.foredeckY, 3.0 );
		this.mounts.stern.copy( this._sternLobster );
		this.hitHalf.copy( BOAT_HALF );
		if ( mesh ) {

			// sit the guns on the model's roof / foredeck under their mount points
			if ( def.gun ) this.mounts.gun.fromArray( def.gun );
			if ( def.cannon ) this.mounts.cannon.fromArray( def.cannon );
			// (fixedMounts: the catalogue heights are exact, e.g. over a see-through grating deck)
			if ( ! def.fixedMounts ) for ( const m of [ this.mounts.gun, this.mounts.cannon ] ) {

				const y = surfaceY( mesh.geometry, m.x, m.z );
				if ( y !== null ) m.y = y - 0.02;

			}
			if ( def.hitHalf ) this.hitHalf.fromArray( def.hitHalf );
			// the harpoon sits on the stern: where the catalogue says, else the deck just inside the transom
			if ( def.stern ) this.mounts.stern.fromArray( def.stern );
			else {

				const sz = - ( def.length || 8 ) / 2 + 1.1;
				const sy = surfaceY( mesh.geometry, 0, sz );
				this.mounts.stern.set( 0, ( sy ?? 1.2 ) + 0.02, sz );

			}

		}

		if ( this.gun ) this.gun.root.position.copy( this.mounts.gun );
		if ( this.cannon ) this.cannon.root.position.copy( this.mounts.cannon );
		if ( this.game.giants ) this.game.giants.placeMount();
		// the water mask follows the hull in use (no sea drawn inside a bought boat's hull either)
		const sr = app.sceneRenderer, hm = sr && sr.hullMasks && sr.hullMasks.find( ( h ) => h.object === boat.group );
		if ( hm ) {

			if ( ! hm.lobster ) hm.lobster = { geometry: hm.mesh.geometry, box: hm.box, sphere: hm.sphere };
			const vg = mesh ? ( this._hullVols || ( this._hullVols = new Map() ) ).get( id ) || hullVolumeFor( mesh.geometry ) : null;
			if ( vg ) this._hullVols.set( id, vg );
			hm.mesh.geometry = vg || hm.lobster.geometry;
			hm.box = vg ? vg.boundingBox.clone().expandByScalar( 0.05 ) : hm.lobster.box;
			hm.sphere = vg ? vg.boundingSphere : hm.lobster.sphere;

		}

		this.applyHullOutline( def );
		app.player.forceThird = !! mesh;
		// walk on the model's own deck (see Boats.buildDeckMap), at its real height
		app.player.deckMap = mesh ? buildDeckMap( mesh.geometry, def.floorMin ?? 0.05, def.deckPlanes || null ) : null;
		app.player.deckLift = 0;
		// taking the helm: at the boat's own wheel (when known), or around the middle of a bought boat
		app.player.helmAt = mesh && def.helm ? { x: def.helm[ 0 ], z: def.helm[ 1 ] } : null;
		app.player.helmMidR = mesh ? Math.min( 1.6, ( def.beam || 3 ) * 0.3 ) : 0;
		// the camera stands back to suit the boat's size; bigger boats get a more responsive rudder
		app.player.orbitDist = mesh ? Math.max( app.player.orbitDist, 13 * ( def.length || 8.2 ) / 8.2 ) : app.player.orbitDist;
		if ( this._rudderBase === undefined ) this._rudderBase = app.boatCtl.rudderLift;
		app.boatCtl.rudderLift = this._rudderBase * ( def.rudderMul || 1 );
		// someone standing on the deck lands on the new one
		if ( app.player.mode === 'deck' && app.player.deckMap ) {

			const s = app.player.deckMap.nearest( app.player.deckPos.x, app.player.deckPos.z );
			if ( s ) app.player.deckPos.set( s.x, s.y, s.z );

		}

	}

	// the hull outline the boat physics keeps out of the dock and the piles: the boat in use's own size
	// (the lobster boat's when none is given), with points close enough together that nothing slips between
	applyHullOutline( def ) {

		const w = def && def.beam ? def.beam / 2 - 0.05 : 1.4, l = def && def.length ? def.length / 2 - 0.1 : 4.05;
		this.app.boatCtl.outline = densify( hullOutline( w, l ), 0.7 ).map( ( [ x, z ] ) => new Vector3( x, 0.3, z ) );

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
		return segmentBox( A, B, this.hitHalf );

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
		ctx.playerZoneLoose = aboard ? dangerZoneAt( ctx.playerPos.x, ctx.playerPos.z, 25 ) : null;
		// ashore you are always out of the fight; afloat in the harbour or by a station too
		ctx.playerSafe = ! aboard || !! safeZoneAt( ctx.playerPos.x, ctx.playerPos.z );
		this.updateZone( ctx.playerPos, aboard );
		this.manageSpawns( dt, ctx.playerPos );
		this.fleet.update( dt, ctx );
		if ( aboard ) this.collideBoats( dt );
		if ( aboard ) this.worldEdge( dt );

		// ---- the player's guns
		this.gunT -= dt;
		this.cannonT -= dt;
		this.firedT += dt;
		const st = s.stats;
		this.heat = Math.max( 0, this.heat - st.coolRate * dt * ( this.overheated ? 1.3 : 1 ) );
		if ( this.overheated && this.heat < 0.3 ) this.overheated = false;
		const helm = this.atHelm && ! this.dead;
		this.holstered = helm && !! this.safe;
		if ( helm ) {

			this.computeAim( st );
			this.aimTurret( app.boat.group, this.gun, this.aim, dt );
			if ( this.cannon ) this.aimTurret( app.boat.group, this.cannon, this.aim, dt, - 0.6, 0.12 );
			const lmb = inp.mouseDown && inp.enabled && ! panelOpen;
			const rmb = inp.rightDown && inp.enabled && ! panelOpen;
			if ( this.safe && ( lmb || rmb ) ) {

				// no shooting in a safe zone
				if ( ( this._holsterT || 0 ) < this.time ) {

					this._holsterT = this.time + 3;
					this.game.toast( `Weapons are holstered in ${ this.safe.name.replace( /^The /, 'the ' ) } (safe zone)`, 2000 );

				}

			} else {

				if ( lmb && ! this.overheated && this.gunT <= 0 ) this.fireGun( st );
				if ( rmb && this.cannon && this.cannonT <= 0 ) this.fireCannon( st );

			}

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
		this.updateRighting( dt, aboard, p, inp );

		// ---- wanted level cools off when you lie low
		if ( s.wanted > 0 ) {

			this.crimeT += dt;
			const chased = ! this._ctx.playerSafe && this.fleet.boats.some( ( b ) => b.type === 'coastguard' && b.alive && b.distToPlayer < 250 );
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

	// a capsized boat rights itself after a moment; X rights a boat that is heeled far over
	updateRighting( dt, aboard, p, inp ) {

		const bc = this.app.boatCtl;
		const upY = _v.set( 0, 1, 0 ).applyQuaternion( bc.quaternion ).y;
		this._capT = upY < 0.3 ? ( this._capT || 0 ) + dt : 0;
		const heeled = upY < 0.8;
		if ( aboard && heeled && ! this.dead ) {

			p.prompt = { key: 'X', text: 'Right the boat' };
			if ( inp.hit( 'KeyX' ) ) this._capT = 99;

		}

		if ( this._capT > 1.5 ) {

			this._capT = 0;
			bc.rightBoat();
			this.game.toast( 'Boat righted', 1600 );

		}

	}

	// entering / leaving the danger waters and the safe zones
	updateZone( pos, aboard ) {

		const safe = aboard ? safeZoneAt( pos.x, pos.z ) : null;
		if ( safe !== this.safe ) {

			const was = this.safe;
			this.safe = safe;
			if ( safe ) this.game.toast( `✓ ${ safe.name }: safe zone. Nobody fires here; shop, repair and fish in peace.`, 3200 );
			else if ( was ) this.game.toast( `Leaving the safe zone of ${ was.name.replace( /^The /, 'the ' ) }`, 2200 );

		}

		const z = dangerZoneAt( pos.x, pos.z );
		if ( z === this.zone ) return;
		const was = this.zone;
		this.zone = z;
		if ( ! aboard ) return;
		const blurb = [ '', 'a few pirates about, keep your distance', 'tougher pirates, rarer fish, giants surface out here', 'pirate warlords with cannons · the rarest fish, the most giants and plunder' ];
		if ( z && ( ! was || z.tier > was.tier ) ) this.game.toast( `⚠ Danger tier ${ z.tier }: ${ z.name } · ${ blurb[ z.tier ] }`, 4200 );
		else if ( z ) this.game.toast( `Back in ${ z.name } (danger tier ${ z.tier })`, 2400 );

	}

	manageSpawns( dt, near ) {

		const counts = { fisher: 0, trader: 0, pirate: 0, coastguard: 0 };
		for ( const b of this.fleet.boats ) if ( b.active ) counts[ b.type ] ++;
		// no coast guard sets out after you while you are in a safe zone (or ashore)
		// more pirates the further out you sail
		const here = dangerZoneAt( near.x, near.z );
		const want = { ...POPULATION, pirate: here ? 1 + here.tier : 2, coastguard: this.state.wanted >= 2 && ! ( this._ctx && this._ctx.playerSafe ) ? Math.min( 3, this.state.wanted - 1 ) : 0 };
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

			let at;
			if ( type === 'pirate' ) {

				// in the danger tier the player is sailing in (coastal waters from the harbour), a way off
				const band = dangerZoneAt( near.x, near.z ) || DANGER_TIERS[ 0 ];
				at = randomInZone( band, this.app.terrainData, near );

			} else at = type === 'coastguard'
				? this.fleet.randomWater( 8, 400, near, 260, 420 )
				: this.fleet.randomWater( 8, 400, near, 330, 650 );
			// pirates get tougher as you do
			const u = this.state.upgrades;
			const prog = ( u.armor | 0 ) + ( u.gun | 0 ) + ( u.cannon | 0 ) + ( u.engine | 0 );
			// pirates are as tough as the waters they sail (a notch more for a well-armed player)
			const band = type === 'pirate' ? ( dangerZoneAt( at.x, at.z ) || DANGER_TIERS[ 0 ] ) : null;
			const tier = band ? Math.min( 3, band.pirateTier + ( prog >= 14 && Math.random() < 0.3 ? 1 : 0 ) ) : 1;
			b.spawn( type, at, { tier } );
			counts[ type ] ++;

		}

	}

	// the charted sea ends WORLD_RADIUS from the harbour: past it the current turns you back
	worldEdge( dt ) {

		const bc = this.app.boatCtl;
		const d = harbourDistance( bc.position.x, bc.position.z );
		if ( d < WORLD_RADIUS ) return;
		const nx = ( HARBOUR.x - bc.position.x ) / d, nz = ( HARBOUR.z - bc.position.z ) / d;
		const out = - ( bc.velocity.x * nx + bc.velocity.z * nz );
		const push = 4 + ( d - WORLD_RADIUS ) * 0.2;
		bc.velocity.x += nx * ( push + Math.max( 0, out ) * 2 ) * dt;
		bc.velocity.z += nz * ( push + Math.max( 0, out ) * 2 ) * dt;
		if ( ( this._edgeT || 0 ) < this.time ) {

			this._edgeT = this.time + 6;
			this.game.toast( 'The edge of the charted sea · the current turns you back', 2600 );

		}

	}

	// the hulls push apart; ramming at speed hurts the other boat only (touching boats never damages yours)
	collideBoats( dt ) {

		const bc = this.app.boatCtl;
		// the hull outlines (yours follows the boat in use; theirs are all the lobster-boat hull)
		const def = BOATS[ this._skinId ] || BOATS.lobster;
		const w = def.beam ? def.beam / 2 : BOAT_HALF.x, l = def.length ? def.length / 2 : BOAT_HALF.z;
		if ( ! this._myShape || this._myShapeKey !== this._skinId ) {

			this._myShape = hullOutline( w, l );
			this._myShapeKey = this._skinId;
			this._npcShape = this._npcShape || hullOutline( BOAT_HALF.x, BOAT_HALF.z );

		}

		const mine = placeOutline( this._myShape, bc.position.x, bc.position.z, bc.getYaw(), this._myPoly || ( this._myPoly = [] ) );
		const reach = Math.hypot( w, l ) + Math.hypot( BOAT_HALF.x, BOAT_HALF.z );
		for ( const b of this.fleet.boats ) {

			if ( ! b.active || b.state === 'sinking' ) continue;
			const dx = bc.position.x - b.pos.x, dz = bc.position.z - b.pos.z;
			if ( dx * dx + dz * dz > reach * reach ) continue; // too far apart to touch
			// only where the hulls really meet
			const hit = hullContact( mine, placeOutline( this._npcShape, b.pos.x, b.pos.z, b.yaw, this._npcPoly || ( this._npcPoly = [] ) ) );
			if ( ! hit ) continue;
			const nx = hit.nx, nz = hit.nz, over = hit.depth;
			bc.position.x += nx * over * 0.5; bc.position.z += nz * over * 0.5;
			b.pos.x -= nx * over * 0.5; b.pos.z -= nz * over * 0.5;
			const rel = ( bc.velocity.x - b.vel.x ) * nx + ( bc.velocity.z - b.vel.z ) * nz;
			if ( rel < 0 ) {

				bc.velocity.x -= nx * rel * 1.3; bc.velocity.z -= nz * rel * 1.3;
				if ( - rel > 3 && ( this._ramT || 0 ) < this.time ) {

					this._ramT = this.time + 0.8;
					const dmg = ( - rel - 2 ) * 6;
					const at = _a.set( bc.position.x - nx * w, 1.2, bc.position.z - nz * w );
					this.fx.hit( at, _w.set( nx, 0, nz ), 0.8 );
					this.sfx.shot( at, 'hit', 1.2 );
					b.damage( dmg, true, this._ctx );
					this.game.toast( 'Ramming!', 1200 );

				}

			}

		}

	}

	computeAim( st ) {

		const cam = this.app.camera;
		const o = cam.position;
		const dir = _a.copy( FWD ).applyQuaternion( cam.quaternion );
		const reach = st.gunRange * BULLET_REACH + 40;
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
		const sp = st.gunSpread * ( st.aimMul || 1 ) * ( this.heat > 0.7 ? 1.6 : 1 );
		dir.x += ( Math.random() - 0.5 ) * 2 * sp;
		dir.y += ( Math.random() - 0.5 ) * 2 * sp;
		dir.z += ( Math.random() - 0.5 ) * 2 * sp;
		dir.normalize();
		// straight down the line of sight: the boat's motion on the waves is not added to the shot
		const vel = dir.clone().multiplyScalar( BULLET_SPEED );
		this.fx.fire( { from: muzzle, vel, dmg: st.gunDmg, owner: 'player', range: st.gunRange, life: st.gunRange * BULLET_REACH / BULLET_SPEED } );
		if ( this.game.multiplayer ) this.game.multiplayer.shot( 'bullet', muzzle, vel );
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

		const vel = this.ballistic( muzzle, tgt, SHELL_SPEED ); // (the boat's own motion is not added)
		this.fx.fire( { from: muzzle, vel, dmg: st.canDmg, owner: 'player', kind: 'shell', splash: st.canSplash, life: 10 } );
		if ( this.game.multiplayer ) this.game.multiplayer.shot( 'shell', muzzle, vel );
		this.fx.muzzle( muzzle, vel.clone().normalize(), true );
		this.sfx.shot( muzzle, 'cannon' );
		this.cannonT = 1 / ( st.canRate * ( st.canRateMul || 1 ) );
		this.firedT = 0;

	}

	hitTest( p, a, b ) {

		// other players' shots (multiplayer) are drawn but hit nothing: no PvP
		if ( p.owner === 'remote' ) return null;

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

				// past the gun's range a bullet has lost some punch (down to half at the end of its flight)
				const flown = p.age * ( p.speed0 || 0 );
				const k = p.range && flown > p.range ? Math.max( 0.5, 1 - 0.5 * ( flown - p.range ) / ( p.range * ( BULLET_REACH - 1 ) ) ) : 1;
				const killed = target.damage( p.dmg * k, p.owner === 'player', this._ctx );
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

		if ( this.dead || ! this.aboard || this.safe ) return;
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
		const cash = Math.round( b.cash * ( s.stats.lootMul || 1 ) );
		let fishN = 0, lostN = 0, fishV = 0;
		for ( const f of b.fishCargo ) {

			const value = fishValue( f.species, f.kg );
			if ( s.fits( f.kg ) || value >= TROPHY_VALUE ) {

				s.inventory.push( { id: s._nextId ++, species: f.species, kg: f.kg, cm: Math.round( fishLengthCm( f.species, f.kg ) ), value, caughtAt: game.hour, record: false } );
				fishN ++;
				fishV += value;

			} else lostN ++;

		}

		s.money += cash;
		s.earned += cash;
		s.pirate.looted ++;
		s.pirate.plunder += cash + fishV;
		s.save();
		s.emit();
		if ( this.app.audio && this.app.audio.coin ) this.app.audio.coin();
		const bits = [ `$${ cash }` ];
		if ( fishN ) bits.push( `${ fishN } fish` );
		game.toast( `Plundered the ${ b.name }: ${ bits.join( ', ' ) }${ lostN ? ` · no room for ${ lostN } more fish` : '' }`, 3800 );

	}

	updateDock( inp, p, aboard ) {

		const hud = this.game.hud;
		const bc = this.app.boatCtl.position, d = WORLD.boatDock.position;
		// alongside the pier in the boat, or on foot at the kiosk on the end of the main dock
		const kiosk = p.mode === 'walk' && p.position.y > 1.6 && Math.hypot( p.position.x - DOCK_KIOSK.x, p.position.z - DOCK_KIOSK.z ) < 4.2;
		this.atDock = ( aboard && Math.hypot( bc.x - d.x, bc.z - d.z ) < DOCK_RADIUS ) || kiosk;
		const st = aboard ? stationNear( bc.x, bc.z, SERVICE_RADIUS ) : null;
		this.service = this.atDock ? this.dockVendor : st ? this.stationVendors.get( st.id ) : null;
		const servicesOpen = hud && hud.standOpen && hud.vendor && hud.vendor.kind === 'dock';
		if ( servicesOpen && hud.vendor !== this.service ) hud.closeStand();
		if ( ! this.service || this.dead || this.loot ) return;
		if ( servicesOpen && hud.vendor === this.service ) {

			p.prompt = { key: 'U', text: 'Close harbour services' };
			if ( inp.hit( 'KeyU' ) ) hud.closeStand();
			return;

		}

		if ( ! p.prompt || p.mode === 'boat' ) p.prompt = { key: 'U', text: ( this.atDock ? 'Harbour services' : this.service.name ) + ( p.mode === 'boat' ? '   ·   E  leave helm' : '' ) };
		if ( inp.hit( 'KeyU' ) && hud ) hud.openStand( this.service );

	}

	// pay off the wanted level at the harbour office
	fineCost() {

		return this.state.wanted * 1500;

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
