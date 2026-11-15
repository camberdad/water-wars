import { Vector3, Quaternion, Matrix4, Mesh, CylinderGeometry, ConeGeometry } from '../engine/index.js';
import { standard } from '../materials/Materials.js';
import { FishProps } from '../world/fish/FishProps.js';
import { FISH, FISH_IDS, fishValue, fishLengthCm } from './FishTable.js';
import { safeZoneAt } from './Harbours.js';
import { compassWord } from './Guide.js';
import { buildCannon } from './combat/WeaponModels.js';
import * as U from './Units.js';

// Giant fish (Water Wars): whale-sized fish that surface out at sea now and then. Harpoon one from the
// stern of your boat (Q at the helm, with the harpoon upgrade), and it is tethered to the boat: it
// fights, dragging the boat, until it tires; then it floats and you tow it into a harbour (the pier or
// a sea station), where it is landed and sold like any other fish, for a large payout.
//
//   swim     cruising, surfacing for a while and diving again (only a surfaced one can be harpooned)
//   hooked   on the line: swims away hard and drags the boat until its strength runs out
//   towed    exhausted, rolled on its side at the surface, following the stern on the tether
//
// Drawn with the world's fish models (FishProps) at 7-16 m. Keys at the helm: Q fire the harpoon /
// hold Q to cut the tether.

export const GIANT_IDS = FISH_IDS.filter( ( id ) => FISH[ id ].tier === 'giant' );
const MAX_GIANTS = 2;
const ROPE = 20; // m of tether from the stern to the fish
const HARPOON_SPEED = 75;
const PARK = new Vector3( 0, - 600, 0 );

const _v = new Vector3();
const _w = new Vector3();
const _f = new Vector3();
const _u = new Vector3();
const _x = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();
const rand = ( a, b ) => a + Math.random() * ( b - a );
const wrap = ( a ) => Math.atan2( Math.sin( a ), Math.cos( a ) );

class Giant {

	constructor( slot, species ) {

		this.slot = slot;
		this.species = species;
		this.active = false;
		this.pos = new Vector3();
		this.yaw = 0;
		this.t = Math.random() * 10;

	}

	spawn( at ) {

		const f = FISH[ this.species ];
		this.kg = Math.round( f.kg[ 0 ] + ( f.kg[ 1 ] - f.kg[ 0 ] ) * Math.pow( Math.random(), 1.5 ) );
		this.L = fishLengthCm( this.species, this.kg ) / 100;
		this.value = fishValue( this.species, this.kg );
		this.name = f.name;
		this.pos.copy( at );
		this.yaw = Math.random() * Math.PI * 2;
		this.speed = rand( 1.8, 3.2 );
		this.state = 'swim';
		this.depth = 1; // 0 surfaced .. 1 deep
		this.surfaced = false;
		this.cycle = rand( 4, 10 ); // s until it next comes up
		this.up = false;
		this.life = 420; // s before it moves on, unless hooked
		this.strength = 1;
		this.roll = 0;
		this.announced = false;
		this.active = true;

	}

	// water depth of the fish's centre (m below the surface) for a 0..1 depth
	centerY() {

		const surfaceY = - this.L * 0.03; // the back breaks the surface
		const deepY = - this.L * 0.6 - 5;
		return surfaceY + ( deepY - surfaceY ) * this.depth;

	}

	// nose and tail (world)
	ends( outNose, outTail ) {

		const fx = Math.sin( this.yaw ), fz = Math.cos( this.yaw ), y = this.centerY();
		outNose.set( this.pos.x + fx * this.L * 0.5, y, this.pos.z + fz * this.L * 0.5 );
		outTail.set( this.pos.x - fx * this.L * 0.5, y, this.pos.z - fz * this.L * 0.5 );

	}

}

