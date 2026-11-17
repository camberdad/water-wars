import { Group, Mesh, Vector3, Quaternion } from '../engine/index.js';
import { LAYERS } from '../core/SceneRenderer.js';
import { BOATS } from './BoatCatalog.js';
import { createBoatMesh } from './Boats.js';
import * as U from './Units.js';

// Open-world multiplayer (Water Wars). "Multiplayer" on the start screen joins one shared open sea with
// everyone else playing it. Peer-to-peer: players find each other through public Nostr relays (the
// Trystero library) and then talk directly over WebRTC, so it runs on the static site with no game
// server. Each player sends their boat's pose ~10 times a second, plus their shots; everyone draws the
// others' boats (their own boat model) with name tags and minimap dots, and their tracers and shells.
// No PvP: other players' shots can't hurt you. The NPC boats, the fish and the giants stay each
// player's own.

const APP_ID = 'water-wars-open-sea-v1';
// The Nostr relays players meet on. Trystero's built-in pick for this app id had only 2 of 5 relays
// working (dead, auth-only or refusing the event kind), so friends often never found each other.
// These were tested (Nov 2026) to accept and deliver the game's ephemeral events; all are used at once.
const RELAYS = [
	'wss://relay.primal.net',
	'wss://relay.snort.social',
	'wss://offchain.pub',
	'wss://relay.nostr.net',
	'wss://yabu.me/v2',
	'wss://multiplexer.huszonegy.world',
	'wss://nostr.sathoarder.com',
];
// STUN servers find each player's public address for the direct (WebRTC) link. Players behind strict
// routers (some mobile / carrier networks) also need a TURN relay; add one here (e.g. a free Metered or
// Cloudflare TURN account): { urls: 'turn:…', username: '…', credential: '…' }
const ICE_SERVERS = [
	{ urls: [ 'stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478' ] },
];
const TURN_SERVERS = [];
const ROOM = 'open-sea';
const SEND_HZ = 10;
const STALE_S = 12; // a peer not heard from this long is gone
const STATIC_BUCKETS = [ 'hull', 'gelcoat', 'wood', 'fittings', 'trap', 'glow', 'glass' ];
const _v = new Vector3();
const _q = new Quaternion();

class RemotePlayer {

	constructor( mp, id ) {

		this.mp = mp;
		this.id = id;
		this.name = 'Captain';
		this.boat = null;
		this.group = new Group();
		this.group.name = 'remote-player';
		this.group.visible = false;
		mp.app.scene.add( this.group );
		this.pos = new Vector3();
		this.quat = new Quaternion();
		this.has = false;
		this.seen = performance.now();
		this.speed = 0;
		this.mode = 'walk';

	}

	// the look of their boat: the lobster boat (shared geometry) or a bought boat's model
	async setBoat( id ) {

		if ( this.boat === id ) return;
		this.boat = id;
		for ( const c of [ ...this.group.children ] ) this.group.remove( c );
		const def = BOATS[ id ] || BOATS.lobster;
		if ( def.model ) {

			try {

				const m = await createBoatMesh( id );
				if ( m && this.boat === id ) this.group.add( m );
				return;

			} catch ( e ) { /* fall back to the lobster boat */ }

		}

		const src = this.mp.app.boat.meshes;
		for ( const name of STATIC_BUCKETS ) {

			const s = src[ name ];
			if ( ! s ) continue;
			const m = new Mesh( s.geometry, s.material );
			m.castShadow = name !== 'glass';
			m.receiveShadow = true;
			if ( name === 'trap' || name === 'glass' ) m.layers.set( LAYERS.TRANSPARENT );
			this.group.add( m );

		}

	}

