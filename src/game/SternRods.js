import { Mesh, Group, Vector3 } from '../engine/index.js';
import { prepare, mergePrepared, cylinder, sphere, torus, mat4 } from '../world/boat/GeoKit.js';
import { createPropMaterial, createLineMaterial } from './GameMaterials.js';
import { buildLineGeometry } from './FishingRod.js';
import { FISH } from './FishTable.js';
import { pickSpecies, rollWeight, biteDelay } from './Bites.js';
import { dangerZoneAt } from './DangerZones.js';

// Stern rods (Water Wars 1.8): the rod holder upgrade puts 1-3 extra rods in holders on the back of the
// boat. Whenever you are aboard and the boat is nearly stopped (drifting or crawling) their lines are
// out astern and fish for you, at a slower pace than a rod in your hands, and (1.10) only out in the Open
// Sea and the Deadwater (danger tiers 2 and 3). When one bends over, press B
// within BITE_WINDOW seconds: you leave the helm if you are at it, your own line comes in, and the
// stern rod's fish is on your rod for the usual fight. Miss it and the fish shakes the hook.

export const BITE_WINDOW = 9; // seconds to grab a bent stern rod
export const STERN_SLOW = 7; // stern rods bite this many times slower than a rod in your hands (1.8.3: 4.5, 1.10: 7)
export const STERN_MIN_TIER = 2; // they only get bites out in the Open Sea and the Deadwater (1.10)
const MAX_SPEED = 2.6; // m/s: faster than this and the stern lines come in
const SET_SPEED = 2.0; // m/s: slower than this for SET_DELAY and they go back out (no flicker in between)
const SET_DELAY = 2; // s slow before the lines go back out
const LINE_LEN = 18; // m of line astern
const ROD_LEN = 2.1;
const _v = new Vector3(), _w = new Vector3(), _tip = new Vector3( 0, ROD_LEN, 0 );

// the holders, by count (boat-local: x across, z along, + forward); filled from the stern mount
function holderSpots( n, stern, halfX ) {

	const x = Math.max( 0.6, halfX - 0.35 );
	const spots = [
		{ x: - x, z: stern.z + 0.25, side: - 1 },
		{ x, z: stern.z + 0.25, side: 1 },
		{ x: - x, z: stern.z + 1.4, side: - 1.8 },
	];
	return spots.slice( 0, n );

}

// one rod in a holder: a tube holder, the blank, the reel and a few guides (rod along +Y from the butt)
function buildRodGeometry() {

	const parts = [];
	const add = ( geo, style, m ) => parts.push( prepare( geo, { ...style, matrix: m } ) );
	add( cylinder( 0.035, 0.035, 0.32, 10, 1, true ), { color: 0xc8ccd0, rough: 0.3, metal: 1 }, mat4( 0, 0.06, 0 ) );
	add( cylinder( 0.022, 0.024, 0.42, 10 ), { color: 0x2a2a2a, rough: 0.8 }, mat4( 0, 0.21, 0 ) ); // butt grip
	add( cylinder( 0.011, 0.024, ROD_LEN - 0.4, 8 ), { color: 0xf2eee2, rough: 0.35 }, mat4( 0, 0.4 + ( ROD_LEN - 0.4 ) / 2, 0 ) ); // white fibreglass blank
	add( cylinder( 0.045, 0.045, 0.07, 14 ), { color: 0xb8902a, rough: 0.35, metal: 1 }, mat4( 0, 0.5, 0.06, 0, 0, Math.PI / 2 ) ); // reel
	add( cylinder( 0.012, 0.012, 0.09, 6 ), { color: 0x888888, rough: 0.4, metal: 1 }, mat4( 0, 0.5, 0.02, Math.PI / 2 ) );
	for ( const [ y, r ] of [ [ 0.9, 0.022 ], [ 1.35, 0.016 ], [ 1.75, 0.012 ], [ 2.05, 0.009 ] ] ) add( torus( r, 0.0035, 6, 12 ), { color: 0xd0d0d0, rough: 0.3, metal: 1 }, mat4( 0, y, 0.025, Math.PI / 2 ) );
	add( sphere( 0.012, 8, 6 ), { color: 0xffffff, rough: 0.4 }, mat4( 0, ROD_LEN, 0 ) );
	return mergePrepared( parts );

}

export class SternRods {

	constructor( game ) {

		this.game = game;
		this.app = game.app;
		this.holders = []; // { group, rod, line, lineMat, side, wait, bite, water, nod }
		this.count = 0;
		this.slowT = 0;
		this.out = false; // lines in the water
		this._geo = null;
		this._mat = null;

	}

