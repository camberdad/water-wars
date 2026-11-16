import { Mesh, Group, Vector3 } from '../engine/index.js';
import { prepare, mergePrepared, cylinder, sphere, torus, mat4 } from '../world/boat/GeoKit.js';
import { createPropMaterial, createLineMaterial, PAT } from './GameMaterials.js';
import { buildLineGeometry } from './FishingRod.js';
import { FISH, FISH_IDS, fishValue } from './FishTable.js';
import { pickSpecies, rollWeight } from './Bites.js';
import { dangerZoneAt } from './DangerZones.js';

// Trawl net (Water Wars 1.13.5). The trawl net upgrade (Gear.trawl) lets you shoot a net astern with N
// while aboard at sea, and haul it back with N again. Towed slowly (it drags: the boat can't go fast with
// it out) it fills with fish, crabs, lobster and squid, and now and then a dolphin, a seal, a sea turtle
// or a manatee gets caught in it. Hauled in, the catch is sorted on deck: every protected animal has to be
// thrown back before the rest can be kept (GameHUD.openSort).

export const NET_KEY = 'KeyN';
export const MIN_DEPTH = 4; // m of water to shoot the net
export const SNAG_DEPTH = 2.5; // shallower than this under the net and it comes in before it snags
export const DOCK_CLEAR = 70; // m from the berth: no trawling in the harbour mouth
export const TOW_MIN = 0.6; // m/s: slower than this and the net hangs slack (nothing swims in)
export const TOW_MAX = 6.5; // m/s: faster than this for a moment and the net is hauled in before it tears
export const NET_LEN = 32; // m of warp astern
export const SHOOT_S = 4; // s to pay the net out
export const HAUL_S = 3.5; // s to haul it back
export const BYCATCH_CHANCE = 0.14; // of each creature that swims into the net: a protected animal
export const CRUST_SHARE = 0.4; // of the keepers: crabs, lobster and squid (the rest are fish)
const KEEP_TIERS = new Set( [ 'common', 'uncommon' ] ); // a trawl catches the everyday fish, not trophies

// Protected animals that turn up in a trawl. They can't be kept: they go back into the sea alive.
// w: how often among them; maxDepth: only in water shallower than this (manatees graze the shallows)
export const PROTECTED = {
	dolphin: { name: 'Bottlenose dolphin', icon: '🐬', kg: [ 150, 300 ], w: 0.3 },
	seal: { name: 'Harbor seal', icon: '🦭', kg: [ 50, 130 ], w: 0.2 },
	greenTurtle: { name: 'Green sea turtle', icon: '🐢', kg: [ 60, 180 ], w: 0.25 },
	loggerhead: { name: 'Loggerhead sea turtle', icon: '🐢', kg: [ 70, 160 ], w: 0.15 },
	manatee: { name: 'West Indian manatee', icon: '🐄', kg: [ 300, 550 ], w: 0.2, maxDepth: 15 },
};
export const PROTECTED_IDS = Object.keys( PROTECTED );
// the trawl-only keepers (FishTable: `trawl` habitat weights)
export const TRAWL_IDS = FISH_IDS.filter( ( id ) => FISH[ id ].trawl );

function pickWeighted( ids, weight, rng ) {

	let total = 0;
	const w = ids.map( ( id ) => {

		const x = Math.max( 0, weight( id ) );
		total += x;
		return x;

	} );
	if ( total <= 0 ) return null;
	let r = rng() * total;
	for ( let i = 0; i < ids.length; i ++ ) {

		r -= w[ i ];
		if ( r <= 0 ) return ids[ i ];

	}

	return ids[ ids.length - 1 ];

}