// distance between segment a-b and segment c-d (closest points), for the harpoon against the body
function segSegDist( a, b, c, d ) {

	const d1 = _v.subVectors( b, a ), d2 = _w.subVectors( d, c ), r = _u.subVectors( a, c );
	const A = d1.dot( d1 ), E = d2.dot( d2 ), F = d2.dot( r );
	let s, t;
	if ( A < 1e-9 && E < 1e-9 ) return { d: r.length(), s: 0 };
	if ( A < 1e-9 ) {

		s = 0; t = Math.min( 1, Math.max( 0, F / E ) );

	} else {

		const C = d1.dot( r );
		if ( E < 1e-9 ) {

			t = 0; s = Math.min( 1, Math.max( 0, - C / A ) );

		} else {

			const B = d1.dot( d2 ), den = A * E - B * B;
			s = den > 1e-9 ? Math.min( 1, Math.max( 0, ( B * F - C * E ) / den ) ) : 0;
			t = ( B * s + F ) / E;
			if ( t < 0 ) { t = 0; s = Math.min( 1, Math.max( 0, - C / A ) ); }
			else if ( t > 1 ) { t = 1; s = Math.min( 1, Math.max( 0, ( B - C ) / A ) ); }

		}

	}

	const p = _x.copy( a ).addScaledVector( d1, s );
	const q = _f.copy( c ).addScaledVector( d2, t );
	return { d: p.distanceTo( q ), s };

}

export class Giants {

	constructor( game ) {

		this.game = game;
		const app = this.app = game.app;
		this.state = game.state;
		// one fish model per giant species (they are drawn from far off: big draw range, real shadows)
		const fp = this.props = new FishProps( { drawRange: 700, shadowRange: 160 } );
		this.giants = [];
		const parked = new Matrix4().makeTranslation( PARK.x, PARK.y, PARK.z );
		for ( const id of GIANT_IDS ) {

			fp.add( 'whole', FISH[ id ].model, parked, 'flat', 10, { cloudy: 0.05, wet: 1, seed: Math.random() } );
			this.giants.push( new Giant( this.giants.length, id ) );

		}

		this.mesh = fp.build();
		this.mesh.name = 'giant-fish';
		app.scene.add( this.mesh );

		// harpoon, tether and the stern gun
		const steel = standard( { color: 0x8a9096, roughness: 0.35, metalness: 1 } );
		const rope = standard( { color: 0x6b5638, roughness: 0.9 } );
		const shaft = new CylinderGeometry( 0.045, 0.045, 1.8, 8 );
		shaft.translate( 0, - 0.9, 0 );
		this.harpoon = new Mesh( shaft, steel );
		const tip = new Mesh( new ConeGeometry( 0.12, 0.45, 8 ), steel );
		tip.position.y = 0.2;
		this.harpoon.add( tip );
		this.harpoon.visible = false;
		this.harpoon.name = 'harpoon';
		const ropeGeo = new CylinderGeometry( 0.035, 0.035, 1, 6 );
		ropeGeo.translate( 0, 0.5, 0 );
		this.rope = new Mesh( ropeGeo, rope );
		this.rope.visible = false;
		this.rope.name = 'harpoon-rope';
		app.scene.add( this.harpoon, this.rope );
		this.gun = null; // the stern harpoon gun (built when the upgrade is owned)

		this.spawnT = rand( 15, 35 );
		this.shot = null; // { pos, vel, age }
		this.reloadT = 0;
		this.target = null; // the hooked / towed giant
		this.cutT = 0;
		this.time = 0;
		this.marks = null;

	}

	// ---------------------------------------------------------------- the stern gun

	placeMount() {

		const st = this.state.stats, boat = this.app.boat.group, combat = this.game.combat;
		if ( st.harpoon && ! this.gun ) {

			this.gun = buildCannon( 1 );
			this.gun.root.scale.setScalar( 0.85 );
			boat.add( this.gun.root );

		}

		if ( ! st.harpoon && this.gun ) {

			this.gun.dispose();
			this.gun = null;

		}

		if ( this.gun && combat ) {

			this.gun.root.position.copy( combat.mounts.stern );
			this.gun.yaw.rotation.y = Math.PI; // facing aft

		}

	}