	// the holders to match the upgrade (built lazily: no rods, no meshes)
	sync() {

		const n = this.game.state.stats.sternRods || 0;
		if ( n === this.count ) {

			this._synced = true;
			return;

		}
		const boat = this.app.boat.group, scene = this.app.scene;
		for ( const h of this.holders ) {

			boat.remove( h.group );
			scene.remove( h.line );

		}

		this.holders = [];
		this.count = n;
		if ( ! n ) return;
		if ( ! this._geo ) {

			this._geo = buildRodGeometry();
			this._mat = createPropMaterial( 'sternRods' );

		}

		for ( let i = 0; i < n; i ++ ) {

			const group = new Group();
			group.name = 'stern-rod-' + i;
			const rod = new Mesh( this._geo, this._mat );
			rod.castShadow = true;
			group.add( rod );
			boat.add( group );
			const lineMat = createLineMaterial( 32 );
			const line = new Mesh( buildLineGeometry( 32 ), lineMat );
			line.name = 'stern-line-' + i;
			line.frustumCulled = false;
			line.castShadow = false;
			line.visible = false;
			scene.add( line );
			this.holders.push( { i, group, rod, line, lineMat, side: 1, wait: this.newWait(), bite: null, water: new Vector3(), nod: 0 } );

		}

		this.place();
		// a toast when bought (not when a save with holders loads)
		const bought = this._synced;
		this._synced = true;
		if ( bought ) this.game.toast( n === 1 ? 'Stern rod holder fitted: stop the boat and it fishes astern for you (B to grab a bite)' : `${ n } stern rods fitted`, 3600 );

	}

	// the holders sit on the stern of whichever boat is in use (the mounts follow bought boats)
	place() {

		const combat = this.game.combat;
		if ( ! combat || ! this.holders.length ) return;
		const spots = holderSpots( this.holders.length, combat.mounts.stern, combat.hitHalf.x );
		this.holders.forEach( ( h, i ) => {

			const s = spots[ i ];
			h.side = s.side;
			h.group.position.set( s.x, combat.mounts.stern.y + 0.1, s.z );
			// leaning aft and a little outboard, like rods in a trolling spread
			h.baseRx = - 0.75;
			h.baseRz = - Math.sign( s.x ) * 0.45;
			h.group.rotation.set( h.baseRx, 0, h.baseRz );

		} );

	}

	newWait() {

		const g = this.game;
		const b = this.app.boatCtl.position;
		const depth = Math.max( 0, - this.app.terrainData.heightAt( b.x, b.z ) );
		const d = biteDelay( g.habitatAtPoint( b.x, b.z, depth ), g.hour );
		return ( Number.isFinite( d ) ? d : 30 ) * STERN_SLOW * ( g.state.stats.biteMul || 1 );

	}

	// the next bent rod (the one whose fish has the least time left)
	get pending() {

		let best = null;
		for ( const h of this.holders ) if ( h.bite && ( ! best || h.bite.t < best.bite.t ) ) best = h;
		return best;

	}

	update( dt ) {

		this.sync();
		if ( ! this.count ) return;
		const app = this.app, game = this.game, p = app.player, b = app.boatCtl;
		const aboard = ( p.mode === 'boat' || p.mode === 'deck' ) && ! ( game.combat && game.combat.dead );
		const speed = Math.hypot( b.velocity.x, b.velocity.z );
		// out after SET_DELAY below SET_SPEED, in again only above MAX_SPEED (a drifting boat that hovers
		// near one speed doesn't flick the lines in and out)
		if ( ! aboard || speed > MAX_SPEED ) this.slowT = 0;
		else if ( speed < SET_SPEED || this.out ) this.slowT += dt;
		const out = this.slowT > SET_DELAY;
		if ( out !== this.out ) {

			this.out = out;
			for ( const h of this.holders ) {

				h.bite = null;
				h.wait = this.newWait();

			}

		}

		this.place();
		for ( const h of this.holders ) {

			if ( out ) this.fish( h, dt );
			// a bent rod nods hard; an idle one sways with the boat
			h.nod += dt * ( h.bite ? 9 : 1.3 );
			const bend = h.bite ? 0.28 + Math.sin( h.nod ) * 0.12 : Math.sin( h.nod ) * 0.02;
			h.group.rotation.set( h.baseRx - bend, 0, h.baseRz );

		}

		this.layLines();

		const ph = this.pending;
		if ( ph && aboard && app.input.hit( 'KeyB' ) ) this.grab( ph );

	}