	apply( d ) {

		this.seen = performance.now();
		if ( typeof d.n === 'string' ) this.name = d.n.slice( 0, 18 ) || 'Captain';
		this.speed = +d.s || 0;
		// their boat's height above the water under it (1.13.2): drawn on our water at the same height
		this.dy = Number.isFinite( d.w ) ? Math.max( - 3, Math.min( 3, d.w ) ) : null;
		this.mode = d.m || 'walk';
		if ( Array.isArray( d.p ) && Array.isArray( d.q ) && d.p.every( Number.isFinite ) && d.q.every( Number.isFinite ) ) {

			_v.fromArray( d.p );
			_q.fromArray( d.q ).normalize();
			if ( ! this.has || this.pos.distanceTo( _v ) > 60 ) {

				// first sight or a jump (respawn, new boat): snap
				this.group.position.copy( _v );
				this.group.quaternion.copy( _q );

			}

			// everyone starts at the same berth: a docked boat of someone else is drawn moored alongside
			// (a few metres further out) instead of inside your own
			const dock = this.mp.app.boatCtl.mooring.anchor;
			if ( Math.hypot( _v.x - dock.x, _v.z - dock.z ) < 3 ) _v.x += 5 + ( this.slot || 0 ) * 4.5;
			this.pos.copy( _v );
			this.quat.copy( _q );
			this.has = true;

		}

		if ( typeof d.b === 'string' ) this.setBoat( BOATS[ d.b ] ? d.b : 'lobster' );

	}

	update( dt ) {

		if ( ! this.has ) return;
		// on our own water: the height of the sea under their boat (read back from the water query) plus
		// their height above theirs, so a boat never floats over or sinks into the waves we see
		const q = this.mp.app.query, slot = this.mp.waterSlot( this );
		let y = this.pos.y;
		if ( q && slot >= 0 ) {

			q.setPoint( slot, this.group.position.x, this.group.position.z );
			const h = q.cpuValid ? q.cpu[ slot * 4 ] : NaN;
			if ( Number.isFinite( h ) && this.dy !== null ) y = h + this.dy;

		}

		// glide toward the latest pose (updates arrive ~10 times a second)
		const k = 1 - Math.exp( - dt * 10 );
		this.group.position.x += ( this.pos.x - this.group.position.x ) * k;
		this.group.position.z += ( this.pos.z - this.group.position.z ) * k;
		this.group.position.y += ( y - this.group.position.y ) * ( 1 - Math.exp( - dt * 14 ) );
		this.group.quaternion.slerp( this.quat, k );
		this.group.visible = true;

	}

	dispose() {

		this.mp.app.scene.remove( this.group );
		if ( this.tag ) this.tag.remove();

	}

}

export class Multiplayer {

	constructor( game ) {

		this.game = game;
		this.app = game.app;
		this.peers = new Map();
		this.active = false;
		this.sendT = 0;
		this.name = '';

	}

	get count() {

		return this.peers.size;

	}

	async start( name ) {

		if ( this.active || this.connecting ) return;
		this.connecting = true;
		// the captain name chosen on the start screen (required there)
		this.name = ( name || '' ).trim() || `Captain ${ Math.floor( 1000 + Math.random() * 9000 ) }`;
		try {

			localStorage.setItem( 'waterwars.name', this.name );

		} catch ( e ) { /* no storage */ }

		this.buildHud();
		this.setStatus( 'Joining the open sea…' );
		try {

			// loaded only for multiplayer: single-player downloads nothing extra
			const { joinRoom, getRelaySockets } = await import( 'trystero/nostr' );
			this.getRelaySockets = getRelaySockets;
			const room = this.room = joinRoom( { appId: APP_ID, relayUrls: RELAYS, rtcConfig: { iceServers: ICE_SERVERS.concat( TURN_SERVERS ) } }, ROOM );
			this.joinedAt = performance.now();
			const [ sendState, getState ] = room.makeAction( 'state' );
			const [ sendShot, getShot ] = room.makeAction( 'shot' );
			this.sendStateFn = sendState;
			this.sendShotFn = sendShot;
			room.onPeerJoin( ( id ) => {

				this.peer( id );
				// introduce ourselves to the newcomer straight away
				try {

					sendState( this.snapshot(), id );

				} catch ( e ) { /* ignore */ }

			} );
			room.onPeerLeave( ( id ) => this.drop( id, true ) );
			getState( ( d, id ) => {

				const p = this.peer( id );
				const first = ! p.has;
				p.apply( d || {} );
				if ( d && d.bd ) this.applyBossDamage( id, d.bd );
				if ( first ) this.game.toast( `🌐 ${ p.name } sailed into the open sea`, 2600 );

			} );
			getShot( ( d, id ) => this.remoteShot( d, id ) );
			this.active = true;
			// the same weather and waves as everyone else online (src/game/Weather.js)
			if ( this.game.weather ) this.game.weather.start();
			// send on a timer, not from the frame loop: a background tab barely draws, but its timers still
			// run (about once a second), so others keep seeing you
			this.timer = setInterval( () => {

				try {

					sendState( this.snapshot() );

				} catch ( e ) { /* ignore */ }

			}, 1000 / SEND_HZ );
			this.game.toast( `🌐 Multiplayer: you are ${ this.name } on the open sea. Other players appear as they join.`, 4500 );

		} catch ( e ) {

			console.warn( 'multiplayer failed', e );
			this.setStatus( 'Offline · could not reach the open sea' );
			this.game.toast( 'Could not connect to multiplayer · playing solo', 3500 );

		}

		this.connecting = false;

	}

