import './core/BenchSeed.js';
import { App } from './App.js';
import { UI } from './ui/UI.js';
import { AppUI } from './ui/AppUI.js';
import { VERSION } from './version.js';
import { reloadIfStale, startUpdateWatch } from './core/UpdateCheck.js';
import { GPU } from './engine/gpu/GPU.js';

// live updates: an old cached copy of the page reloads itself into the newest release before loading
// (not for the ?bench automation)
if ( ! /[?&]bench\b/.test( location.search ) && await reloadIfStale( VERSION ) ) await new Promise( () => {} );

// ?bench runs in background tabs too (automation): rAF does not fire in a hidden page
if ( /[?&]bench\b/.test( location.search ) ) {

	const raf = window.requestAnimationFrame.bind( window ), caf = window.cancelAnimationFrame.bind( window );
	window.requestAnimationFrame = ( cb ) => document.visibilityState === 'hidden' ? setTimeout( () => cb( performance.now() ), 16 ) : raf( cb );
	window.cancelAnimationFrame = ( id ) => ( clearTimeout( id ), caf( id ) );

}

const ui = new UI();
const app = new App();
// (1.23) the GPU lost (a phone reclaimed it in the background, a driver reset): offer a reload
GPU.onLost = () => {

	if ( document.querySelector( '.ww-lost' ) ) return;
	const d = document.createElement( 'div' );
	d.className = 'ww-lost';
	d.innerHTML = '<div><b>The graphics stopped</b><span>Your device took the GPU back (often after switching apps). Your progress is saved.</span><button type="button">Reload the game</button></div>';
	d.querySelector( 'button' ).addEventListener( 'click', () => location.reload() );
	document.body.append( d );
	try {

		if ( app.game && app.game.state ) app.game.state.save();

	} catch ( e ) { /* best effort */ }

};
window.__ui = ui;
window.__app = app; // debugging / automation

// (1.24.2) the bar: each stage's share and expected time (src/core/LoadPlan.js), real counts while shaders
// compile, and what a slow stage is waiting on
app.onLoadDetail = ( done, total ) => ui.setLoadingDetail( done, total );
ui.loadingDiag = () => app.loadingDiag();
app.init( ( p, text, until, ms ) => ui.setLoading( p, text, until, ms ) ).then( async () => {

	app.ui = new AppUI( app, ui );
	// (1.23) touch controls, the small-screen HUD and the mobile graphics profile when on a phone or tablet
	app.initMobile();
	ui.setLoading( 1, 'Ready' );
	await ui.hideLoader();
	// frame-time benchmark and reference shots (see core/Bench.js): it drives the frames itself
	if ( app.qs.has( 'bench' ) ) {

		window.__bench = new ( await import( './core/Bench.js' ) ).Bench( app );
		if ( app.qs.has( 'auto' ) ) window.__job = window.__bench.auto( app.qs.get( 'auto' ), { runs: Number( app.qs.get( 'runs' ) ) || 1 } );
		// ?bench&shots=view1,view2[&tag=name][&dt=seconds][&seq=n&every=frames]: reference shots of the named views only (core/DebugViews.js; dt > 0: the clock runs, e.g. for the eased lens flare)
		// &wdbg=N: the water shader's debug view (WaterMaterial debugMode) in the shots
		if ( app.qs.has( 'wdbg' ) && app.waterMaterial ) app.waterMaterial.debugMode.value = Number( app.qs.get( 'wdbg' ) );
		if ( app.qs.has( 'shots' ) ) window.__job = window.__bench.shots( app.qs.get( 'shots' ).split( ',' ), { tag: app.qs.get( 'tag' ) || 'shot', dt: Number( app.qs.get( 'dt' ) ) || 0, seq: Number( app.qs.get( 'seq' ) ) || 1, every: Number( app.qs.get( 'every' ) ) || 1 } );

	} else {

		app.start();
		// while playing: check for a new release now and then, and offer to return to the home screen
		// (the home screen is the "Click to set sail" overlay: an update installs itself there)
		startUpdateWatch( VERSION, { isHomeScreen: () => !! ui._start, onBeforeReload: () => app.game && app.game.state.save() } );

	}
	// the start screen's High Scores button opens the shared board (src/game/HighScores.js)
	const hsBtn = ui.startEl && ui.startEl.querySelector( '.tw-start-hs-btn' );
	if ( hsBtn ) hsBtn.addEventListener( 'click', ( e ) => {

		e.stopPropagation();
		if ( app.game && app.game.highScores ) app.game.highScores.open();

	} );
	// setting sail from the title screen (shown again from the Escape menu: app.onSail, src/game/PauseMenu.js)
	const onSail = app.onSail = () => {

		app.input.requestLock();
		// (1.24) on a phone or tablet: full screen, from this tap
		app.fullscreenOnSail();
		if ( app.audio ) app.audio.resume();
		// "Multiplayer": join the open sea with everyone else online (src/game/Multiplayer.js)
		if ( ui.startMode === 'multi' && app.game && app.game.multiplayer ) app.game.multiplayer.start( ui.startName );
		// the high-score board: from now on this captain's time at sea counts and their row syncs
		if ( app.game && app.game.highScores ) app.game.highScores.start( ui.startName );

	};
	ui.showStartOverlay( onSail );

} ).catch( ( e ) => {

	console.error( e );
	// (1.23) no WebGPU: say which browsers have it, phones included
	if ( e && ( e.code === 'no-webgpu' || e.code === 'no-adapter' ) ) ui.setLoadingError( `Water Wars needs WebGPU, which ${ e.code === 'no-webgpu' ? 'this browser doesn\'t have' : 'this device\'s graphics can\'t provide here' }. Try the latest Chrome or Edge (on a computer or an Android phone, Android 12 or newer) or Safari on iOS / iPadOS 26 or macOS 26 and newer.` );
	else ui.setLoadingError( 'Something went wrong: ' + e.message );

} );