// One creature that swims into the net: { protected: true, id, name, icon, kg } or
// { protected: false, species, name, icon, kg, value }. hab: the water type weights (Bites.habitatAt)
export function rollNetItem( { hab, depth = 20, tier = 0, hour = 12, rng = Math.random } ) {

	if ( rng() < BYCATCH_CHANCE ) {

		const id = pickWeighted( PROTECTED_IDS, ( k ) => ( PROTECTED[ k ].maxDepth && depth > PROTECTED[ k ].maxDepth ? 0 : PROTECTED[ k ].w ), rng );
		const a = PROTECTED[ id ];
		const kg = Math.round( ( a.kg[ 0 ] + ( a.kg[ 1 ] - a.kg[ 0 ] ) * rng() ) * 10 ) / 10;
		return { protected: true, id, name: a.name, icon: a.icon, kg };

	}

	let species = null;
	if ( rng() < CRUST_SHARE ) species = pickWeighted( TRAWL_IDS, ( k ) => {

		let x = 0;
		for ( const w in FISH[ k ].trawl ) x += FISH[ k ].trawl[ w ] * ( hab[ w ] || 0 );
		return x;

	}, rng );
	// fish: the everyday ones of these waters (the rare tiers only ever come up on a rod)
	for ( let i = 0; i < 8 && ! species; i ++ ) {

		const id = pickSpecies( hab, hour, rng, { tier, luck: 1 } );
		if ( id && KEEP_TIERS.has( FISH[ id ].tier ) ) species = id;

	}

	if ( ! species ) species = pickWeighted( TRAWL_IDS, () => 1, rng );
	const kg = Math.round( rollWeight( species, rng ) * 100 ) / 100;
	return { protected: false, species, name: FISH[ species ].name, icon: FISH[ species ].icon || '🐟', kg, value: fishValue( species, kg ) };

}

// seconds until the next creature swims in, at full towing speed: a faster fill in the danger tiers
export function fillDelay( tier, netRate, rng = Math.random ) {

	const base = tier >= 2 ? 17 : 24;
	return base * ( 0.5 + rng() ) / Math.max( 0.1, netRate || 1 );

}

// can the catch be kept? (every protected animal thrown back first)
export const protectedLeft = ( items ) => items.filter( ( it ) => it.protected && ! it.released ).length;

// the net, its warps and floats (net frame: +z toward the boat, the mouth at z = 0, the bag astern)
function buildNetGeometry() {

	const parts = [];
	const add = ( geo, style, m ) => parts.push( prepare( geo, { ...style, matrix: m } ) );
	const NET = { color: 0x24433a, rough: 0.95, pattern: PAT.cloth };
	add( cylinder( 1.3, 0.38, 7, 16, 4, true ), NET, mat4( 0, 0, - 3.5, Math.PI / 2 ) ); // the bag
	add( torus( 1.3, 0.05, 6, 28 ), { color: 0x6b6b60, rough: 0.6, metal: 0.6 }, mat4( 0, 0, 0 ) ); // the mouth's frame
	for ( let i = - 2; i <= 2; i ++ ) {

		const x = i * 0.5;
		add( sphere( 0.16, 10, 8 ), { color: 0xff6a1a, rough: 0.5 }, mat4( x, Math.sqrt( 1.3 * 1.3 - x * x ) + 0.08, 0 ) ); // floats

	}

	for ( const s of [ - 1, 1 ] ) add( cylinder( 0.06, 0.06, 1.2, 6 ), { color: 0x3a3a3a, rough: 0.5, metal: 0.8 }, mat4( s * 1.3, 0, 0 ) ); // trawl doors' bridles

	return mergePrepared( parts );

}

function buildCodEndGeometry() {

	return mergePrepared( [ prepare( sphere( 1, 14, 10 ), { color: 0x2c4f44, rough: 0.95, pattern: PAT.cloth } ) ] );

}

const _v = new Vector3(), _w = new Vector3(), _b = new Vector3(), _d = new Vector3(), _m = new Vector3();

// Water Wars 1.13.6: the warps and the net are a rope, not a rod. Two knots, the middle of the warps and
// the net's mouth, each follow the one ahead of it on a fixed length of line (a towed line dragged through
// the water: it only ever pulls, never pushes). On a straight course they stream out dead astern; in a
// turn they swing out wide and the warps bow, then the net comes round behind the boat again, pulling at
// an angle until it does. node: the knot (moved, horizontal), lead: the point ahead of it, L: line length
export function followRope( node, lead, L, payout = 0, back = null ) {

	let dx = node.x - lead.x, dz = node.z - lead.z;
	let d = Math.hypot( dx, dz );
	if ( d < 1e-4 ) {

		// on top of the lead (just shot): out astern
		dx = back ? back.x : 0;
		dz = back ? back.z : - 1;
		d = 0;

	} else {

		dx /= d;
		dz /= d;

	}

	// taut: held at the line's length; slack: paid out away from the lead (no further than the line allows)
	const to = d > L ? L : Math.min( L, d + payout );
	node.x = lead.x + dx * to;
	node.z = lead.z + dz * to;
	return d / Math.max( L, 1e-4 ); // > 1 while the line is taut and pulling

}

export class Trawl {

