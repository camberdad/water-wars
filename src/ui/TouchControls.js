// On-screen touch controls for mobile mode (Water Wars 1.23: src/core/DeviceMode.js).
//
// They drive the game through the same input the keyboard and mouse do (src/core/Input.js), so nothing
// in the game knows the difference and desktop play is untouched:
//
//   left half of the screen   a floating joystick where the thumb lands: W A S D (walk, swim, throttle and
//                             steer at the helm); pushed to the rim it adds Shift (run / boost)
//   right half                drag to look and aim (the mouse's movement)
//   Cast / Fire (big)         the left mouse button, held: cast and reel; aboard, fire the deck gun
//   Reel / Cannon             the right mouse button, held: reel in; aboard, fire the bow cannon
//                             (1.24.1) their words follow what they do: ashore Cast and Reel; aboard a boat Fire
//                             (Cast under it, small, once the rod is out) and Cannon (Reel under it): buttonLabels()
//   Use                       E: board, take the helm, talk, open chests
//   ▲ / ▼                     Space and C, held: jump / swim up, crouch / dive
//   ☰ (top left)              Escape: the menu (resume, settings, audio, home dock)
//   ⛶ (top left)              full screen (1.24: src/core/Fullscreen.js); not shown where the browser can't
//                             (iPhone Safari)
//   ⋯ (top left)              more: cooler, harbour services, loot, harpoon, trawl net, stern rod, rod,
//                             camera, high scores, flashlight, right the boat, and Controls (the help sheet,
//                             its touch version: src/ui/UI.js _buildHelp)
//   the prompt                tap the "E  Board boat" style prompt at the bottom to press its key
//
// Keys are sent as keyboard events on the document (so the HUD's own key handlers, the Escape menu and the
// high-score board hear them too); the mouse buttons and the look are set on the Input directly. All of it
// hides while a menu or panel is open, and while the start screen is up.

// a joystick throw past this (of its radius) presses a direction; past RUN it also holds Shift
const DEAD = 0.32, RUN = 0.92;
const STICK_R = 56; // CSS px: the joystick's travel
const LOOK_GAIN = 1.6; // look per pixel dragged, relative to the mouse

// the joystick's keys for a throw (x right, y down, in -1..1 of its radius)
export function stickKeys( x, y ) {

	const m = Math.hypot( x, y );
	const out = new Set();
	if ( m < DEAD ) return out;
	const nx = x / m, ny = y / m;
	if ( ny < - 0.38 ) out.add( 'KeyW' );
	if ( ny > 0.38 ) out.add( 'KeyS' );
	if ( nx < - 0.38 ) out.add( 'KeyA' );
	if ( nx > 0.38 ) out.add( 'KeyD' );
	if ( m >= RUN ) out.add( 'ShiftLeft' );
	return out;

}

// the key code for a HUD prompt's key label ('E', 'Space', 'LMB', ...), or a mouse button
export function promptAction( label ) {

	const k = String( label || '' ).trim();
	if ( /^[A-Z]$/.test( k ) ) return { key: 'Key' + k };
	if ( k === 'Space' ) return { key: 'Space' };
	if ( k === 'Esc' || k === 'Escape' ) return { key: 'Escape' };
	if ( k === 'LMB' ) return { mouse: 'left' };
	if ( k === 'RMB' ) return { mouse: 'right' };
	return null;

}

// what the two mouse buttons say: { action: { label, sub }, alt: { label, sub } } (sub '' for none).
// aboard: at the helm or on deck; rod: the fishing rod is out
export function buttonLabels( { aboard = false, rod = false } = {} ) {

	return aboard
		? { action: { label: 'Fire', sub: rod ? 'Cast' : '' }, alt: { label: 'Cannon', sub: 'Reel' } }
		: { action: { label: 'Cast', sub: '' }, alt: { label: 'Reel', sub: '' } };

}

