import { Vector3 } from '../../engine/index.js';

// Combat HUD (same look as the fishing HUD: ui.css tokens, .tw-glass):
//   status card   hull, deck gun heat, cannon reload, wanted stars, the safe / danger water you are in
//   crosshair     at the helm, with the gun's heat ring and a hit marker
//   boat labels   name, faction and a health bar over the boats nearby; "G loot" on wrecks
//   overlays      a red vignette when you are hit, the "sunk" screen
const CSS = /* css */`
.ww-status { position: absolute; top: calc(var(--tw-edge) + 50 * var(--tw-u)); right: var(--tw-edge); width: calc(250 * var(--tw-u));
	padding: var(--tw-3) var(--tw-4); border-radius: var(--tw-r-lg); font: 500 var(--tw-fs-sm) var(--tw-font); color: var(--tw-ink-2); pointer-events: none;
	display: grid; gap: calc(6 * var(--tw-u)); transition: right var(--tw-slow) var(--tw-ease), opacity var(--tw-med); }
.tw-root[data-panel='open'] .ww-status { right: calc(var(--tw-panel-w) + 2 * var(--tw-3)); }
.ww-row { display: grid; grid-template-columns: calc(54 * var(--tw-u)) 1fr auto; align-items: center; gap: var(--tw-2); }
.ww-row b { font: 600 var(--tw-fs-sm) var(--tw-mono); color: var(--tw-ink); white-space: nowrap; }
.ww-bar { height: calc(6 * var(--tw-u)); border-radius: 99px; background: var(--tw-fill-2); overflow: hidden; }
.ww-bar > span { display: block; height: 100%; width: 100%; border-radius: inherit; transition: width 120ms linear; }
.ww-hull > span { background: #7fdc8c; }
.ww-hull.is-mid > span { background: var(--tw-sun); }
.ww-hull.is-low > span { background: var(--tw-coral); animation: ww-blink 0.6s steps(2) infinite; }
.ww-heat > span { background: linear-gradient(90deg, #f2c25c, #ff6a3d); }
.ww-heat.is-over > span { background: var(--tw-coral); animation: ww-blink 0.4s steps(2) infinite; }
@keyframes ww-blink { 50% { opacity: 0.45; } }
.ww-stars { font-size: calc(15 * var(--tw-u)); letter-spacing: 2px; color: rgba(255,255,255,0.18); }
.ww-stars i { font-style: normal; }
.ww-stars i.on { color: #ff4d4d; text-shadow: 0 0 8px rgba(255, 60, 60, 0.7); }
.ww-status.is-pulse .ww-stars { animation: ww-pulse 0.5s 3; }
@keyframes ww-pulse { 50% { transform: scale(1.25); } }
.ww-gun-name { color: var(--tw-ink-3); font-size: var(--tw-fs-xs); }
.ww-zone { display: none; margin: 2px calc(-1 * var(--tw-2)) 0; padding: 4px var(--tw-2); border-radius: 8px; background: rgba(200, 30, 20, 0.28);
	color: #ffb0a6; font: 700 var(--tw-fs-xs) var(--tw-font); letter-spacing: 0.06em; text-transform: uppercase; text-align: center; animation: ww-zone 2s ease-in-out infinite; }
.ww-zone.is-on { display: block; }
@keyframes ww-zone { 50% { background: rgba(200, 30, 20, 0.45); } }
.ww-zone.is-safe { background: rgba(40, 170, 90, 0.25); color: #a8f0c0; animation: none; }
.ww-cross.is-holstered { opacity: 0.35 !important; }
.gm-mk.is-station > i { background: #3ee07a; }
.ww-range.is-far { color: #ffb45a; }
.ww-range.is-out { color: #ff6a5a; }

.ww-cross { position: absolute; left: 50%; top: 50%; width: 0; height: 0; pointer-events: none; opacity: 0; transition: opacity 200ms; }
.ww-cross.is-on { opacity: 1; }
.ww-cross svg { position: absolute; left: -26px; top: -26px; width: 52px; height: 52px; overflow: visible; filter: drop-shadow(0 0 2px rgba(0,0,0,0.8)); }
.ww-cross .ww-ring-heat { transition: stroke-dashoffset 80ms linear; }
.ww-cross.is-target path, .ww-cross.is-target circle.ww-dotc { stroke: #ff5a4a; fill: #ff5a4a; }
.ww-cross.is-over .ww-ring-heat { stroke: #ff5a4a; }
.ww-hitm { position: absolute; left: -14px; top: -14px; width: 28px; height: 28px; opacity: 0; }
.ww-hitm.is-on { animation: ww-hit 260ms ease-out; }
.ww-hitm.is-kill { animation: ww-kill 600ms ease-out; }
@keyframes ww-hit { 0% { opacity: 1; transform: scale(0.7); } 100% { opacity: 0; transform: scale(1.3); } }
@keyframes ww-kill { 0% { opacity: 1; transform: scale(0.8) rotate(0deg); } 100% { opacity: 0; transform: scale(2) rotate(45deg); } }
.ww-range { position: absolute; left: 34px; top: 8px; font: 600 11px var(--tw-mono); color: rgba(255,255,255,0.75); white-space: nowrap; text-shadow: 0 1px 2px #000; }

.ww-tags { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.ww-tag { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); display: none; text-align: center; white-space: nowrap;
	font: 600 calc(11 * var(--tw-u)) var(--tw-font); color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
.ww-tag.is-on { display: block; }
.ww-tag small { display: block; font: 500 calc(10 * var(--tw-u)) var(--tw-mono); opacity: 0.75; }
.ww-tag .ww-hp { width: calc(70 * var(--tw-u)); height: 4px; margin: 3px auto 0; border-radius: 3px; background: rgba(0,0,0,0.5); overflow: hidden; }
.ww-tag .ww-hp > span { display: block; height: 100%; background: #7fdc8c; }
.ww-tag.is-pirate { color: #ff7a6a; }
.ww-tag.is-pirate .ww-hp > span, .ww-tag.is-coastguard .ww-hp > span { background: #ff5a4a; }
.ww-tag.is-trader { color: #9be3a6; }
.ww-tag.is-coastguard { color: #ffb347; }
.ww-tag.is-wreck { color: var(--tw-sun); }
.ww-tag.is-wreck .ww-hp { display: none; }
.ww-tag .ww-key { display: inline-block; margin-top: 3px; padding: 1px 6px; border-radius: 4px; background: var(--tw-sun); color: #1a1206; font: 700 10px var(--tw-mono); }

.ww-vig { position: absolute; inset: 0; pointer-events: none; opacity: 0;
	background: radial-gradient(ellipse at center, transparent 45%, rgba(200, 20, 10, 0.55) 100%); }
.ww-dead { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; pointer-events: none;
	background: rgba(5, 3, 2, 0.0); color: #f4ead6; opacity: 0; transition: opacity 1.2s ease, background 3s ease; }
.ww-dead.is-on { opacity: 1; background: rgba(5, 3, 2, 0.88); }
.ww-dead h2 { margin: 0; font: 400 clamp(48px, 8vw, 110px) 'Caveat Brush', var(--tw-font); color: #ff6a4d; text-shadow: 0 4px 30px rgba(0,0,0,0.6); }
.ww-dead p { margin: 0; font: 500 16px 'Kalam', var(--tw-font); color: rgba(244,234,214,0.8); }

.gm-mk.is-npc-fisher > i { background: #e8f1f4; }
.gm-mk.is-npc-trader > i { background: #8fd69a; }
.gm-mk.is-npc-pirate > i { background: #ff5a4a; color: #fff; }
.gm-mk.is-npc-coastguard > i { background: #ffb347; }
.gm-mk.is-npc-wreck > i { background: var(--tw-sun); }
.gm-mk[class*='is-npc'] > i { width: calc(14 * var(--tw-u)); height: calc(14 * var(--tw-u)); margin: calc(-7 * var(--tw-u)) 0 0 calc(-7 * var(--tw-u)); }
`;