	sternWorld( out ) {

		const combat = this.game.combat;
		out.copy( combat.mounts.stern );
		out.y += 0.5;
		return this.app.boat.group.localToWorld( out );

	}

	// ---------------------------------------------------------------- per frame

	update( dt ) {

		const app = this.app, game = this.game, combat = game.combat, p = app.player, inp = app.input;
		this.time += dt;
		const st = this.state.stats;
		if ( !! st.harpoon !== !! this.gun ) this.placeMount();
		const aboard = p.mode === 'boat' || p.mode === 'deck';
		const helm = p.mode === 'boat' && ! app.freeCam && ! combat.dead;
		const bc = app.boatCtl;
		const ref = aboard ? bc.position : p.position;

		this.manage( dt, ref );
		for ( const g of this.giants ) if ( g.active ) this.updateGiant( g, dt, bc );

		// ---- the harpoon at the helm
		this.reloadT = Math.max( 0, this.reloadT - dt );
		const panelOpen = game.hud && ( game.hud.invOpen || game.hud.standOpen || game.hud.catchOpen );
		if ( helm && ! panelOpen ) {

			if ( this.target ) {

				// hold Q to cut the tether
				if ( inp.down( 'KeyQ' ) ) {

					this.cutT += dt;
					if ( this.cutT > 1 ) this.release( `You cut the ${ this.target.name } loose` );

				} else this.cutT = 0;

			} else if ( inp.hit( 'KeyQ' ) ) {

				if ( ! st.harpoon ) game.toast( 'No harpoon fitted · buy one in the Weapons tab (Marta or harbour services)', 2600 );
				else if ( this.reloadT > 0 || this.shot ) game.toast( 'Reloading the harpoon…', 1000 );
				else this.fire( st );

			}

			// a prompt when a surfaced giant is in reach (over the helm's own "leave helm" line)
			if ( ! this.target && this.canPrompt( p ) ) {

				const g = this.nearest( bc.position, st.harpoon ? st.harpRange + 15 : 140 );
				if ( g ) p.prompt = st.harpoon
					? { key: 'Q', text: `Harpoon the ${ g.name } (${ U.ft( g.pos.distanceTo( bc.position ) ) } · aim at it)` }
					: { key: '!', text: `A ${ g.name } · fit a harpoon (Weapons) to catch it` };

			}

		}

		if ( this.target && helm && this.canPrompt( p ) ) {

			const g = this.target;
			p.prompt = g.state === 'hooked'
				? { key: 'Q', text: `The ${ g.name } is fighting · hold Q to cut it loose` }
				: { key: 'Q', text: `Towing the ${ g.name } ($${ g.value.toLocaleString() }) · bring it into a harbour · hold Q to cut` };

		}

		this.updateShot( dt );

		// lose the fish: not aboard any more, or the boat went down
		if ( this.target && ( ! aboard || combat.dead ) ) this.release( combat.dead ? 'The tether parted as the boat went down' : null );

		// ---- landing it in a harbour (the pier or a sea station: where harbour services are)
		if ( this.target && combat.service ) this.land( this.target );

		this.updateCard( dt );
		this.updateRope();
		this.updateMarkers();
		this.props.batch.upload();

	}

	// free to show a prompt: none yet, or only the helm's default one
	canPrompt( p ) {

		return ! p.prompt || ( p.prompt.key === 'E' && /helm/i.test( p.prompt.text ) && ! /Harbour|Station|Barge|Rig/.test( p.prompt.text ) );

	}