const MAIN = [
	{ id: 'action', label: 'Cast', sub: '', mouse: 'left', cls: 'is-big', always: true },
	{ id: 'alt', label: 'Reel', sub: '', mouse: 'right', always: true },
	{ id: 'use', label: 'Use', sub: 'E', key: 'KeyE' },
	{ id: 'up', label: '▲', sub: 'jump · up', key: 'Space' },
	{ id: 'down', label: '▼', sub: 'dive', key: 'KeyC' },
];

const MORE = [
	{ label: 'Cooler', key: 'KeyI' },
	{ label: 'Services', key: 'KeyU' },
	{ label: 'Loot', key: 'KeyG' },
	{ label: 'Harpoon', key: 'KeyQ' },
	{ label: 'Trawl net', key: 'KeyN' },
	{ label: 'Stern rod', key: 'KeyB' },
	{ label: 'Rod', key: 'KeyR' },
	{ label: 'Camera', key: 'KeyV' },
	{ label: 'Right boat', key: 'KeyX' },
	{ label: 'Scores', key: 'KeyK' },
	{ label: 'Light', key: 'KeyL' },
	{ label: 'Controls', key: 'F1' },
];

export class TouchControls {

	constructor( { input, canvas, root, isBlocked = () => false, onFullscreen = null, context = null } ) {

		this.input = input;
		this.canvas = canvas;
		this.root = root;
		this.isBlocked = isBlocked;
		this.onFullscreen = onFullscreen;
		this.context = context; // () => { aboard, rod }: the buttons' words (buttonLabels)
		this._labelKey = '';
		this.enabled = false;
		this.down = new Set(); // keys held by the touch controls
		this.stick = null; // { id, x0, y0, keys }
		this.looks = new Map(); // pointer id -> { x, y }
		this.mouse = { left: 0, right: 0 }; // how many touches hold each button
		this._build();

	}

	_build() {

		const onFullscreen = this.onFullscreen;
		const el = this.el = document.createElement( 'div' );
		el.className = 'ww-touch';
		el.hidden = true;
		const btn = ( b ) => `<button type="button" class="ww-tb ${ b.cls || '' }" data-id="${ b.id || '' }"${ b.key ? ` data-key="${ b.key }"` : '' }${ b.mouse ? ` data-mouse="${ b.mouse }"` : '' } aria-label="${ b.label }${ b.sub ? ' (' + b.sub + ')' : '' }"><b>${ b.label }</b>${ b.sub || b.always ? `<small${ b.sub ? '' : ' hidden' }>${ b.sub }</small>` : '' }</button>`;
		el.innerHTML = `
			<div class="ww-stick" aria-hidden="true"><i></i></div>
			<div class="ww-rotate">Turn your phone sideways for the best view</div>
			<div class="ww-touch-top">
				<button type="button" class="ww-tb is-small" data-key="Escape" aria-label="Menu"><b>☰</b></button>
				<button type="button" class="ww-tb is-small" data-more aria-label="More actions" aria-expanded="false"><b>⋯</b></button>
				<button type="button" class="ww-tb is-small" data-fs aria-label="Full screen"${ onFullscreen ? '' : ' hidden' }><b>⛶</b></button>
			</div>
			<div class="ww-touch-more" hidden>${ MORE.map( btn ).join( '' ) }</div>
			<div class="ww-touch-main">${ MAIN.map( btn ).join( '' ) }</div>`;
		this.root.append( el );
		this.stickEl = el.querySelector( '.ww-stick' );
		this.knob = this.stickEl.querySelector( 'i' );
		this.moreEl = el.querySelector( '.ww-touch-more' );
		this.moreBtn = el.querySelector( '[data-more]' );

		// the buttons: pressed while a finger is on them (pointer capture keeps it if the finger slides)
		for ( const b of el.querySelectorAll( '.ww-tb' ) ) {

			if ( b.hasAttribute( 'data-fs' ) ) {

				b.addEventListener( 'click', ( e ) => {

					// (a click, not pointerdown: browsers only allow fullscreen from a completed tap)
					e.preventDefault();
					e.stopPropagation();
					if ( this.onFullscreen ) this.onFullscreen();

				} );
				b.addEventListener( 'pointerdown', ( e ) => e.stopPropagation() );
				continue;

			}

			if ( b.hasAttribute( 'data-more' ) ) {

				b.addEventListener( 'pointerdown', ( e ) => {

					e.preventDefault();
					e.stopPropagation();
					this.toggleMore();

				} );
				continue;

			}

			const press = ( e ) => {

				e.preventDefault();
				e.stopPropagation();
				try {

					b.setPointerCapture( e.pointerId );

				} catch ( err ) { /* synthetic pointer */ }

				b.classList.add( 'is-down' );
				this._press( b.dataset );

			};

			const release = ( e ) => {

				if ( ! b.classList.contains( 'is-down' ) ) return;
				e.stopPropagation();
				b.classList.remove( 'is-down' );
				this._release( b.dataset );
				// a drawer action closes the drawer
				if ( this.moreEl.contains( b ) ) this.toggleMore( false );

			};

			b.addEventListener( 'pointerdown', press );
			b.addEventListener( 'pointerup', release );
			b.addEventListener( 'pointercancel', release );
			b.addEventListener( 'lostpointercapture', release );
			b.addEventListener( 'contextmenu', ( e ) => e.preventDefault() );

		}

		// the canvas: the joystick (left half) and looking (right half)
		const c = this.canvas;
		this._onDown = ( e ) => this._canvasDown( e );
		this._onMove = ( e ) => this._canvasMove( e );
		this._onUp = ( e ) => this._canvasUp( e );

	}

