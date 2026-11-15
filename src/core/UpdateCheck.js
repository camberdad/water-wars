// Live updates (Water Wars), after the Castle Rangers update screen. Browsers keep a cached copy of the
// page, so after a release a player could be stuck on the old version. The game checks version.json
// (published with every build, fetched uncached) against the version it is running:
//   - on the loading screen or the home screen ("Click to set sail"), a new release installs itself:
//     an "Updating Water Wars" card fills its bar, says "Update complete", and reloads into the new
//     version (?v= makes the browser fetch the page afresh instead of the cached copy)
//   - while playing, a notice says an update is ready: return to the home screen to install it. Its
//     button saves your progress and installs it right away
// Checks run at start-up, every 30 seconds and whenever the tab comes back into view.
//
//   await reloadIfStale( VERSION )   start-up: true while the page is being replaced
//   startUpdateWatch( VERSION, { isHomeScreen, onBeforeReload } )

const VERSION_FILE = 'version.json';
let applying = false;

async function fetchLatest() {

	try {

		const r = await fetch( `${ VERSION_FILE }?check=${ Date.now() }`, { cache: 'no-store' } );
		if ( ! r.ok ) return null;
		const j = await r.json();
		return j && typeof j.version === 'string' ? j.version : null;

	} catch ( e ) {

		return null; // offline, or a dev page without the file: keep playing

	}

}

// newer than the running version? (dotted numbers: 1.4.10 > 1.4.9)
function isNewer( latest, current ) {

	const a = String( latest ).split( '.' ).map( Number ), b = String( current ).split( '.' ).map( Number );
	for ( let i = 0; i < Math.max( a.length, b.length ); i ++ ) {

		const x = a[ i ] || 0, y = b[ i ] || 0;
		if ( Number.isNaN( x ) || Number.isNaN( y ) ) return latest !== current;
		if ( x !== y ) return x > y;

	}

	return false;

}

const CSS = /* css */`
.ww-update { position: fixed; z-index: 10000; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(380px, calc(100vw - 36px));
	box-sizing: border-box; padding: 22px 24px; border: 1px solid rgba(111, 214, 198, 0.6); border-radius: 14px; background: rgba(8, 18, 26, 0.96);
	color: #eef6fb; box-shadow: 0 14px 48px rgba(0, 0, 0, 0.7); font: 500 14px Inter, system-ui, sans-serif; text-align: center; }
.ww-update-title { margin-bottom: 16px; color: #6fd6c6; font-size: 19px; font-weight: 700; letter-spacing: 0.01em; }
.ww-update-track { height: 12px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 8px; background: #10222c; }
.ww-update-fill { width: 0; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #2f8fd4, #6fd6c6);
	box-shadow: 0 0 12px rgba(111, 214, 198, 0.55); transition: width 0.72s cubic-bezier(0.2, 0.8, 0.2, 1); }
.ww-update-status { min-height: 22px; margin-top: 12px; opacity: 0.9; }
.ww-update.is-done .ww-update-fill { background: linear-gradient(90deg, #2fa764, #76e5a0); box-shadow: 0 0 14px rgba(91, 232, 147, 0.55); }
.ww-update-check { display: inline-grid; width: 20px; height: 20px; margin-right: 5px; place-items: center; border-radius: 50%; background: #21884e;
	color: #fff; font: bold 14px Arial, sans-serif; vertical-align: -3px; }
.ww-update.is-pending { top: 14px; transform: translateX(-50%); width: auto; max-width: calc(100vw - 36px); padding: 10px 12px 10px 16px; border-radius: 10px;
	display: flex; align-items: center; gap: 12px; text-align: left; }
.ww-update.is-pending button { flex: none; font: 600 13px Inter, system-ui, sans-serif; border: 0; border-radius: 999px; padding: 7px 14px; cursor: pointer;
	background: #6fd6c6; color: #08221e; }
`;

function ensureStyle() {

	if ( document.getElementById( 'ww-update-style' ) ) return;
	const s = document.createElement( 'style' );
	s.id = 'ww-update-style';
	s.textContent = CSS;
	document.head.append( s );

}

