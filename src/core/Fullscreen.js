// Full screen on phones and tablets (Water Wars 1.24), with the Fullscreen API: Android (Chrome, Edge, Samsung
// Internet), iPad Safari, desktops. The page asks for it (only from a tap), and on a phone also locks the screen to
// landscape. Mobile mode goes fullscreen when you tap "Tap to set sail"; the ⛶ button in the touch controls toggles
// it. iPhone Safari lets only videos go fullscreen: there the ⛶ button isn't shown. (1.24.4: no Home Screen web app
// any more.) Everything is wrapped in try/catch: a browser that refuses just stays as it is.

// what this browser can do, from a window-like object (testable)
export function fullscreenSupport( w = globalThis ) {

	const d = w.document || {};
	const el = d.documentElement || {};
	const api = !! ( ( d.fullscreenEnabled || d.webkitFullscreenEnabled ) && ( el.requestFullscreen || el.webkitRequestFullscreen ) );
	return { api };

}

export function isFullscreen( d = globalThis.document ) {

	return !! ( d && ( d.fullscreenElement || d.webkitFullscreenElement ) );

}

// go fullscreen (from a tap), and lock a phone to landscape; resolves true if it worked
export async function enterFullscreen( w = globalThis ) {

	const d = w.document, el = d && d.documentElement;
	if ( ! el || isFullscreen( d ) ) return isFullscreen( d );
	try {

		if ( el.requestFullscreen ) await el.requestFullscreen( { navigationUI: 'hide' } );
		else if ( el.webkitRequestFullscreen ) el.webkitRequestFullscreen();

	} catch ( e ) {

		return false;

	}

	try {

		// (Android: games play sideways; the browser refuses this outside fullscreen or on desktops)
		const o = w.screen && w.screen.orientation;
		if ( o && o.lock ) await o.lock( 'landscape' ).catch( () => {} );

	} catch ( e ) { /* not supported */ }

	return isFullscreen( d );

}

export async function exitFullscreen( d = globalThis.document ) {

	try {

		if ( d.exitFullscreen ) await d.exitFullscreen();
		else if ( d.webkitExitFullscreen ) d.webkitExitFullscreen();

	} catch ( e ) { /* already out */ }

}
