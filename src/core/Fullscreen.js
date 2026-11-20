// Full screen on phones and tablets (Water Wars 1.24).
//
// Two ways, because browsers differ:
//
//   the Fullscreen API   Android (Chrome, Edge, Samsung Internet), iPad Safari, desktops: the page asks for it
//                        (only from a tap), and on a phone also locks the screen to landscape. Mobile mode goes
//                        fullscreen when you tap "Tap to set sail"; the ⛶ button in the touch controls toggles it.
//   a Home Screen app    iPhone Safari lets only videos go fullscreen. Added to the Home Screen (Share > Add to
//                        Home Screen), the game opens as a web app with no browser bars at all (index.html:
//                        apple-mobile-web-app-capable, manifest.webmanifest display: fullscreen). The ⛶ button
//                        and a one-time hint on the start screen say how.
//
// Everything is wrapped in try/catch: a browser that refuses just stays as it is.

export const HINT_KEY = 'waterwars.homescreenHint';

// what this browser can do, from a window-like object (testable)
export function fullscreenSupport( w = globalThis ) {

	const d = w.document || {};
	const el = d.documentElement || {};
	const nav = w.navigator || {};
	const ua = nav.userAgent || '';
	const mq = ( q ) => {

		try {

			return !! ( w.matchMedia && w.matchMedia( q ).matches );

		} catch ( e ) {

			return false;

		}

	};

	const api = !! ( ( d.fullscreenEnabled || d.webkitFullscreenEnabled ) && ( el.requestFullscreen || el.webkitRequestFullscreen ) );
	// an installed web app (from the Home Screen): already without browser bars
	const app = mq( '(display-mode: fullscreen)' ) || mq( '(display-mode: standalone)' ) || nav.standalone === true;
	const iphone = /iPhone|iPod/.test( ua );
	return { api, app, iphone, homeScreen: ! api && ! app && iphone };

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

export const HOME_SCREEN_TEXT = 'For full screen on iPhone: tap Share, then Add to Home Screen, and open Water Wars from your Home Screen';
