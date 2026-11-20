// Mobile / desktop mode (Water Wars 1.23).
//
// Decides whether the game runs with its desktop controls and layout (keyboard, mouse, pointer lock) or its
// mobile ones (on-screen touch controls, a HUD for small screens and safe areas, a lighter graphics profile:
// src/core/GraphicsProfile.js). Desktop play is unchanged: mobile mode only switches things on.
//
//   override  'auto' (default) | 'mobile' | 'desktop': for testing and for players who want the other one.
//             Kept in this browser (localStorage 'waterwars.mode'); ?mode=mobile|desktop|auto in the URL sets it.
//             Set from the settings panel (Performance > Device) or setOverride().
//   auto      from the device's capabilities: a coarse primary pointer (a finger) and no hover, or touch points
//             on a small screen without a mouse, means mobile; a fine pointer (a mouse or trackpad) means desktop.
//             Then live: the input the player actually uses wins. A real touch (PointerEvent.pointerType 'touch')
//             switches to mobile; a mouse click or a keyboard switches back (a touch-screen laptop goes both ways).
//             The screen turning or resizing re-checks.
//
// The mode is mirrored on <html> as the class is-mobile / is-desktop (src/ui/mobile.css styles by it), and
// listeners hear every change: onChange( ( mode, why ) => ... ).

export const MODES = [ 'auto', 'mobile', 'desktop' ];
export const MODE_KEY = 'waterwars.mode';

// the device's capabilities, from a window-like object (testable: pass a fake)
export function readCaps( w = globalThis ) {

	const nav = w.navigator || {};
	const mq = ( q ) => {

		try {

			return !! ( w.matchMedia && w.matchMedia( q ).matches );

		} catch ( e ) {

			return false;

		}

	};

	const vw = Number( w.innerWidth ) || 0, vh = Number( w.innerHeight ) || 0;
	return {
		touchPoints: Number( nav.maxTouchPoints ) || 0,
		coarse: mq( '(pointer: coarse)' ), // the primary pointer is a finger
		fine: mq( '(any-pointer: fine)' ), // a mouse or trackpad is attached
		hover: mq( '(hover: hover)' ), // the primary pointer can hover
		short: Math.min( vw, vh ), // the short side of the viewport, CSS px
		long: Math.max( vw, vh ),
		mobileUA: !! ( nav.userAgentData && nav.userAgentData.mobile ) || /Android|iPhone|iPad|iPod|Mobile/i.test( nav.userAgent || '' ),
	};

}

// is this a mobile / touch-first device? (the capability guess, before any input is seen)
export function looksMobile( c ) {

	if ( ! c ) return false;
	// a finger as the primary pointer, and nothing that hovers: phones and tablets
	if ( c.coarse && ! c.hover ) return true;
	// touch on a phone-sized screen with no mouse (some browsers report pointer: fine for touch screens)
	if ( c.touchPoints > 0 && ! c.fine && c.short > 0 && c.short <= 900 ) return true;
	// a mobile browser that says so, with touch
	if ( c.mobileUA && c.touchPoints > 0 && ! c.fine ) return true;
	return false;

}

// the mode to run in: the override, or the auto guess (refined by the last real input: 'touch' | 'mouse' | null)
export function resolveMode( override, caps, lastInput = null ) {

	if ( override === 'mobile' || override === 'desktop' ) return override;
	if ( lastInput === 'touch' ) return 'mobile';
	if ( lastInput === 'mouse' ) return 'desktop';
	return looksMobile( caps ) ? 'mobile' : 'desktop';

}

export const sanitizeOverride = ( v ) => ( MODES.includes( v ) ? v : 'auto' );

export class DeviceMode {

	constructor( { win = typeof window !== 'undefined' ? window : null, storage = null } = {} ) {

		this.win = win;
		this.storage = storage !== null ? storage : ( () => {

			try {

				return win && win.localStorage ? win.localStorage : null;

			} catch ( e ) {

				return null;

			}

		} )();
		this.listeners = new Set();
		this.lastInput = null;
		let saved = 'auto';
		try {

			saved = ( this.storage && this.storage.getItem( MODE_KEY ) ) || 'auto';

		} catch ( e ) { /* blocked storage */ }

		const q = win && win.location ? new URLSearchParams( win.location.search ).get( 'mode' ) : null;
		this.override = sanitizeOverride( q || saved );
		if ( q ) this._save();
		this.caps = win ? readCaps( win ) : null;
		this.mode = resolveMode( this.override, this.caps, null );
		this._mark();

	}

	get isMobile() {

		return this.mode === 'mobile';

	}

	onChange( fn ) {

		this.listeners.add( fn );
		return () => this.listeners.delete( fn );

	}

	setOverride( v ) {

		this.override = sanitizeOverride( v );
		// a manual choice starts the live guessing afresh
		this.lastInput = null;
		this._save();
		this._update( 'override' );

	}

	// a real input was seen ('touch' | 'mouse'): in auto mode it decides
	noteInput( kind ) {

		if ( kind !== 'touch' && kind !== 'mouse' ) return;
		if ( kind === this.lastInput ) return;
		this.lastInput = kind;
		if ( this.override === 'auto' ) this._update( kind );

	}

	// start listening (browser only): pointer types, the keyboard, the coarse-pointer query, resizes
	watch() {

		const w = this.win;
		if ( ! w || this._watching ) return this;
		this._watching = true;
		// (capture: before anything stops it; pointerType is the real device, unlike the mouse events a tap makes)
		w.addEventListener( 'pointerdown', ( e ) => this.noteInput( e.pointerType === 'touch' ? 'touch' : e.pointerType === 'mouse' ? 'mouse' : null ), true );
		w.addEventListener( 'keydown', ( e ) => {

			// a real keyboard (not the touch controls' own key events)
			if ( e.isTrusted && ! e.repeat && this.override === 'auto' && this.mode === 'mobile' && this.caps && this.caps.fine ) this.noteInput( 'mouse' );

		}, true );
		const recheck = () => {

			this.caps = readCaps( w );
			this._update( 'resize' );

		};
		try {

			const m = w.matchMedia && w.matchMedia( '(pointer: coarse)' );
			if ( m && m.addEventListener ) m.addEventListener( 'change', recheck );

		} catch ( e ) { /* old browsers */ }

		w.addEventListener( 'orientationchange', recheck );
		let t = 0;
		w.addEventListener( 'resize', () => {

			clearTimeout( t );
			t = setTimeout( recheck, 250 );

		} );
		return this;

	}

	_update( why ) {

		const mode = resolveMode( this.override, this.caps, this.lastInput );
		if ( mode === this.mode ) return;
		this.mode = mode;
		this._mark();
		for ( const fn of this.listeners ) {

			try {

				fn( mode, why );

			} catch ( e ) {

				console.error( e );

			}

		}

	}

	_mark() {

		const d = this.win && this.win.document && this.win.document.documentElement;
		if ( ! d || ! d.classList ) return;
		d.classList.toggle( 'is-mobile', this.mode === 'mobile' );
		d.classList.toggle( 'is-desktop', this.mode !== 'mobile' );

	}

	_save() {

		try {

			if ( this.storage ) this.storage.setItem( MODE_KEY, this.override );

		} catch ( e ) { /* blocked storage */ }

	}

}