	peer( id ) {

		let p = this.peers.get( id );
		if ( ! p ) {

			p = new RemotePlayer( this, id );
			p.slot = this.peers.size;
			this.peers.set( id, p );
			p.tag = this.makeTag();
			const map = this.game.minimap;
			if ( map && map.addMarker ) p.marker = map.addMarker( { id: 'mp-' + id, kind: 'mp', icon: '', pos: () => ( this.peers.has( id ) && p.has ? p.group.position : null ) } );

		}

		return p;

	}

	drop( id, announce ) {

		const p = this.peers.get( id );
		if ( ! p ) return;
		this.peers.delete( id );
		if ( this.slotOwners ) this.slotOwners = this.slotOwners.map( ( o ) => ( o === p ? null : o ) );
		p.dispose();
		if ( p.marker && p.marker.el ) p.marker.el.remove();

	}

	// a water-query slot for a remote boat (a small pool, allocated once); -1 when none are left
	waterSlot( p ) {

		const q = this.app.query;
		if ( ! q ) return - 1;
		if ( ! this.slotPool ) {

			try {

				const start = q.allocate( 'multiplayer', 8 );
				this.slotPool = Array.from( { length: 8 }, ( _, i ) => start + i );

			} catch ( e ) {

				this.slotPool = [];

			}

			this.slotOwners = this.slotPool.map( () => null );

		}

		let i = this.slotOwners.indexOf( p );
		if ( i < 0 ) {

			i = this.slotOwners.indexOf( null );
			if ( i < 0 ) return - 1;
			this.slotOwners[ i ] = p;

		}

		return this.slotPool[ i ];

	}

	// our boat's height above the water under it (the mean of the hull's water samples)
	heightAboveWater() {

		const bc = this.app.boatCtl;
		if ( ! bc.hasWater || ! bc.waterH || ! bc.waterH.length ) return null;
		let s = 0;
		for ( const h of bc.waterH ) s += h;
		const v = bc.position.y - s / bc.waterH.length;
		if ( ! Number.isFinite( v ) ) return null;
		// smoothed over about a second (sent ~10 times a second): a steady height above the water, while
		// the receiver's own waves move the boat up and down
		this._dy = this._dy === undefined ? v : this._dy + ( v - this._dy ) * 0.15;
		return +this._dy.toFixed( 2 );

	}