	manage( dt, ref ) {

		// giants move on when far behind
		for ( const g of this.giants ) {

			if ( ! g.active || g === this.target ) continue;
			g.life -= dt;
			if ( g.life <= 0 || g.pos.distanceTo( ref ) > 1100 ) this.park( g );

		}

		this.spawnT -= dt;
		if ( this.spawnT > 0 ) return;
		this.spawnT = rand( 30, 70 );
		const active = this.giants.filter( ( g ) => g.active ).length;
		if ( active >= MAX_GIANTS ) return;
		const idle = this.giants.filter( ( g ) => ! g.active );
		if ( ! idle.length ) return;
		const g = idle[ Math.floor( Math.random() * idle.length ) ];
		const at = this.openWater( ref );
		if ( at ) g.spawn( at );

	}

	// deep open water 220-520 m from the player, outside the safe zones
	openWater( ref ) {

		const T = this.app.terrainData;
		for ( let i = 0; i < 50; i ++ ) {

			const a = Math.random() * Math.PI * 2, r = rand( 220, 520 );
			const x = ref.x + Math.cos( a ) * r, z = ref.z + Math.sin( a ) * r;
			if ( Math.hypot( x, z - 150 ) > 780 ) continue;
			if ( - T.heightAt( x, z ) < 14 ) continue;
			if ( safeZoneAt( x, z ) ) continue;
			return new Vector3( x, 0, z );

		}

		return null;

	}

	park( g ) {

		g.active = false;
		this.place( g, PARK, 0, 0, 10, 0 );

	}

	nearest( from, range ) {

		let best = null, bd = range;
		for ( const g of this.giants ) {

			if ( ! g.active || ! g.surfaced || g.state !== 'swim' ) continue;
			const d = g.pos.distanceTo( from );
			if ( d < bd ) {

				bd = d;
				best = g;

			}

		}

		return best;

	}

	updateGiant( g, dt, bc ) {

		const T = this.app.terrainData, fx = this.game.combat.fx;
		g.t += dt;
		let curl = Math.sin( g.t * 2.2 ) * 0.18;
		if ( g.state === 'swim' ) {

			// surfacing cycle: ~25 s up, ~20 s down
			g.cycle -= dt;
			if ( g.cycle <= 0 ) {

				g.up = ! g.up;
				g.cycle = g.up ? rand( 22, 32 ) : rand( 16, 26 );
				if ( g.up ) {

					fx.splash( g.pos, 0.9 );
					this.announce( g );

				}

			}

			g.depth += ( ( g.up ? 0 : 1 ) - g.depth ) * ( 1 - Math.exp( - dt * 0.6 ) );
			// wander, keeping to deep water
			const look = 30;
			const deepAhead = - T.heightAt( g.pos.x + Math.sin( g.yaw ) * look, g.pos.z + Math.cos( g.yaw ) * look );
			let turn = Math.sin( g.t * 0.13 + g.slot ) * 0.08;
			if ( deepAhead < 12 || safeZoneAt( g.pos.x + Math.sin( g.yaw ) * look, g.pos.z + Math.cos( g.yaw ) * look ) ) turn = 0.5;
			g.yaw = wrap( g.yaw + turn * dt );
			g.pos.x += Math.sin( g.yaw ) * g.speed * dt;
			g.pos.z += Math.cos( g.yaw ) * g.speed * dt;
			g.roll += ( 0 - g.roll ) * dt;

		} else {

			// on the tether: it keeps to the surface
			g.depth += ( 0 - g.depth ) * ( 1 - Math.exp( - dt * 2 ) );
			const stern = this.sternWorld( _w );
			if ( g.state === 'hooked' ) {

				// fights: swims hard away from the boat, thrashing, and tires
				const away = Math.atan2( g.pos.x - stern.x, g.pos.z - stern.z ) + Math.sin( g.t * 0.7 ) * 0.9;
				g.yaw += wrap( away - g.yaw ) * Math.min( 1, dt * 1.5 );
				const sp = 5.5 * ( 0.4 + 0.6 * g.strength );
				g.pos.x += Math.sin( g.yaw ) * sp * dt;
				g.pos.z += Math.cos( g.yaw ) * sp * dt;
				g.strength -= dt / g.stamina;
				curl = Math.sin( g.t * 6 ) * 0.45 * ( 0.4 + 0.6 * g.strength );
				if ( Math.random() < dt * 3 ) fx.splash( _v.set( g.pos.x - Math.sin( g.yaw ) * g.L * 0.4, 0, g.pos.z - Math.cos( g.yaw ) * g.L * 0.4 ), 0.5 );
				if ( g.strength <= 0 ) {

					g.state = 'towed';
					this.game.toast( `The ${ g.name } is spent · tow it into a harbour (the pier or a sea station) to land it`, 4200 );

				}

			} else {

				// towed: rolls over and follows the boat
				g.roll += ( Math.PI / 2 - g.roll ) * ( 1 - Math.exp( - dt * 1.2 ) );
				curl = Math.sin( g.t * 1.4 ) * 0.04;
				const toward = Math.atan2( stern.x - g.pos.x, stern.z - g.pos.z );
				g.yaw += wrap( toward - g.yaw ) * Math.min( 1, dt * 0.8 );

			}

			// the tether: the fish is held within ROPE of the stern, and the pull goes into the boat
			const dx = g.pos.x - stern.x, dz = g.pos.z - stern.z;
			const d = Math.hypot( dx, dz );
			const R = ROPE + g.L * 0.5;
			if ( d > R ) {

				const nx = dx / d, nz = dz / d;
				const over = d - R;
				if ( g.state === 'hooked' ) {

					// the fish wins some of it: the boat is dragged toward it
					const pull = ( 2.2 + 3 * g.strength ) * Math.min( 1, over );
					bc.velocity.x += nx * pull * dt;
					bc.velocity.z += nz * pull * dt;

				}

				g.pos.x = stern.x + nx * R;
				g.pos.z = stern.z + nz * R;

			}

			if ( g.state === 'towed' ) {

				// a tonne-heavy carcass behind you: the boat is slowed
				const k = Math.exp( - dt * 0.3 );
				bc.velocity.x *= k;
				bc.velocity.z *= k;

			}

		}

		g.surfaced = g.depth < 0.25;
		this.place( g, _v.set( g.pos.x, g.centerY(), g.pos.z ), g.yaw, g.roll, g.L, curl );

	}