	constructor( game ) {

		this.game = game;
		this.app = game.app;
		this.state = 'stowed'; // 'stowed' | 'out' (paying out / towing) | 'in' (hauling)
		this.len = 0; // 0..1 of the warp out
		this.items = [];
		this.wait = 0;
		this.fast = 0;
		this.waterY = 0;
		this.group = null;
		this.knots = null; // [ the middle of the warps, the net's mouth ] (world, horizontal): see followRope
		this.taut = 0;
		this._dt = 1 / 60;

	}

	get level() {

		return this.game.state.stats.trawlNet | 0;

	}

	get size() {

		return this.game.state.stats.netSize | 0;

	}

	get full() {

		return this.items.length >= this.size;

	}

	aboard() {

		const p = this.app.player;
		return ( p.mode === 'boat' || p.mode === 'deck' ) && ! ( this.game.combat && this.game.combat.dead );

	}

	depthAt( x, z ) {

		return Math.max( 0, - this.app.terrainData.heightAt( x, z ) );

	}

	// ---- meshes (built the first time the net goes out)
	build() {

		if ( this.group ) return;
		const scene = this.app.scene;
		const mat = createPropMaterial( 'trawlNet' );
		this.group = new Group();
		this.group.name = 'trawl-net';
		this.net = new Mesh( buildNetGeometry(), mat );
		this.cod = new Mesh( buildCodEndGeometry(), mat );
		this.cod.position.set( 0, 0, - 7.1 );
		this.group.add( this.net, this.cod );
		this.group.visible = false;
		scene.add( this.group );
		this.warps = [ - 1, 1 ].map( ( s ) => {

			const lineMat = createLineMaterial( 24 );
			const line = new Mesh( buildLineGeometry( 24 ), lineMat );
			line.name = 'trawl-warp';
			line.frustumCulled = false;
			line.castShadow = false;
			line.visible = false;
			scene.add( line );
			return { s, line, lineMat };

		} );
		try {

			this.slot = this.app.query.allocate( 'trawl', 1 );

		} catch ( e ) {

			this.slot = - 1;

		}

	}

	// ---- N: out or in
	toggle() {

		const game = this.game;
		if ( ! this.level ) {

			game.toast( 'No trawl net fitted · buy one at harbour services (Fishing tab)', 3000 );
			return;

		}

		if ( this.state === 'out' ) return this.haul();
		if ( this.state === 'in' ) return;
		if ( game.hud && game.hud.sortOpen ) return;
		const b = this.app.boatCtl.position, berth = this.app.boatCtl.berth.position;
		if ( Math.hypot( b.x - berth.x, b.z - berth.z ) < DOCK_CLEAR ) {

			game.toast( 'Too close to the harbour to trawl · head out to open water', 2600 );
			return;

		}

		if ( this.depthAt( b.x, b.z ) < MIN_DEPTH ) {

			game.toast( 'Too shallow to trawl here', 2200 );
			return;

		}

		this.build();
		this.state = 'out';
		this.knots = null; // (laid out from the stern on the first frame)
		this.items = [];
		this.wait = fillDelay( this.tier(), this.game.state.stats.netRate );
		this.fast = 0;
		game.toast( '🕸 Net going out · tow it slowly, it drags · N to haul it in', 3200 );

	}

	haul( why = null ) {

		if ( this.state !== 'out' ) return;
		this.state = 'in';
		if ( why ) this.game.toast( why, 2600 );

	}

	tier() {

		const t = this.netPoint ? dangerZoneAt( this.netPoint.x, this.netPoint.z ) : null;
		return t ? t.tier : 0;

	}