	// what we send: our boat's pose and look, and what we are doing
	snapshot() {

		const app = this.app, bc = app.boatCtl, st = this.game.state;
		return {
			n: this.name,
			b: st.boat,
			p: [ +bc.position.x.toFixed( 2 ), +bc.position.y.toFixed( 2 ), +bc.position.z.toFixed( 2 ) ],
			q: [ +bc.quaternion.x.toFixed( 4 ), +bc.quaternion.y.toFixed( 4 ), +bc.quaternion.z.toFixed( 4 ), +bc.quaternion.w.toFixed( 4 ) ],
			s: +bc.velocity.length().toFixed( 1 ),
			m: app.player.mode,
			w: this.heightAboveWater(),
			t: Date.now(), // (the shared wave clock: lets a peer see how far apart the clocks are)
			// our damage to this generation of the boss (1.14: src/game/combat/Boss.js): her health bar is what
			// every captain's damage leaves, and the plunder is shared by it
			bd: this.bossDamage(),
		};

	}

	// our damage to each boss this generation: { id: [ gen, dmg ] } (null when we haven't hit one)
	bossDamage() {

		const c = this.game.combat;
		if ( ! c || ! c.bosses ) return null;
		let out = null;
		for ( const B of c.bosses ) {

			const s = B.netState();
			if ( s ) ( out || ( out = {} ) )[ B.id ] = s;

		}

		return out;

	}

	applyBossDamage( id, bd ) {

		const c = this.game.combat;
		if ( ! c || ! c.bosses ) return;
		// (a 1.14.0 peer sends the Iron Kraken's alone, as [ gen, dmg ])
		if ( Array.isArray( bd ) ) bd = { kraken: bd };
		if ( typeof bd !== 'object' ) return;
		for ( const B of c.bosses ) if ( bd[ B.id ] ) B.remoteDamage( id, bd[ B.id ] );

	}

	// our own shots, so others see them (Combat calls this)
	// extra: { gravity, life } of a shell (1.13.3: straight cannon shells)
	shot( kind, from, vel, splash = 0, extra = null ) {

		if ( ! this.active || ! this.sendShotFn || ! this.peers.size ) return;
		// machine guns fire 10-25 times a second: send at most ~12 shots a second
		const now = performance.now();
		if ( kind === 'bullet' && now - ( this._shotT || 0 ) < 80 ) return;
		this._shotT = now;
		try {

			this.sendShotFn( { k: kind, f: from.toArray().map( ( v ) => +v.toFixed( 2 ) ), v: vel.toArray().map( ( v ) => +v.toFixed( 2 ) ), s: splash, ...( extra ? { g: extra.gravity, l: +( extra.life || 0 ).toFixed( 2 ) } : {} ) } );

		} catch ( e ) { /* ignore */ }

	}

	// another player's shot: drawn and heard, but harmless to us (no PvP)
	remoteShot( d, id ) {

		if ( ! d || ! Array.isArray( d.f ) || ! Array.isArray( d.v ) || ! this.peers.has( id ) ) return;
		const combat = this.game.combat;
		const from = new Vector3().fromArray( d.f ), vel = new Vector3().fromArray( d.v );
		if ( ! [ ...d.f, ...d.v ].every( Number.isFinite ) || from.distanceTo( this.app.camera.position ) > 900 ) return;
		const shell = d.k === 'shell';
		// (a shell from 1.13.3 on says it flies straight: g 0, and how long it flies before it bursts)
		const g = Number.isFinite( d.g ) ? Math.max( 0, Math.min( 20, d.g ) ) : undefined;
		const life = shell && Number.isFinite( d.l ) && d.l > 0 ? Math.min( 10, d.l ) : shell ? 10 : 1.4;
		combat.fx.fire( { from, vel, dmg: 0, owner: 'remote', kind: shell ? 'shell' : 'bullet', splash: 0, life, gravity: g } );
		combat.fx.muzzle( from, vel.clone().normalize(), shell );
		combat.sfx.shot( from, shell ? 'cannon' : 'mg', 0.7 );

	}

