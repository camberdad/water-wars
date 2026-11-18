// The Escape menu (Water Wars 1.15). Escape, with nothing else open (a panel, the controls sheet, a catch
// card), brings up a small menu: resume, the settings panel, back to the home dock (the boat to its berth
// at the harbour, you at the helm), or out to the title screen. Escape again (or Resume) closes it.
// (1.21) Its Audio tab sets the volumes: the master, and each group of sounds (src/audio/AudioSettings.js),
// and mute (also M). They take effect as you drag and are kept in this browser.
//
// In the browser, Escape while the mouse is captured gives the mouse back first and the key may never reach
// the page, so the menu also opens when the mouse is let go during play without anything else asking for it.

import { AUDIO_GROUPS, AUDIO_DEFAULTS, applyAudio, readAudio, saveAudioSettings, audioStorage } from '../audio/AudioSettings.js';

const CSS = /* css */`
.gm-panel.gm-pause { width: calc(330 * var(--tw-u)); max-width: 92vw; text-align: center; }
.gm-pause h2 { margin-bottom: var(--tw-3); }
.gm-pause .gm-btn { display: block; width: 100%; margin-top: var(--tw-2); padding: var(--tw-3) var(--tw-4); }
.gm-pause .gm-btn small { display: block; font-weight: 500; font-size: var(--tw-fs-xs); opacity: 0.7; }
.gm-pause .gm-note { min-height: 1.2em; margin-top: var(--tw-3); color: var(--tw-coral); font-size: var(--tw-fs-sm); }
.gm-pause.is-audio { width: calc(380 * var(--tw-u)); }
.gm-pause .gm-tabs { justify-content: center; margin-bottom: var(--tw-3); }
.gm-pause [data-pane] { display: none; }
.gm-pause[data-tab="menu"] [data-pane="menu"], .gm-pause[data-tab="audio"] [data-pane="audio"] { display: block; }
.gm-vol { text-align: left; padding: var(--tw-2) 0; border-bottom: 1px solid var(--tw-line); }
.gm-vol-top { display: flex; justify-content: space-between; align-items: baseline; gap: var(--tw-2); }
.gm-vol-top b { font-weight: 600; }
.gm-vol-top output { font: 600 var(--tw-fs-sm) var(--tw-mono); color: var(--tw-aqua); min-width: 3.2em; text-align: right; }
.gm-vol small { display: block; color: var(--tw-ink-3); font-size: var(--tw-fs-xs); margin-top: 1px; }
.gm-vol input[type=range] { width: 100%; margin: var(--tw-2) 0 0; accent-color: var(--tw-aqua); cursor: pointer; }
.gm-vol.is-master b { color: var(--tw-sun); }
.gm-pause.is-muted .gm-vol { opacity: 0.45; }
.gm-pause .gm-audio-btns { display: flex; gap: var(--tw-2); margin-top: var(--tw-3); }
.gm-pause .gm-audio-btns .gm-btn { margin-top: 0; }
.gm-pause .gm-btn.is-mute.is-on { background: var(--tw-coral); color: #1a0b0b; border-color: transparent; }
`;

// how recently the boat must have been out of a fight to head home (s since a hit, m from an attacker)
export const HOME_CALM_S = 12;
export const HOME_CLEAR_M = 400;

export class PauseMenu {

	constructor( game ) {

		this.game = game;
		this.app = game.app;
		this.open = false;
		this._esc = false;
		this._escBusy = false;
		this._wasLocked = false;
		this._quietUntil = 0;
		if ( typeof window !== 'undefined' ) window.addEventListener( 'keydown', ( e ) => {

			if ( e.code !== 'Escape' || e.repeat ) return;
			// (capture phase, before anything else sees the key: was something else open to close?)
			this._escBusy = this.busy();
			this._esc = true;

		}, true );

	}

	// something else that Escape (or letting go of the mouse) belongs to
	busy() {

		const g = this.game, h = g.hud, ui = this.app.ui && this.app.ui.ui;
		if ( ! h || ! ui ) return true;
		return !! ( h.invOpen || h.standOpen || h.sortOpen || h.catchOpen || ( g.highScores && g.highScores.isOpen ) ||
			ui._panelOpen || ui._help || ui._menu || ui._start || ui._photo || this.app.freeCam );

	}

