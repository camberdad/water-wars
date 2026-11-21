import { GPU } from './gpu/GPU.js';
import { PerspectiveCamera } from './scene/Camera.js';
import { Scene } from './scene/Scene.js';
import { Timer } from './math/Timer.js';
import { MeshRenderer } from './render/MeshRenderer.js';
import { FrameUniforms } from './render/Frame.js';

// Canvas, device, main camera / scene and the frame loop.
export class Engine {

	constructor( container ) {

		this.container = container;
		this.renderScale = 1;
		this.clock = new Timer();
		this.frame = 0;
		this.onResize = [];

	}

	async init() {

		const canvas = document.createElement( 'canvas' );
		canvas.tabIndex = 0;
		this.container.appendChild( canvas );
		this.canvas = canvas;
		this.domElement = canvas;
		await GPU.init( { canvas } );
		this.meshRenderer = new MeshRenderer();
		this.meshRenderer.syncPipelines = false; // compile in the background (App.precompile waits for them)
		this.camera = new PerspectiveCamera( 62, window.innerWidth / window.innerHeight, 0.06, 60000 );
		this.scene = new Scene();
		window.addEventListener( 'resize', () => this.resize() );
		// (Water Wars 1.24.3) phones: Safari sends 'resize' part-way through turning the screen, with the old
		// size still in innerWidth / innerHeight, and nothing after, so the canvas stayed the upright width
		// (the game in the left half of a sideways screen). The container fills the screen in CSS; a
		// ResizeObserver says when its size has really settled, and a turn is checked again once it's done.
		if ( typeof ResizeObserver === 'function' ) new ResizeObserver( () => this.resize() ).observe( this.container );
		const later = () => [ 120, 400, 900 ].forEach( ( ms ) => setTimeout( () => this.resize(), ms ) );
		window.addEventListener( 'orientationchange', later );
		if ( window.visualViewport ) window.visualViewport.addEventListener( 'resize', () => this.resize() );
		this.resize();

	}

	// the size to draw at, CSS px: the container (it fills the screen), else the window
	viewSize() {

		const r = this.container && this.container.getBoundingClientRect ? this.container.getBoundingClientRect() : null;
		const w = r && r.width >= 1 ? r.width : window.innerWidth, h = r && r.height >= 1 ? r.height : window.innerHeight;
		return { w: Math.round( w ), h: Math.round( h ) };

	}

	setRenderScale( s ) {

		this.renderScale = s;
		this.resize();

	}

	// output (canvas) size in pixels
	get width() {

		return this.canvas.width;

	}

	get height() {

		return this.canvas.height;

	}

	resize() {

		const { w, h } = this.viewSize();
		const dpr = this.renderScale;
		const cw = Math.max( 1, Math.floor( w * dpr ) ), ch = Math.max( 1, Math.floor( h * dpr ) );
		// (nothing changed: leave the canvas alone; resizing it clears it)
		if ( cw === this.canvas.width && ch === this.canvas.height && this._cssW === w && this._cssH === h ) return;
		this._cssW = w;
		this._cssH = h;
		this.canvas.width = cw;
		this.canvas.height = ch;
		this.canvas.style.width = w + 'px';
		this.canvas.style.height = h + 'px';
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		FrameUniforms.fields.outputResolution.value.set( this.canvas.width, this.canvas.height );
		for ( const f of this.onResize ) f( w, h );

	}

	// the canvas texture of this frame (render target of the final post pass)
	currentTexture() {

		return GPU.context.getCurrentTexture();

	}

	start( update ) {

		const loop = ( t ) => {

			this.clock.update( t );
			let dt = this.clock.getDelta();
			if ( dt > 0.1 ) dt = 0.1;
			this.frame ++;
			update( dt, this.clock.getElapsed() );
			this._raf = requestAnimationFrame( loop );

		};

		this._raf = requestAnimationFrame( loop );

	}

	stop() {

		cancelAnimationFrame( this._raf );

	}

}