	// write the giant's instance: centre, heading, roll about its own axis, length, tail curl
	place( g, center, yaw, roll, L, curl ) {

		const fp = this.props, i = g.slot;
		// model axes: z the nose, y the back, x = y x z ('flat' pose, belly down)
		_f.set( Math.sin( yaw ), 0, Math.cos( yaw ) );
		_u.set( 0, 1, 0 ).applyAxisAngle( _f, roll );
		_x.crossVectors( _u, _f );
		_m.makeBasis( _x, _u, _f );
		_q.setFromRotationMatrix( _m );
		const D = fp.batch.data, o = i * 16;
		D[ o ] = center.x; D[ o + 1 ] = center.y; D[ o + 2 ] = center.z; D[ o + 3 ] = L;
		D[ o + 4 ] = _q.x; D[ o + 5 ] = _q.y; D[ o + 6 ] = _q.z; D[ o + 7 ] = _q.w;
		D[ o + 9 ] = curl; D[ o + 10 ] = 0; D[ o + 11 ] = 0.1;
		fp.pos[ i * 4 ] = center.x; fp.pos[ i * 4 + 1 ] = center.y; fp.pos[ i * 4 + 2 ] = center.z; fp.pos[ i * 4 + 3 ] = L;

	}

	announce( g ) {

		if ( g.announced ) return;
		const ref = this.app.player.mode === 'walk' || this.app.player.mode === 'swim' ? this.app.player.position : this.app.boatCtl.position;
		const d = g.pos.distanceTo( ref );
		if ( d > 650 ) return;
		g.announced = true;
		this.game.toast( `A ${ g.name } is surfacing ${ U.ft( Math.round( d / 10 ) * 10 ) } to the ${ compassWord( ref.x, ref.z, g.pos.x, g.pos.z ) } · worth up to $${ FISH[ g.species ].value[ 1 ].toLocaleString() }`, 4500 );

	}