	enable( on ) {

		on = !! on;
		if ( on === this.enabled ) return;
		this.enabled = on;
		const c = this.canvas;
		if ( on ) {

			c.addEventListener( 'pointerdown', this._onDown );
			window.addEventListener( 'pointermove', this._onMove, { passive: false } );
			window.addEventListener( 'pointerup', this._onUp );
			window.addEventListener( 'pointercancel', this._onUp );

		} else {

			c.removeEventListener( 'pointerdown', this._onDown );
			window.removeEventListener( 'pointermove', this._onMove );
			window.removeEventListener( 'pointerup', this._onUp );
			window.removeEventListener( 'pointercancel', this._onUp );
			this.releaseAll();

		}

		this.el.hidden = ! on;
		// (hidden at once if a screen is up: the loader, the start screen; frames may not be running yet)
		this._blocked = undefined;
		if ( on ) this.update();

	}

	toggleMore( open = this.moreEl.hidden ) {

		this.moreEl.hidden = ! open;
		this.moreBtn.setAttribute( 'aria-expanded', open ? 'true' : 'false' );
		this.moreBtn.classList.toggle( 'is-on', open );

	}

	// ---- keys and buttons
	_key( code, down ) {

		if ( down === this.down.has( code ) ) return;
		if ( down ) this.down.add( code );
		else this.down.delete( code );
		const key = code.startsWith( 'Key' ) ? code.slice( 3 ).toLowerCase() : code === 'Space' ? ' ' : code;
		document.dispatchEvent( new KeyboardEvent( down ? 'keydown' : 'keyup', { code, key, bubbles: true, cancelable: true } ) );

	}

	_mouse( which, down ) {

		this.mouse[ which ] = Math.max( 0, this.mouse[ which ] + ( down ? 1 : - 1 ) );
		this.input.mouseDown = this.mouse.left > 0;
		this.input.rightDown = this.mouse.right > 0;

	}

	_press( d ) {

		this.input.lastTouch = performance.now();
		if ( d.mouse ) this._mouse( d.mouse, true );
		else if ( d.key ) this._key( d.key, true );

	}

	_release( d ) {

		if ( d.mouse ) this._mouse( d.mouse, false );
		else if ( d.key ) this._key( d.key, false );

	}

	// tap the HUD prompt: press its key for a moment
	tapPrompt( label ) {

		const a = promptAction( label );
		if ( ! a ) return;
		const d = a.mouse ? { mouse: a.mouse } : { key: a.key };
		this._press( d );
		setTimeout( () => this._release( d ), 120 );

	}

