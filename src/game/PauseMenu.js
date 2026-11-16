// The Escape menu (Water Wars 1.15). Escape, with nothing else open (a panel, the controls sheet, a catch
// card), brings up a small menu: resume, the settings panel, back to the home dock (the boat to its berth
// at the harbour, you at the helm), or out to the title screen. Escape again (or Resume) closes it.
//
// In the browser, Escape while the mouse is captured gives the mouse back first and the key may never reach
// the page, so the menu also opens when the mouse is let go during play without anything else asking for it.

const CSS = /* css */`
.gm-panel.gm-pause { width: calc(330 * var(--tw-u)); max-width: 92vw; text-align: center; }
.gm-pause h2 { margin-bottom: var(--tw-3); }
.gm-pause .gm-btn { display: block; width: 100%; margin-top: var(--tw-2); padding: var(--tw-3) var(--tw-4); }
.gm-pause .gm-btn small { display: block; font-weight: 500; font-size: var(--tw-fs-xs); opacity: 0.7; }
.gm-pause .gm-note { min-height: 1.2em; margin-top: var(--tw-3); color: var(--tw-coral); font-size: var(--tw-fs-sm); }
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
		el.innerHTML = `
			<h2>Water Wars</h2>
			<button class="gm-btn" data-act="resume">Resume<small>Esc</small></button>
			<button class="gm-btn is-ghost" data-act="settings">Settings<small>H</small></button>
			<button class="gm-btn is-ghost" data-act="home">Return to the home dock<small>your boat back at its berth in the harbour</small></button>
			<button class="gm-btn is-ghost" data-act="title">Exit to the title screen</button>
			<div class="gm-note"></div>`;
		ui.root.append( el );
		this.note = el.querySelector( '.gm-note' );
		for ( const b of el.querySelectorAll( '[data-act]' ) ) b.addEventListener( 'click', ( e ) => {

			e.stopPropagation();
			const act = b.dataset.act;
			if ( act === 'resume' ) this.close( true );
			else if ( act === 'settings' ) this.settings();
			else if ( act === 'home' ) this.goHome();
			else if ( act === 'title' ) this.toTitle();

		} );

	}

	show() {

		this.build();
		this.open = true;
		this.note.textContent = '';
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