	// the lines from the rod tips to the water astern, from the boat's pose as it will be drawn this
	// frame (App calls this again after the boat model has moved: Game.lateUpdate), so they stay on the
	// rod tips instead of trailing a frame behind as the boat rolls and pitches
	layLines() {

		if ( ! this.count ) return;
		const boat = this.app.boat.group;
		boat.updateWorldMatrix( true, true );
		const back = _w.set( 0, 0, - 1 ).transformDirection( boat.matrixWorld ).setY( 0 ).normalize();
		const right = _v.set( - back.z, 0, back.x );
		for ( const h of this.holders ) {

			// (fresh from the rod-local tip every frame: transforming last frame's world point again sent the
			// line's far end off to the horizon, the old "glitching line")
			const tip = h.group.localToWorld( ( h.tipW || ( h.tipW = new Vector3() ) ).copy( _tip ) );
			// where the line meets the water astern, spread out to the sides
			h.water.set( tip.x + back.x * LINE_LEN + right.x * h.side * 3.5, - 0.15, tip.z + back.z * LINE_LEN + right.z * h.side * 3.5 );
			const L = h.lineMat.uniforms;
			L.lineA.value.copy( tip );
			L.lineB.value.copy( h.water );
			L.lineCtl.value.copy( tip ).lerp( h.water, 0.5 ).y -= h.bite ? 0.1 : 1.2;
			L.lineShow.value = 1;
			h.line.visible = this.out;

		}

	}

	// late in the frame (after combat and the harbours set theirs): the B prompt wins while a rod is bent
	prompt() {

		const p = this.app.player, ph = this.pending;
		if ( ph && this.out && ( p.mode === 'boat' || p.mode === 'deck' ) ) p.prompt = { key: 'B', text: `Fish on stern rod ${ ph.i + 1 }! Grab it (${ Math.ceil( ph.bite.t ) } s)` };

	}

	fish( h, dt ) {

		const game = this.game;
		if ( h.bite ) {

			h.bite.t -= dt;
			if ( h.bite.t <= 0 ) {

				game.toast( `The fish on stern rod ${ h.i + 1 } shook the hook`, 2000 );
				h.bite = null;
				h.wait = this.newWait();

			}

			return;

		}

		// only out in the Open Sea and the Deadwater (danger tiers 2 and 3): close in, nothing takes them
		const here = dangerZoneAt( h.water.x, h.water.z );
		if ( ! here || here.tier < STERN_MIN_TIER ) {

			if ( ! this._closeTold ) {

				this._closeTold = true;
				game.toast( 'Stern lines are out · they only get bites in the Open Sea (tier 2) and the Deadwater (tier 3)', 3600 );

			}

			return;

		}

		h.wait -= dt;
		if ( h.wait > 0 ) return;
		const depth = Math.max( 0, - this.app.terrainData.heightAt( h.water.x, h.water.z ) );
		const hab = game.habitatAtPoint( h.water.x, h.water.z, depth );
		const zone = dangerZoneAt( h.water.x, h.water.z );
		const species = pickSpecies( hab, game.hour, Math.random, { tier: zone ? zone.tier : 0, luck: game.state.stats.luck || 1 } );
		if ( ! species ) {

			h.wait = 8;
			return;

		}

		h.bite = { species, kg: rollWeight( species ), t: BITE_WINDOW };
		const au = this.app.audio;
		if ( au && au.fishSplash ) au.fishSplash( h.water, 0.5 );
		if ( au && au.rodReady ) au.rodReady();
		game.toast( `🎣 Stern rod ${ h.i + 1 } is bent over! Press B to grab it`, 3000 );

	}

	// take the bent rod's fish onto the rod in your hands
	grab( h ) {

		const game = this.game, app = this.app, p = app.player, rod = game.rod;
		if ( game.fight || game.landing ) {

			game.toast( 'Land the fish you have on first', 1600 );
			return false;

		}

		if ( game.giants && game.giants.target && p.mode === 'boat' ) {

			game.toast( 'Not while a giant is on the tether', 1600 );
			return false;

		}

		if ( p.mode === 'boat' ) p.leaveHelm();
		if ( p.mode !== 'deck' ) return false;
		// step to the stern, facing aft over the transom where the fish is
		const sz = game.combat.mounts.stern.z + 0.9;
		const floor = p.deckGroundAt ? p.deckGroundAt( 0, sz, 6 ) : - Infinity;
		if ( Number.isFinite( floor ) ) {

			p.deckPos.set( 0, floor, sz );
			p.deckVel.set( 0, 0, 0 );
			p.deckYaw = Math.PI;
			p.pitch = - 0.18;
			p.deckToWorld();

		}
		const { species, kg } = h.bite;
		h.bite = null;
		h.wait = this.newWait();
		game.cancelLine( true ); // your own line comes in
		if ( ! rod.equipped ) rod.equip( true );
		// the stern rod's line, now on your rod: a fish on, straight into the fight
		rod.bobber.copy( h.water );
		rod.bobber.y = 0;
		rod.setState( 'floating' );
		rod.lineOut = LINE_LEN;
		game.bite = { phase: 'take', species, kg, t: 5 };
		game.strike();
		game.toast( `Grabbed stern rod ${ h.i + 1 } · ${ FISH[ species ].tier === 'common' ? 'fish on!' : 'something good is on!' }`, 1800 );
		return true;

	}

}