const h = ( tag, cls, html ) => {

	const e = document.createElement( tag );
	if ( cls ) e.className = cls;
	if ( html !== undefined ) e.innerHTML = html;
	return e;

};

const SKULL = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-4.4 0-8 3.1-8 7.2 0 2.4 1.2 4.4 3 5.6V19h2v-2h2v2h2v-2h2v2h2v-3.2c1.8-1.2 3-3.2 3-5.6C20 6.1 16.4 3 12 3Zm-3 9.5a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Zm6 0a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Z"/></svg>';
const DOT = '';
const ANCHOR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="5" r="2"/><path d="M12 7v13M7 11h10M4 14c1 4 4 6 8 6s7-2 8-6"/></svg>';
const _p = new Vector3();
const _f = new Vector3();

export class CombatHUD {

	constructor( ui, combat ) {

		this.ui = ui;
		this.combat = combat;
		const style = h( 'style' );
		style.textContent = CSS;
		document.head.append( style );
		const hud = ui.hud || ui.root;

		this.status = h( 'div', 'ww-status tw-glass', `
			<div class="ww-row"><span>Hull</span><span class="ww-bar ww-hull"><span></span></span><b class="ww-hull-n">100</b></div>
			<div class="ww-row"><span>Gun</span><span class="ww-bar ww-heat"><span></span></span><b class="ww-gun-n">READY</b></div>
			<div class="ww-row ww-cannon-row"><span>Cannon</span><span class="ww-gun-name ww-can-name"></span><b class="ww-shells">0</b></div>
			<div class="ww-row"><span>Wanted</span><span class="ww-stars"></span><b class="ww-bounty"></b></div>
			<div class="ww-zone"></div>` );
		this.zoneEl = this.status.querySelector( '.ww-zone' );
		this.hullBar = this.status.querySelector( '.ww-hull' );
		this.hullFill = this.hullBar.firstElementChild;
		this.hullN = this.status.querySelector( '.ww-hull-n' );
		this.heatBar = this.status.querySelector( '.ww-heat' );
		this.heatFill = this.heatBar.firstElementChild;
		this.gunN = this.status.querySelector( '.ww-gun-n' );
		this.canRow = this.status.querySelector( '.ww-cannon-row' );
		this.canName = this.status.querySelector( '.ww-can-name' );
		this.shellsN = this.status.querySelector( '.ww-shells' );
		this.stars = this.status.querySelector( '.ww-stars' );
		this.stars.innerHTML = '<i>★</i>'.repeat( 5 );
		this.starEls = [ ...this.stars.children ];

		const C = 2 * Math.PI * 20;
		this.cross = h( 'div', 'ww-cross', `
			<svg viewBox="-26 -26 52 52">
				<circle r="20" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2.5"/>
				<circle class="ww-ring-heat" r="20" fill="none" stroke="#ffb45a" stroke-width="2.5" stroke-dasharray="${ C }" stroke-dashoffset="${ C }" transform="rotate(-90)"/>
				<path d="M-11 0h-6M11 0h6M0 -11v-6M0 11v6" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
				<circle class="ww-dotc" r="1.6" fill="#fff" stroke="#fff"/>
			</svg>
			<svg class="ww-hitm" viewBox="-14 -14 28 28"><path d="M-10 -10l6 6M10 -10l-6 6M-10 10l6 -6M10 10l-6 -6" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>
			<span class="ww-range"></span>` );
		this.ring = this.cross.querySelector( '.ww-ring-heat' );
		this.ringC = C;
		this.hitm = this.cross.querySelector( '.ww-hitm' );
		this.range = this.cross.querySelector( '.ww-range' );

		this.tags = h( 'div', 'ww-tags' );
		this.vig = h( 'div', 'ww-vig' );
		this.dead = h( 'div', 'ww-dead', '<h2>Sunk!</h2><p>Your boat is going down…</p>' );
		hud.append( this.tags, this.vig, this.status, this.cross, this.dead );
		this._vig = 0;

		// a label and a minimap dot per fleet boat
		this.boatTags = combat.fleet.boats.map( ( b ) => {

			const el = h( 'div', 'ww-tag', '<span class="ww-name"></span><small></small><div class="ww-hp"><span></span></div><span class="ww-key" style="display:none">G  loot</span>' );
			this.tags.append( el );
			return { b, el, name: el.querySelector( '.ww-name' ), sub: el.querySelector( 'small' ), hp: el.querySelector( '.ww-hp > span' ), key: el.querySelector( '.ww-key' ), cls: '' };

		} );
		const map = combat.game.minimap;
		// the sea stations (harbour services, safe zones)
		if ( map && map.addMarker ) for ( const s of combat.stationList ) map.addMarker( { id: 'station-' + s.id, kind: 'station', icon: ANCHOR, pos: () => s } );
		if ( map && map.addMarker ) {

			this.mapMarks = combat.fleet.boats.map( ( b ) => map.addMarker( { id: 'npc' + b.index, kind: 'npc-fisher', icon: DOT, pos: () => b.active && b.state !== 'sinking' ? b.pos : null } ) );

		}

	}