	releaseAll() {

		for ( const k of [ ...this.down ] ) this._key( k, false );
		this.mouse.left = this.mouse.right = 0;
		this.input.mouseDown = this.input.rightDown = false;
		this.stick = null;
		this.looks.clear();
		this.stickEl.classList.remove( 'is-on' );
		for ( const b of this.el.querySelectorAll( '.ww-tb.is-down' ) ) b.classList.remove( 'is-down' );

	}

	// ---- the canvas
	_canvasDown( e ) {

		if ( e.pointerType === 'mouse' || this._blocked ) return;
		e.preventDefault();
		this.input.lastTouch = performance.now();
		if ( ! this.moreEl.hidden ) this.toggleMore( false );
		const left = e.clientX < window.innerWidth * 0.45;
		if ( left && ! this.stick ) {

			this.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, keys: new Set() };
			this.stickEl.style.left = e.clientX + 'px';
			this.stickEl.style.top = e.clientY + 'px';
			this.knob.style.transform = 'translate(-50%, -50%)';
			this.stickEl.classList.add( 'is-on' );

		} else {

			this.looks.set( e.pointerId, { x: e.clientX, y: e.clientY } );

		}

	}

	_canvasMove( e ) {

		if ( e.pointerType === 'mouse' ) return;
		const s = this.stick;
		if ( s && e.pointerId === s.id ) {

			e.preventDefault();
			let dx = e.clientX - s.x0, dy = e.clientY - s.y0;
			const m = Math.hypot( dx, dy );
			if ( m > STICK_R ) {

				dx *= STICK_R / m;
				dy *= STICK_R / m;

			}

			this.knob.style.transform = `translate(calc(-50% + ${ dx }px), calc(-50% + ${ dy }px))`;
			const want = stickKeys( dx / STICK_R, dy / STICK_R );
			for ( const k of [ 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft' ] ) this._key( k, want.has( k ) );
			return;

		}

		const l = this.looks.get( e.pointerId );
		if ( l ) {

			e.preventDefault();
			this.input.look.x += ( e.clientX - l.x ) * LOOK_GAIN;
			this.input.look.y += ( e.clientY - l.y ) * LOOK_GAIN;
			l.x = e.clientX;
			l.y = e.clientY;

		}

	}

	_canvasUp( e ) {

		if ( e.pointerType === 'mouse' ) return;
		const s = this.stick;
		if ( s && e.pointerId === s.id ) {

			this.stick = null;
			for ( const k of [ 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft' ] ) this._key( k, false );
			this.stickEl.classList.remove( 'is-on' );

		}

		this.looks.delete( e.pointerId );

	}

	// per frame: hidden (and everything let go) while a menu or panel is open
	update() {

		if ( ! this.enabled ) return;
		this.updateLabels();
		const blocked = !! this.isBlocked();
		if ( blocked === this._blocked ) return;
		this._blocked = blocked;
		this.el.classList.toggle( 'is-blocked', blocked );
		if ( blocked ) {

			this.releaseAll();
			this.toggleMore( false );

		}

	}

	// the Cast / Fire and Reel / Cannon words, from where you are (only when they change)
	updateLabels() {

		const ctx = this.context ? this.context() : null;
		const L = buttonLabels( ctx || {} );
		const key = `${ L.action.label }|${ L.action.sub }|${ L.alt.label }|${ L.alt.sub }`;
		if ( key === this._labelKey ) return;
		this._labelKey = key;
		for ( const id of [ 'action', 'alt' ] ) {

			const b = this.el.querySelector( `[data-id="${ id }"]` );
			if ( ! b ) continue;
			const { label, sub } = L[ id ];
			b.querySelector( 'b' ).textContent = label;
			const s = b.querySelector( 'small' );
			if ( s ) {

				s.textContent = sub;
				s.hidden = ! sub;

			}

			b.setAttribute( 'aria-label', sub ? `${ label } (${ sub })` : label );

		}

	}

}