	update( dt ) {

		const game = this.game, app = this.app, bc = app.boatCtl, inp = app.input;
		this._dt = Math.min( 0.1, Math.max( 0, dt ) );
		// the sorting screen: Space keeps the catch (once the protected animals are back in the sea)
		if ( game.hud && game.hud.sortOpen ) {

			if ( game.takeSpace() ) game.hud.keepSort();
			bc.netDrag = 0;
			return;

		}

		if ( ! this.level && this.state !== 'stowed' ) this.stow();
		const aboard = this.aboard();
		if ( aboard && inp.hit( NET_KEY ) ) this.toggle();
		if ( this.state === 'stowed' ) {

			bc.netDrag = 0;
			return;

		}

		// dead: the net is lost with what was in it; ashore / overboard: it comes straight in
		if ( game.combat && game.combat.dead ) {

			this.items = [];
			this.stow();
			return;

		}

		if ( ! aboard ) {

			this.len = 0;
			this.landed();
			return;

		}

		const speed = Math.hypot( bc.velocity.x, bc.velocity.z );
		if ( this.state === 'out' ) {

			this.len = Math.min( 1, this.len + dt / SHOOT_S );
			const np = this.netPoint;
			if ( np && this.len > 0.5 && this.depthAt( np.x, np.z ) < SNAG_DEPTH ) this.haul( 'Shallow water · hauling the net before it snags' );
			this.fast = speed > TOW_MAX ? this.fast + dt : 0;
			if ( this.fast > 1 ) this.haul( 'Too fast for the net · hauling it in before it tears' );
			if ( this.state === 'out' && this.len >= 1 && ! this.full && speed > TOW_MIN ) {

				// a net towed at a good trawling speed fills fastest
				this.wait -= dt * Math.min( 1.3, Math.max( 0.4, speed / 2.2 ) );
				if ( this.wait <= 0 ) this.catchOne();

			}

		} else {

			this.len = Math.max( 0, this.len - dt / HAUL_S );
			if ( this.len <= 0 ) this.landed();

		}

		// the net drags (about 3.5 knots flat out with the engine of the moment), pulling along the warps:
		// only while they're taut (Trawl.layLines sets the direction: BoatController.towDir)
		bc.netDrag = bc.maxThrust * 0.065 * this.len * Math.min( 1, Math.max( 0, ( this.taut - 0.9 ) / 0.1 ) );

	}

	catchOne() {

		const game = this.game, np = this.netPoint || this.app.boatCtl.position;
		const depth = this.depthAt( np.x, np.z );
		const it = rollNetItem( { hab: game.habitatAtPoint( np.x, np.z, depth ), depth, tier: this.tier(), hour: game.hour } );
		this.items.push( it );
		this.wait = fillDelay( this.tier(), game.state.stats.netRate );
		const au = this.app.audio;
		if ( au && au.fishSplash ) au.fishSplash( np, it.protected ? 0.8 : 0.35 );
		if ( it.protected ) game.toast( `${ it.icon } A ${ it.name.toLowerCase() } is caught in the net! Haul in and set it free`, 3200 );
		if ( this.full ) game.toast( `🕸 The net is full (${ this.items.length }) · N to haul it in`, 3200 );

	}

	// the net is aboard: sort the catch, or nothing to sort
	landed() {

		const items = this.items;
		this.stow();
		if ( ! items.length ) {

			this.game.toast( 'The net came up empty', 2000 );
			return;

		}

		if ( this.game.hud ) this.game.hud.openSort( items, ( kept ) => this.keep( kept ) );
		else this.keep( items.filter( ( it ) => ! it.protected ) );

	}

	stow() {

		this.state = 'stowed';
		this.len = 0;
		this.items = [];
		this.knots = null;
		this._np = null;
		this.taut = 0;
		this.app.boatCtl.netDrag = 0;
		this.app.boatCtl.towDir = null;
		if ( this.group ) {

			this.group.visible = false;
			for ( const w of this.warps ) w.line.visible = false;

		}

	}

	// the keepers go in the hold (what doesn't fit goes back in the sea)
	keep( kept ) {

		const game = this.game, s = game.state;
		let n = 0, value = 0, lost = 0;
		for ( const it of kept ) {

			const e = s.addFish( it.species, it.kg, game.hour );
			if ( e ) {

				n ++;
				value += e.value;

			} else lost ++;

		}

		if ( n || lost ) game.toast( `Kept ${ n } from the net${ value ? ` · $${ value.toLocaleString() }` : '' }${ lost ? ` · no room in the hold for ${ lost }, thrown back` : '' }`, 3600 );

	}

	// the net's mouth in the water astern (world), or null while stowed
	get netPoint() {

		return this.state === 'stowed' ? null : this._np;

	}