	// ---------------------------------------------------------------- the harpoon

	fire( st ) {

		const combat = this.game.combat;
		const from = this.sternWorld( new Vector3() );
		// aim assist: with the crosshair on (or close to) a surfaced giant, go for its back just above the
		// water (a point on the waterline would be reached at too flat an angle and fall short)
		const aim = combat.aim.clone();
		let best = null, bd = Infinity;
		for ( const g of this.giants ) {

			if ( ! g.active || g.state !== 'swim' || g.depth > 0.45 ) continue;
			const d = Math.hypot( g.pos.x - aim.x, g.pos.z - aim.z );
			if ( d < g.L * 0.9 + 4 && d < bd ) {

				bd = d;
				best = g;

			}

		}

		if ( best ) aim.set( best.pos.x, 0.4, best.pos.z );
		const dir = _v.copy( aim ).sub( from );
		const dist = Math.min( dir.length(), st.harpRange );
		dir.normalize();
		// a slight lob so it reaches the aim point at its range
		const t = dist / HARPOON_SPEED;
		const vel = dir.clone().multiplyScalar( HARPOON_SPEED );
		vel.y += 0.5 * 9.81 * t;
		this.shot = { pos: from, prev: from.clone(), vel, age: 0, life: st.harpRange / HARPOON_SPEED * 1.25 };
		this.harpoon.visible = true;
		this.reloadT = 2.5;
		combat.sfx.shot( from, 'rifle', 1.2 );
		if ( this.gun ) this.gun.yaw.rotation.y = Math.PI;

	}

	updateShot( dt ) {

		const s = this.shot;
		if ( ! s ) return;
		s.prev.copy( s.pos );
		s.vel.y -= 9.81 * dt;
		if ( s.pos.y < 0 ) s.vel.multiplyScalar( Math.exp( - dt * 6 ) ); // the water stops it quickly
		s.pos.addScaledVector( s.vel, dt );
		s.age += dt;
		// the harpoon flies point first
		this.harpoon.position.copy( s.pos );
		this.harpoon.quaternion.setFromUnitVectors( _u.set( 0, 1, 0 ), _w.copy( s.vel ).normalize() );
		// a hit on a surfaced giant's body (a capsule along it)
		const nose = new Vector3(), tail = new Vector3();
		for ( const g of this.giants ) {

			if ( ! g.active || g.state !== 'swim' || g.depth > 0.45 ) continue;
			g.ends( nose, tail );
			const r = segSegDist( s.prev, s.pos, tail, nose );
			if ( r.d < g.L * 0.13 + 0.3 ) {

				this.hook( g );
				return;

			}

		}

		// it carries on a little way under the surface (a fish at the waterline is still hit)
		if ( s.prev.y >= 0 && s.pos.y < 0 ) this.game.combat.fx.splash( s.pos, 0.25 );
		if ( s.pos.y < - 2 || s.age > s.life ) {

			this.shot = null;
			this.harpoon.visible = false;

		}

	}

	hook( g ) {

		this.shot = null;
		this.harpoon.visible = false;
		const st = this.state.stats;
		g.state = 'hooked';
		g.strength = 1;
		g.stamina = FISH[ g.species ].stamina / Math.max( 0.5, st.harpPower || 1 );
		g.life = 1e9;
		this.target = g;
		this.game.combat.fx.splash( g.pos, 1 );
		this.game.combat.fx.hit( _v.set( g.pos.x, 0.5, g.pos.z ), _w.set( 0, 1, 0 ), 0.3 );
		this.game.toast( `Harpooned a ${ g.name } (${ U.len( g.L * 100 ) }) · let it tire, then tow it in`, 3600 );

	}