	update( dt ) {

		if ( ! this.active ) return;
		const now = performance.now();
		for ( const [ id, p ] of this.peers ) {

			if ( now - p.seen > STALE_S * 1000 ) {

				this.drop( id, true );
				continue;

			}

			p.update( dt );

		}

		this.updateTags();
		const n = this.peers.size;
		// how many meeting points (relays) we are connected to: 0 means our network blocks them
		let relays = 0, total = RELAYS.length;
		try {

			const socks = this.getRelaySockets ? this.getRelaySockets() : {};
			for ( const ws of Object.values( socks ) ) if ( ws && ws.readyState === 1 ) relays ++;

		} catch ( e ) { /* ignore */ }

		this.setStatus( `🌐 Online · ${ this.name } · ${ n ? `${ n } other player${ n > 1 ? 's' : '' }` : 'waiting for players' } · relays ${ relays }/${ total }${ relays === 0 ? ' · offline: your network blocks the relays' : '' }` );

	}

	// ---------------------------------------------------------------- HUD: status pill and name tags

	buildHud() {

		if ( this.pill ) return;
		const ui = this.app.ui && this.app.ui.ui;
		const hud = ui ? ( ui.hud || ui.root ) : document.body;
		const css = document.createElement( 'style' );
		css.textContent = `
.ww-mp-pill { position: absolute; left: var(--tw-edge, 16px); top: calc(var(--tw-edge, 16px) + 92px); padding: 5px 12px; border-radius: 999px; pointer-events: none;
	background: rgba(8, 18, 26, 0.6); color: #9be8dc; font: 600 12px Inter, system-ui, sans-serif; box-shadow: inset 0 0 0 1px rgba(111, 214, 198, 0.4); }
.ww-mp-tag { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); display: none; white-space: nowrap; pointer-events: none;
	font: 700 12px Inter, system-ui, sans-serif; color: #8fd0ff; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9); text-align: center; }
.ww-mp-tag small { display: block; font: 500 10px 'JetBrains Mono', ui-monospace, monospace; color: #cfe6f5; opacity: 0.8; }
.gm-mk.is-mp > i { background: #4aa8ff; width: calc(14 * var(--tw-u)); height: calc(14 * var(--tw-u)); margin: calc(-7 * var(--tw-u)) 0 0 calc(-7 * var(--tw-u)); }`;
		document.head.append( css );
		this.hudEl = hud;
		this.pill = document.createElement( 'div' );
		this.pill.className = 'ww-mp-pill';
		hud.append( this.pill );

	}

	setStatus( text ) {

		if ( this.pill && this._status !== text ) {

			this._status = text;
			this.pill.textContent = text;

		}

	}

	makeTag() {

		const t = document.createElement( 'div' );
		t.className = 'ww-mp-tag';
		t.innerHTML = '<span></span><small></small>';
		( this.hudEl || document.body ).append( t );
		return t;

	}

	updateTags() {

		const cam = this.app.camera;
		const W = window.innerWidth, H = window.innerHeight;
		const fwd = _v.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
		for ( const p of this.peers.values() ) {

			const t = p.tag;
			if ( ! t ) continue;
			const g = p.group.position;
			const pt = new Vector3( g.x, g.y + 5, g.z );
			const d = pt.distanceTo( cam.position );
			const ahead = ( pt.x - cam.position.x ) * fwd.x + ( pt.y - cam.position.y ) * fwd.y + ( pt.z - cam.position.z ) * fwd.z > 0;
			let on = p.has && d < 800 && ahead;
			if ( on ) {

				pt.project( cam );
				on = Math.abs( pt.x ) < 1.1 && Math.abs( pt.y ) < 1.1;

			}

			t.style.display = on ? 'block' : 'none';
			if ( ! on ) continue;
			t.style.transform = `translate(${ ( ( pt.x * 0.5 + 0.5 ) * W ).toFixed( 1 ) }px, ${ ( ( - pt.y * 0.5 + 0.5 ) * H ).toFixed( 1 ) }px) translate(-50%, -100%)`;
			t.firstChild.textContent = `🌐 ${ p.name }`;
			const boat = ( BOATS[ p.boat ] || BOATS.lobster ).name;
			t.lastChild.textContent = `${ boat } · ${ U.ft( d ) }`;

		}

	}

}
