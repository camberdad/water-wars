// Keyboard / mouse input with pointer lock support.
//
// Cursor look (Water Wars): embedded in another page (an iframe: Google Sites and the like) the
// browser usually refuses pointer lock. Then just moving the cursor turns the view, and resting it
// near an edge of the game keeps turning that way. It switches on by itself when the game is framed
// or a lock request fails; ?cursor forces it on, ?lock off. lookBlocked() (set by the game) pauses it
// while a panel is open or the cursor is over the interface.
const EDGE = 0.08; // fraction of the view at each side that keeps turning
const EDGE_SPEED_X = 800; // look units (px of mouse travel) per second at the very edge (~1.6 rad/s)
const EDGE_SPEED_Y = 350;

export class Input {

	constructor( dom ) {

		this.dom = dom;
		this.keys = new Set();
		this.pressed = new Set();
		this.look = { x: 0, y: 0 };
		this.wheel = 0;
		this.mouseDown = false;
		this.rightDown = false;
		this.locked = false;
		this.enabled = true;
		const qs = typeof location !== 'undefined' ? new URLSearchParams( location.search ) : new URLSearchParams();
		let framed = false;
		try {

			framed = window.self !== window.top;

		} catch ( e ) {

			framed = true; // a cross-origin parent: certainly framed

		}

		this.embedded = framed;
		this.cursorLook = qs.has( 'cursor' ) || ( framed && ! qs.has( 'lock' ) );
		this.lookBlocked = null;
		this.cursor = { x: 0, y: 0, inside: false };
		this._edgeT = 0;
		document.addEventListener( 'pointerlockerror', () => {

			if ( ! qs.has( 'lock' ) ) this.cursorLook = true;

		} );

		window.addEventListener( 'keydown', ( e ) => {

			if ( e.target && ( e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA' ) ) return;
			if ( ! this.keys.has( e.code ) ) this.pressed.add( e.code );
			this.keys.add( e.code );
			if ( [ 'Space', 'ArrowUp', 'ArrowDown', 'Tab' ].includes( e.code ) ) e.preventDefault();

		} );
		window.addEventListener( 'keyup', ( e ) => this.keys.delete( e.code ) );
		window.addEventListener( 'blur', () => this.keys.clear() );

		dom.addEventListener( 'mousedown', ( e ) => {

			if ( e.button === 0 ) this.mouseDown = true;
			if ( e.button === 2 ) this.rightDown = true;

		} );
		window.addEventListener( 'mouseup', ( e ) => {

			if ( e.button === 0 ) this.mouseDown = false;
			if ( e.button === 2 ) this.rightDown = false;

		} );
		dom.addEventListener( 'contextmenu', ( e ) => e.preventDefault() );
		window.addEventListener( 'mousemove', ( e ) => {

			if ( this.locked || this.mouseDown || this.rightDown ) {

				this.look.x += e.movementX;
				this.look.y += e.movementY;

			} else if ( this.cursorLook && this.cursor.inside && ! this._blocked() ) {

				this.look.x += e.movementX || 0;
				this.look.y += e.movementY || 0;

			}

			const r = dom.getBoundingClientRect();
			this.cursor.x = ( e.clientX - r.left ) / Math.max( r.width, 1 );
			this.cursor.y = ( e.clientY - r.top ) / Math.max( r.height, 1 );
			this.cursor.inside = this.cursor.x >= 0 && this.cursor.x <= 1 && this.cursor.y >= 0 && this.cursor.y <= 1;

		} );
		// the cursor left the game (the rest of the page, another window): stop turning
		document.addEventListener( 'mouseleave', () => {

			this.cursor.inside = false;

		} );
		window.addEventListener( 'blur', () => {

			this.cursor.inside = false;

		} );
		dom.addEventListener( 'wheel', ( e ) => {

			this.wheel += Math.sign( e.deltaY );
			e.preventDefault();

		}, { passive: false } );

		document.addEventListener( 'pointerlockchange', () => {

			this.locked = document.pointerLockElement === dom;

		} );

	}

	requestLock() {

		// framed pages usually can't lock the pointer: cursor look instead
		if ( this.cursorLook ) return;
		try {

			if ( ! this.locked ) this.dom.requestPointerLock?.()?.catch?.( () => {

				this.cursorLook = true;

			} );

		} catch ( e ) {

			this.cursorLook = true;

		}

	}

	_blocked() {

		return ! this.enabled || !! ( this.lookBlocked && this.lookBlocked() );

	}

	down( code ) {

		return this.enabled && this.keys.has( code );

	}

	// true once per physical key press
	hit( code ) {

		return this.enabled && this.pressed.has( code );

	}

	consumeLook() {

		// cursor look: keep turning while the cursor rests near an edge
		const now = typeof performance !== 'undefined' ? performance.now() : 0;
		const dt = Math.min( 0.05, Math.max( 0, ( now - this._edgeT ) / 1000 ) );
		this._edgeT = now;
		if ( this.cursorLook && ! this.locked && this.cursor.inside && ! this.mouseDown && ! this.rightDown && ! this._blocked() ) {

			const c = this.cursor;
			const ex = c.x < EDGE ? - ( 1 - c.x / EDGE ) : c.x > 1 - EDGE ? ( c.x - ( 1 - EDGE ) ) / EDGE : 0;
			const ey = c.y < EDGE ? - ( 1 - c.y / EDGE ) : c.y > 1 - EDGE ? ( c.y - ( 1 - EDGE ) ) / EDGE : 0;
			this.look.x += ex * EDGE_SPEED_X * dt;
			this.look.y += ey * EDGE_SPEED_Y * dt;

		}

		const l = { x: this.look.x, y: this.look.y };
		this.look.x = 0;
		this.look.y = 0;
		return l;

	}

	consumeWheel() {

		const w = this.wheel;
		this.wheel = 0;
		return w;

	}

	endFrame() {

		this.pressed.clear();

	}

}