	release( message ) {

		const g = this.target;
		this.target = null;
		this.cutT = 0;
		if ( g ) {

			g.state = 'swim';
			g.up = false;
			g.cycle = rand( 10, 20 );
			g.life = 60;
			g.roll = 0;

		}

		if ( message ) this.game.toast( message, 2600 );

	}

	// towed into a harbour: landed and sold like any other fish (the catch card, then the fish is in your
	// hold: sell it at the harbour or to Joe)
	land( g ) {

		const s = this.state, game = this.game;
		this.target = null;
		this.park( g );
		const entry = s.addFish( g.species, g.kg, game.hour );
		const info = s.lastCatch;
		if ( game.hud ) {

			game.hud.showCatch( info, 12000 );
			this.card = { t0: performance.now(), mouse: true }; // dismissed in updateCard (click, E, Esc or the timer)

		}
		if ( this.app.audio && this.app.audio.coin ) this.app.audio.coin();
		game.toast( entry ? `Landed the ${ g.name }: $${ g.value.toLocaleString() } · sell it in the Sell catch tab (U) or to Joe` : `Landed the ${ g.name }`, 5000 );
		this.spawnT = Math.min( this.spawnT, rand( 20, 40 ) );

	}

	// the landed giant's catch card: click, E, Esc or 12 s close it (the rod's own cards are handled in
	// Game.update; this one is ours)
	updateCard( dt ) {

		const c = this.card, hud = this.game.hud, inp = this.app.input;
		if ( ! c ) return;
		if ( ! hud || ! hud.catchOpen ) {

			this.card = null;
			return;

		}

		const t = ( performance.now() - c.t0 ) / 1000; // real seconds since it came up
		// a click: a fresh press of the button (not one still held from before the card came up)
		const down = inp.mouseDown;
		const click = down && ! c.mouse;
		c.mouse = down;
		if ( t > 0.4 && ( click || inp.hit( 'KeyE' ) || inp.hit( 'Escape' ) ) || t > 12 ) {

			hud.hideCatch();
			this.card = null;

		}

	}

	// ---------------------------------------------------------------- rope, minimap

	updateRope() {

		let a = null, b = null;
		if ( this.shot ) {

			a = this.sternWorld( _v );
			b = _w.copy( this.shot.pos );

		} else if ( this.target ) {

			const g = this.target;
			a = this.sternWorld( _v );
			// tied off at the fish's head
			b = _w.set( g.pos.x + Math.sin( g.yaw ) * g.L * 0.35, 0.1, g.pos.z + Math.cos( g.yaw ) * g.L * 0.35 );

		}

		this.rope.visible = !! a;
		if ( ! a ) return;
		const d = _f.subVectors( b, a );
		const len = d.length();
		this.rope.position.copy( a );
		this.rope.quaternion.setFromUnitVectors( _u.set( 0, 1, 0 ), d.normalize() );
		this.rope.scale.set( 1, Math.max( 0.01, len ), 1 );

	}

	updateMarkers() {

		const map = this.game.minimap;
		if ( ! map || ! map.addMarker ) return;
		if ( ! this.marks ) {

			const css = document.createElement( 'style' );
			css.textContent = '.gm-mk.is-giant > i { background: #ff7ae0; color: #2a0624; width: calc(18 * var(--tw-u)); height: calc(18 * var(--tw-u)); margin: calc(-9 * var(--tw-u)) 0 0 calc(-9 * var(--tw-u)); }';
			document.head.append( css );
			const icon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 12c3-4 7-6 11-6 3 0 6 2 8 5l-2 1 2 1c-2 3-5 5-8 5-4 0-8-2-11-6Zm13-1a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/></svg>';
			this.marks = this.giants.map( ( g ) => map.addMarker( { id: 'giant-' + g.slot, kind: 'giant', icon, pos: () => g.active && ( g.surfaced || g.state !== 'swim' ) ? g.pos : null } ) );

		}

	}

}