	hitMarker( kill = false ) {

		const e = this.hitm;
		e.classList.remove( 'is-on', 'is-kill' );
		void e.getBoundingClientRect();
		e.classList.add( kill ? 'is-kill' : 'is-on' );

	}

	hurt( k ) {

		this._vig = Math.min( 1, this._vig + 0.35 + k * 0.6 );

	}

	wantedPulse() {

		this.status.classList.remove( 'is-pulse' );
		void this.status.offsetWidth;
		this.status.classList.add( 'is-pulse' );

	}

	showDeath( on ) {

		this.dead.classList.toggle( 'is-on', on );

	}

	update( dt ) {

		const c = this.combat, s = c.state, st = s.stats, app = c.app;
		const aboard = c.aboard;
		this.status.style.opacity = aboard || s.wanted > 0 ? '1' : '0.0';
		const zoneText = c.zone ? `⚠ Danger waters · ${ c.zone.name }` : c.safe ? `✓ Safe zone · ${ c.safe.name }` : '';
		if ( this._zoneText !== zoneText ) {

			this._zoneText = zoneText;
			this.zoneEl.textContent = zoneText;
			this.zoneEl.classList.toggle( 'is-on', !! zoneText );
			this.zoneEl.classList.toggle( 'is-safe', ! c.zone && !! c.safe );

		}

		// hull
		const hp = s.hullHP, max = st.hullHP;
		const k = hp / max;
		this.hullFill.style.width = `${ k * 100 }%`;
		this.hullBar.classList.toggle( 'is-mid', k < 0.6 && k >= 0.3 );
		this.hullBar.classList.toggle( 'is-low', k < 0.3 );
		this.hullN.textContent = `${ Math.ceil( hp ) }/${ max }`;
		// gun heat
		this.heatFill.style.width = `${ c.heat * 100 }%`;
		this.heatBar.classList.toggle( 'is-over', c.overheated );
		this.gunN.textContent = c.overheated ? 'HOT' : ( st.gunShort || 'GUN' );
		// cannon
		this.canRow.style.display = st.cannon ? '' : 'none';
		if ( st.cannon ) {

			this.canName.textContent = c.cannonT > 0 ? 'reloading…' : 'ready';
			this.shellsN.textContent = '∞';

		}

		// wanted
		for ( let i = 0; i < 5; i ++ ) this.starEls[ i ].classList.toggle( 'on', i < s.wanted );

		// crosshair
		const helm = c.atHelm && ! c.dead;
		this.cross.classList.toggle( 'is-on', helm && ! ( c.game.hud && ( c.game.hud.standOpen || c.game.hud.invOpen ) ) );
		if ( helm ) {

			this.ring.setAttribute( 'stroke-dashoffset', `${ this.ringC * ( 1 - c.heat ) }` );
			this.cross.classList.toggle( 'is-over', c.overheated );
			this.cross.classList.toggle( 'is-holstered', !! c.holstered );
			this.cross.classList.toggle( 'is-target', !! c.aimTarget );
			const R = st.gunRange, d = c.aimDist;
			const far = d > R, out = d > R * 1.4;
			this.range.textContent = c.aimTarget ? `${ c.aimTarget.name } · ${ Math.round( d ) } m${ out ? ' · out of range' : far ? ' · long range' : '' }` : '';
			this.range.classList.toggle( 'is-far', far && ! out );
			this.range.classList.toggle( 'is-out', out );

		}

		// vignette
		this._vig = Math.max( 0, this._vig - dt * 1.6 );
		const low = aboard && k < 0.25 ? 0.25 + 0.15 * Math.sin( c.time * 6 ) : 0;
		this.vig.style.opacity = Math.min( 1, this._vig + low ).toFixed( 3 );

		// boat labels
		const cam = app.camera;
		cam.updateWorldMatrix( true, false );
		_f.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
		const W = window.innerWidth, H = window.innerHeight;
		const bc = app.boatCtl.position;
		for ( const t of this.boatTags ) {

			const b = t.b;
			let on = b.active && b.group.visible && b.state !== 'sinking';
			let d = 0;
			if ( on ) {

				_p.set( b.pos.x, b.group.position.y + 4.6, b.pos.z );
				const dx = _p.x - cam.position.x, dy = _p.y - cam.position.y, dz = _p.z - cam.position.z;
				d = Math.hypot( dx, dy, dz );
				on = d < 420 && dx * _f.x + dy * _f.y + dz * _f.z > 0;

			}

			if ( on ) {

				_p.project( cam );
				on = Math.abs( _p.x ) < 1.2 && Math.abs( _p.y ) < 1.2;

			}

			if ( t.el.__on !== on ) {

				t.el.__on = on;
				t.el.classList.toggle( 'is-on', on );

			}

			if ( ! on ) continue;
			const wreck = b.state === 'disabled';
			const cls = 'ww-tag is-on is-' + ( wreck ? 'wreck' : b.type );
			if ( t.cls !== cls ) {

				t.cls = cls;
				t.el.className = cls;

			}

			t.el.style.transform = `translate(${ ( ( _p.x * 0.5 + 0.5 ) * W ).toFixed( 1 ) }px, ${ ( ( - _p.y * 0.5 + 0.5 ) * H ).toFixed( 1 ) }px) translate(-50%, -100%)`;
			t.el.style.opacity = d > 300 ? ( 1 - ( d - 300 ) / 120 ).toFixed( 2 ) : '1';
			const label = wreck ? `${ b.name } (wreck)` : b.name;
			if ( t._name !== label ) t.name.textContent = t._name = label;
			const sub = wreck ? ( b.looted ? 'plundered · sinking' : 'disabled · lootable' ) : `${ b.def.label }${ b.gun ? ' · armed' : '' } · ${ Math.round( d ) } m`;
			if ( t._sub !== sub ) t.sub.textContent = t._sub = sub;
			t.hp.style.width = `${ b.hp / b.maxHp * 100 }%`;
			const canLoot = wreck && ! b.looted && Math.hypot( b.pos.x - bc.x, b.pos.z - bc.z ) < 18 && aboard;
			t.key.style.display = canLoot ? 'inline-block' : 'none';

		}

		// minimap dots
		if ( this.mapMarks ) for ( let i = 0; i < this.mapMarks.length; i ++ ) {

			const b = c.fleet.boats[ i ], m = this.mapMarks[ i ];
			const kind = 'npc-' + ( b.state === 'disabled' ? 'wreck' : b.type || 'fisher' );
			if ( m._kind !== kind ) {

				m._kind = kind;
				m.el.className = 'gm-mk is-' + kind + ( m.el[ '__gm_c_is-edge' ] ? ' is-edge' : '' );
				m.el.lastChild.innerHTML = b.type === 'pirate' && b.state !== 'disabled' ? SKULL : '';

			}

		}

	}

}