// the page's URL for a version (other query options kept)
function freshUrl( version ) {

	const u = new URL( location.href );
	u.searchParams.set( 'v', version );
	u.searchParams.set( 'update', String( Date.now() ) );
	return u.toString();

}

// the "Updating Water Wars" card: the bar fills, "Update complete", then the new version loads
function applyUpdate( version, onBeforeReload = null ) {

	if ( applying ) return;
	applying = true;
	try {

		if ( onBeforeReload ) onBeforeReload();

	} catch ( e ) { /* update anyway */ }

	try {

		if ( document.pointerLockElement ) document.exitPointerLock();

	} catch ( e ) { /* ignore */ }

	ensureStyle();
	document.getElementById( 'ww-update' )?.remove();
	const card = document.createElement( 'div' );
	card.id = 'ww-update';
	card.className = 'ww-update';
	card.setAttribute( 'role', 'status' );
	card.setAttribute( 'aria-live', 'polite' );
	card.innerHTML = `<div class="ww-update-title">Updating Water Wars</div>
		<div class="ww-update-track"><div class="ww-update-fill"></div></div>
		<div class="ww-update-status">Loading v${ version }…</div>`;
	document.body.append( card );
	setTimeout( () => {

		card.querySelector( '.ww-update-fill' ).style.width = '100%';

	}, 40 );
	setTimeout( () => {

		card.classList.add( 'is-done' );
		card.querySelector( '.ww-update-status' ).innerHTML = '<span class="ww-update-check" aria-hidden="true">✓</span> Update complete';

	}, 850 );
	setTimeout( () => location.replace( freshUrl( version ) ), 1500 );

}

// while playing: "an update is ready", with a button to go home and install it
function showPending( version, onGoHome ) {

	if ( applying || document.getElementById( 'ww-update' ) ) return;
	ensureStyle();
	const n = document.createElement( 'div' );
	n.id = 'ww-update';
	n.className = 'ww-update is-pending';
	n.setAttribute( 'role', 'status' );
	n.innerHTML = `<span>A game update (v${ version }) is ready. Please return to the home screen to install it automatically.</span>
		<button type="button">Return to home screen</button>`;
	n.querySelector( 'button' ).onclick = onGoHome;
	// clicks on the notice don't reach the game
	for ( const ev of [ 'mousedown', 'pointerdown', 'click', 'wheel' ] ) n.addEventListener( ev, ( e ) => e.stopPropagation() );
	document.body.append( n );

}

// Start-up (the loading screen): a newer release installs itself before the long load. Returns true
// when the page is being replaced (the caller should stop).
export async function reloadIfStale( current ) {

	const latest = await fetchLatest();
	if ( ! latest || ! isNewer( latest, current ) ) return false;
	// already asked for this version and still not served it (the CDN catching up): don't loop
	if ( new URL( location.href ).searchParams.get( 'v' ) === latest ) return false;
	applyUpdate( latest );
	return true;

}

// While the game runs. isHomeScreen(): true on the home screen (safe to update straight away).
export function startUpdateWatch( current, { isHomeScreen = () => false, onBeforeReload = null, interval = 30000 } = {} ) {

	let latest = '';
	let busy = false;
	const goHome = () => applyUpdate( latest, onBeforeReload );
	const check = async () => {

		if ( busy || document.hidden || applying ) return;
		busy = true;
		const v = await fetchLatest();
		busy = false;
		if ( ! v || ! isNewer( v, current ) ) return;
		if ( new URL( location.href ).searchParams.get( 'v' ) === v && ! latest ) {

			// this page was loaded for v and the server still sends the old one: try again later
			latest = '';
			return;

		}

		latest = v;
		if ( isHomeScreen() ) goHome();
		else showPending( v, goHome );

	};

	check();
	const timer = setInterval( () => {

		if ( latest && isHomeScreen() ) goHome();
		else check();

	}, interval );
	document.addEventListener( 'visibilitychange', check );
	return { check, stop: () => clearInterval( timer ) };

}