	update() {

		const inp = this.app.input;
		const locked = !! inp.locked;
		const esc = this._esc, escBusy = this._escBusy;
		this._esc = false;
		if ( this.open ) {

			// (M pressed while it's open: the Audio tab shows it)
			const a = this.audio;
			if ( a && a.muted !== this._muted ) {

				this._muted = a.muted;
				this.syncAudio();

			}

			// Escape again, or a click back into the game (the mouse captured again), closes it
			if ( esc ) this.close( true );
			else if ( locked ) this.close();
			this._wasLocked = locked;
			return;

		}

		const lost = this._wasLocked && ! locked;
		this._wasLocked = locked;
		if ( ( esc && ! escBusy ) || ( lost && ! this.busy() && performance.now() > this._quietUntil ) ) this.show();

	}

	build() {

		if ( this.el ) return;
		const style = document.createElement( 'style' );
		style.textContent = CSS;
		document.head.append( style );
		const ui = this.app.ui.ui;
		const el = this.el = document.createElement( 'div' );
		el.className = 'gm-panel gm-pause tw-glass tw-interactive';
		el.dataset.tab = 'menu';
		const vols = AUDIO_GROUPS.map( ( g ) => `
				<label class="gm-vol${ g.id === 'master' ? ' is-master' : '' }">
					<span class="gm-vol-top"><b>${ g.name }</b><output data-out="${ g.id }"></output></span>
					<small>${ g.hint }</small>
					<input type="range" min="0" max="100" step="1" data-vol="${ g.id }" aria-label="${ g.name }">
				</label>` ).join( '' );
		el.innerHTML = `
			<h2>Water Wars</h2>
			<div class="gm-tabs" role="tablist">
				<button class="gm-tab is-on" data-tab="menu" role="tab">Menu</button>
				<button class="gm-tab" data-tab="audio" role="tab">Audio</button>
			</div>
			<div data-pane="menu">
				<button class="gm-btn" data-act="resume">Resume<small>Esc</small></button>
				<button class="gm-btn is-ghost" data-act="settings">Settings<small>H</small></button>
				<button class="gm-btn is-ghost" data-act="home">Return to the home dock<small>your boat back at its berth in the harbour</small></button>
				<button class="gm-btn is-ghost" data-act="title">Exit to the title screen</button>
				<div class="gm-note"></div>
			</div>
			<div data-pane="audio">
				${ vols }
				<div class="gm-audio-btns">
					<button class="gm-btn is-ghost is-mute" data-act="mute">Mute all<small>M</small></button>
					<button class="gm-btn is-ghost" data-act="reset">Reset<small>the default volumes</small></button>
				</div>
				<button class="gm-btn" data-act="resume">Resume<small>Esc</small></button>
			</div>`;
		ui.root.append( el );
		this.note = el.querySelector( '.gm-note' );
		for ( const t of el.querySelectorAll( '.gm-tab' ) ) t.addEventListener( 'click', ( e ) => {

			e.stopPropagation();
			this.tab( t.dataset.tab );

		} );
		// the volumes: applied as you drag, saved when you let go
		for ( const r of el.querySelectorAll( '[data-vol]' ) ) {

			r.addEventListener( 'input', () => this.setVolume( r.dataset.vol, r.value / 100, false ) );
			r.addEventListener( 'change', () => this.setVolume( r.dataset.vol, r.value / 100, true ) );
			for ( const ev of [ 'pointerdown', 'mousedown', 'click', 'keydown' ] ) r.addEventListener( ev, ( e ) => e.stopPropagation() );

		}

		for ( const b of el.querySelectorAll( '[data-act]' ) ) b.addEventListener( 'click', ( e ) => {

			e.stopPropagation();
			const act = b.dataset.act;
			if ( act === 'resume' ) this.close( true );
			else if ( act === 'settings' ) this.settings();
			else if ( act === 'home' ) this.goHome();
			else if ( act === 'title' ) this.toTitle();
			else if ( act === 'mute' ) this.toggleMute();
			else if ( act === 'reset' ) this.resetAudio();

		} );

	}

	show() {

		this.build();
		this.open = true;
		this.note.textContent = '';
		this.syncAudio();
		this.el.classList.add( 'is-open' );
		try {

			if ( document.pointerLockElement && document.exitPointerLock ) document.exitPointerLock();

		} catch ( e ) { /* ignore */ }

	}

