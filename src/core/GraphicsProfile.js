// Graphics profiles (Water Wars 1.23): the desktop one is the game as it always was; the mobile one is lighter
// for phones and tablets (src/core/DeviceMode.js decides which). The game loop is the same for both: only these
// settings differ.
//
//   maxDpr           output pixels per CSS pixel, capped (the canvas never renders at the screen's full 2-3x
//                    density: the temporal upscaler and the HUD stay sharp at 1x, and it saves 4-9x the work)
//   renderScale      the internal resolution (the upscaler rebuilds the output), live
//   ssr, shafts,     water reflections, sun shafts in the haze, motion blur (null: leave as the settings have
//   motionBlur       them), live
//   shadowSize       sun shadow map size per cascade (at start-up)
//   oceanGrid        the ocean mesh's grid per tile (at start-up; ?G= overrides)
//   refractionScale  the under-water refraction pass's resolution (at start-up)
//   maxImageSize     the largest image texture, texels a side (1.24.1: at start-up; a phone's browser gives the
//                    page far less GPU memory, and the full-size textures made an iPhone fail to load)
//
// "Live" settings change at once when the mode switches; the start-up ones on the next load.

export const PROFILES = {
	desktop: {
		id: 'desktop', maxDpr: 1, renderScale: 1, ssr: true, shafts: null, motionBlur: null,
		shadowSize: 2048, oceanGrid: 32, refractionScale: 0.5, maxImageSize: Infinity,
	},
	mobile: {
		id: 'mobile', maxDpr: 1, renderScale: 0.6, ssr: false, shafts: 0, motionBlur: 0,
		shadowSize: 1024, oceanGrid: 24, refractionScale: 0.35, maxImageSize: 512,
	},
};

export const profileFor = ( mode ) => ( mode === 'mobile' ? PROFILES.mobile : PROFILES.desktop );

// output pixels per CSS pixel for a screen of this density
export const outputDpr = ( profile, devicePixelRatio = 1 ) => Math.max( 0.5, Math.min( Number( devicePixelRatio ) || 1, profile.maxDpr ) );

// the live settings now (to put back when leaving mobile mode)
export function readLive( app ) {

	return {
		renderScale: app.settings.renderScale,
		ssr: app.waterMaterial ? app.waterMaterial.params.ssr.value > 0.5 : true,
		shafts: app.haze ? app.haze.shafts.value : null,
		motionBlur: app.post && app.post.motionBlur ? app.post.motionBlur.shutter.value : null,
	};

}

// apply a profile's live settings (or a saved set from readLive), and show them in the settings panel
export function applyLive( app, p ) {

	if ( p.renderScale != null ) app.setRenderScale( p.renderScale );
	if ( p.ssr != null && app.waterMaterial ) app.waterMaterial.params.ssr.value = p.ssr ? 1 : 0;
	if ( p.shafts != null && app.haze ) app.haze.shafts.value = p.shafts;
	if ( p.motionBlur != null && app.post && app.post.motionBlur ) app.post.motionBlur.shutter.value = p.motionBlur;
	const s = app.ui && app.ui.s;
	if ( s ) {

		s.renderScale = app.settings.renderScale;
		if ( p.ssr != null ) s.ssr = !! p.ssr;
		if ( p.shafts != null ) s.shafts = p.shafts;
		if ( p.motionBlur != null ) s.motionBlur = p.motionBlur;
		if ( app.ui.ui && app.ui.ui.refresh ) app.ui.ui.refresh();

	}

}