	// late in the frame, from the boat's final pose (Game.lateUpdate): the net astern and the warps to it
	layLines() {

		if ( ! this.group || this.state === 'stowed' ) return;
		const app = this.app, boat = app.boat.group, combat = this.game.combat;
		boat.updateWorldMatrix( true, true );
		const back = _b.set( 0, 0, - 1 ).transformDirection( boat.matrixWorld ).setY( 0 ).normalize();
		const stern = combat.mounts.stern;
		const halfX = Math.max( 0.5, Math.min( 1.4, combat.hitHalf.x - 0.4 ) );
		const sternW = boat.localToWorld( _w.set( 0, stern.y, stern.z ) );
		// the rope: stern -> the middle of the warps -> the net's mouth, half the warp each (paid out at
		// about 8 m/s while the net goes over, hauled back in as the warp shortens)
		const half = ( 2 + NET_LEN * this.len ) / 2;
		// (1.15.1: a boat that jumped, reset to its berth or sent home, lays the net out afresh behind it
		// instead of dragging a rope hundreds of metres long, taut, to where it was)
		const far = this.knots && Math.hypot( this.knots[ 0 ].x - sternW.x, this.knots[ 0 ].z - sternW.z ) > half + 30;
		if ( ! Number.isFinite( sternW.x + sternW.z ) ) return;
		if ( ! this.knots || far || ! Number.isFinite( this.knots[ 0 ].x + this.knots[ 1 ].x ) ) this.knots = [ new Vector3( sternW.x, 0, sternW.z ), new Vector3( sternW.x, 0, sternW.z ) ];
		const [ mid, np ] = this.knots;
		const pay = this.state === 'out' && this.len < 1 ? 8 * this._dt : 0; // (only while it goes over: a slack line astern isn't pushed)
		const t1 = followRope( mid, sternW, half, pay, back );
		const t2 = followRope( np, mid, half, pay, back );
		this.taut = Math.max( t1, t2 );
		this._np = np;
		// the pull on the boat: from the stern toward the middle of the warps
		const bc = this.app.boatCtl;
		const tow = bc.towDir || ( bc.towDir = new Vector3() );
		tow.set( mid.x - sternW.x, 0, mid.z - sternW.z );
		if ( tow.lengthSq() > 1e-6 ) tow.normalize();
		else tow.copy( back );
		bc.towZ = stern.z;
		// the water at the net (one water query), eased
		const q = app.query;
		if ( q && this.slot >= 0 ) {

			q.setPoint( this.slot, np.x, np.z );
			const h = q.cpuValid ? q.cpu[ this.slot * 4 ] : NaN;
			if ( Number.isFinite( h ) ) this.waterY += ( h - this.waterY ) * 0.2;

		}

		// the mouth sits just under the surface with its floats riding on it, facing up its warps (toward the
		// middle knot); the bag fills out with the catch
		const ny = this.waterY - 1.15;
		const dir = _d.set( mid.x - np.x, 0, mid.z - np.z );
		if ( dir.lengthSq() < 1e-6 ) dir.set( - back.x, 0, - back.z );
		dir.normalize();
		this.group.position.set( np.x, ny, np.z );
		this.group.rotation.set( 0, Math.atan2( dir.x, dir.z ), 0 );
		const fill = this.size ? this.items.length / this.size : 0;
		this.cod.scale.setScalar( 0.4 + 0.7 * fill );
		this.group.visible = this.len > 0.08;
		// (the net's own port side: its +x)
		const sx = dir.z, sz = - dir.x;
		for ( const w of this.warps ) {

			const tip = boat.localToWorld( _v.set( w.s * halfX, stern.y + 0.3, stern.z ) );
			const L = w.lineMat.uniforms;
			L.lineA.value.copy( tip );
			// to the mouth's upper corner on this side
			L.lineB.value.set( np.x + sx * 1.3 * w.s, ny + 0.4, np.z + sz * 1.3 * w.s );
			// through the middle knot (spread to this warp's side of it, sagging when slack): the quadratic
			// curve's control point is placed so the curve passes through it
			const rx = L.lineB.value.x - tip.x, rz = L.lineB.value.z - tip.z, rl = Math.hypot( rx, rz ) || 1;
			const spread = ( halfX + 1.3 ) / 2 * w.s;
			_m.set( mid.x - rz / rl * spread, ( tip.y + L.lineB.value.y ) / 2 - ( this.taut > 0.98 ? 0.5 : 1.4 ), mid.z + rx / rl * spread );
			L.lineCtl.value.copy( _m ).multiplyScalar( 2 ).addScaledVector( tip, - 0.5 ).addScaledVector( L.lineB.value, - 0.5 );
			L.lineShow.value = 1.6;
			w.line.visible = true;

		}

	}

	// the prompt while the net is out (late, after the other prompts)
	prompt() {

		const p = this.app.player;
		if ( ! this.aboard() || this.state !== 'out' || this.len < 1 ) return;
		// (over the helm's own "Leave helm" line, not over a harbour, loot or stern-rod prompt)
		if ( p.prompt && ! ( p.prompt.key === 'E' && /^Leave helm/.test( p.prompt.text || '' ) ) ) return;
		p.prompt = { key: 'N', text: `Haul in the net (${ this.items.length }/${ this.size })` };

	}

}