	close( relock = false ) {

		if ( ! this.open ) return;
		this.open = false;
		this.el.classList.remove( 'is-open' );
		// (a mouse let go by the menu itself doesn't bring it straight back)
		this._quietUntil = performance.now() + 600;
		if ( relock ) this.app.input.requestLock();

	}

	tab( id ) {

		this.build();
		this.el.dataset.tab = id;
		this.el.classList.toggle( 'is-audio', id === 'audio' );
		for ( const t of this.el.querySelectorAll( '.gm-tab' ) ) t.classList.toggle( 'is-on', t.dataset.tab === id );
		if ( id === 'audio' ) this.syncAudio();

	}

	// ---- audio (1.21)
	get audio() {

		return this.app.audio || null;

	}

	// the sliders from the soundscape
	syncAudio() {

		if ( ! this.el ) return;
		const s = readAudio( this.audio );
		for ( const g of AUDIO_GROUPS ) {

			const r = this.el.querySelector( `[data-vol="${ g.id }"]` );
			if ( r && document.activeElement !== r ) r.value = Math.round( s[ g.id ] * 100 );
			this.showVolume( g.id, s[ g.id ] );

		}

		this.el.classList.toggle( 'is-muted', s.muted );
		const m = this.el.querySelector( '[data-act="mute"]' );
		if ( m ) {

			m.classList.toggle( 'is-on', s.muted );
			m.firstChild.textContent = s.muted ? 'Sound off · unmute' : 'Mute all';

		}

	}

	showVolume( id, v ) {

		const o = this.el && this.el.querySelector( `[data-out="${ id }"]` );
		if ( o ) o.textContent = `${ Math.round( v * 100 ) }%`;

	}

	setVolume( id, v, save ) {

		const a = this.audio;
		if ( ! a ) return;
		if ( id === 'master' ) a.setMasterVolume( v );
		else a.setBusVolume( id, v );
		this.showVolume( id, v );
		if ( save ) saveAudioSettings( audioStorage(), readAudio( a ) );

	}

	toggleMute() {

		const a = this.audio;
		if ( ! a ) return;
		a.setMuted( ! a.muted );
		saveAudioSettings( audioStorage(), readAudio( a ) );
		this.syncAudio();

	}

	resetAudio() {

		const a = this.audio;
		if ( ! a ) return;
		applyAudio( a, AUDIO_DEFAULTS );
		saveAudioSettings( audioStorage(), readAudio( a ) );
		this.syncAudio();

	}

	settings() {

		this.close();
		this.app.ui.ui.togglePanel( true );

	}

	toTitle() {

		this.close();
		const ui = this.app.ui.ui;
		this.game.cancelLine && this.game.cancelLine( true );
		ui.showStartOverlay( this.app.onSail );

	}

	// why the boat can't head home right now (null: it can)
	homeBlocked() {

		const g = this.game, c = g.combat;
		if ( c && c.dead ) return 'Not while your boat is going down';
		if ( g.giants && g.giants.target ) return `Not with the ${ g.giants.target.name } on the tether`;
		if ( c && c.hurtT < HOME_CALM_S ) return 'Not in the middle of a fight';
		if ( c && c.fleet.boats.some( ( b ) => b.alive && b.state === 'attack' && b.distToPlayer < HOME_CLEAR_M ) ) return 'Not with pirates on your tail';
		if ( c && ( c.bosses || [] ).some( ( B ) => B.alive && B.provoked && B.distToPlayer < HOME_CLEAR_M * 1.5 ) ) return 'Not in the middle of a boss fight';
		return null;

	}

	goHome() {

		const why = this.homeBlocked();
		if ( why ) {

			this.note.textContent = why;
			return;

		}

		const g = this.game, app = this.app, bc = app.boatCtl, p = app.player;
		if ( g.cancelLine ) g.cancelLine( true );
		// a trawl net that's out comes straight up for sorting
		if ( g.trawl && g.trawl.state !== 'stowed' ) g.trawl.landed();
		bc.reset();
		if ( p.mode !== 'boat' && p.mode !== 'deck' ) p.takeHelm();
		this.close( ! ( g.hud && g.hud.sortOpen ) );
		g.toast( 'Back at the home dock', 2400 );

	}

}
