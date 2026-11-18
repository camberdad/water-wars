// The player's sound settings (Water Wars 1.21): a master volume, a volume for each group of sounds, and
// mute. Set in the Audio tab of the Escape menu (src/game/PauseMenu.js), M mutes; saved in this browser
// (localStorage 'waterwars.audio') and applied to the soundscape (SoundScape.setBusVolume) at start-up.
//
//   master    everything
//   nature    the sea and the island: surf, wind, palms, birds, gulls, crickets, the reef underwater, the whale
//   boat      your boat: the engine, the water rushing past the hull, slaps and spray
//   effects   fishing and you: the rod and reel, the line, fish splashing, footsteps, swimming, coins
//   combat    guns, cannons, hits, explosions and missiles

export const AUDIO_GROUPS = [
	{ id: 'master', name: 'Master volume', hint: 'Everything' },
	{ id: 'nature', name: 'Sea & nature', hint: 'Surf, wind, birds, the reef, the whale' },
	{ id: 'boat', name: 'Boat engine', hint: 'Engine, hull and spray' },
	{ id: 'effects', name: 'Fishing & effects', hint: 'Rod and reel, splashes, footsteps, coins' },
	{ id: 'combat', name: 'Guns & explosions', hint: 'Gunfire, cannons, explosions, missiles' },
];

export const AUDIO_BUSES = AUDIO_GROUPS.filter( ( g ) => g.id !== 'master' ).map( ( g ) => g.id );

export const AUDIO_DEFAULTS = Object.freeze( { master: 0.8, nature: 1, boat: 1, effects: 1, combat: 1, muted: false } );

export const AUDIO_KEY = 'waterwars.audio';

const unit = ( v, d ) => ( typeof v === 'number' && Number.isFinite( v ) ? Math.max( 0, Math.min( 1, v ) ) : d );

// a clean settings object from anything (a saved one, possibly old or broken)
export function sanitizeAudio( o ) {

	const s = { ...AUDIO_DEFAULTS };
	if ( ! o || typeof o !== 'object' ) return s;
	for ( const g of AUDIO_GROUPS ) s[ g.id ] = unit( o[ g.id ], AUDIO_DEFAULTS[ g.id ] );
	s.muted = o.muted === true;
	return s;

}

export function loadAudioSettings( storage ) {

	try {

		const raw = storage && storage.getItem( AUDIO_KEY );
		return sanitizeAudio( raw ? JSON.parse( raw ) : null );

	} catch ( e ) {

		return sanitizeAudio( null );

	}

}

export function saveAudioSettings( storage, s ) {

	try {

		if ( storage ) storage.setItem( AUDIO_KEY, JSON.stringify( sanitizeAudio( s ) ) );

	} catch ( e ) { /* storage full or blocked: the settings just don't stick */ }

}

// the soundscape's current settings
export function readAudio( audio ) {

	if ( ! audio ) return sanitizeAudio( null );
	const s = { master: audio.volume, muted: audio.muted };
	for ( const id of AUDIO_BUSES ) s[ id ] = audio.busVolume( id );
	return sanitizeAudio( s );

}

export function applyAudio( audio, s ) {

	if ( ! audio ) return;
	const c = sanitizeAudio( s );
	audio.setMasterVolume( c.master );
	for ( const id of AUDIO_BUSES ) audio.setBusVolume( id, c[ id ] );
	audio.setMuted( c.muted );

}

export const audioStorage = () => {

	try {

		return typeof localStorage !== 'undefined' ? localStorage : null;

	} catch ( e ) {

		return null;

	}

};
