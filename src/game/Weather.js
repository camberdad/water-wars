// Shared weather (Water Wars 1.13.4). In multiplayer every player's sea and sky follow one weather
// schedule worked out from the wall clock: the same spell of weather at the same time on every computer,
// with no host and nothing sent over the network. The waves already run on the shared clock (1.13.2), so
// with the same wind, fetch and swell everyone rides the very same swell.
//
// The sea passes through spells of SPELL_S seconds, each Calm, Breezy, Choppy or Storm (picked by a hash
// of the spell's number, weighted toward the milder ones). Over the last TURN_S seconds of a spell the
// conditions blend smoothly into the next one, and the wind direction wanders slowly all the time.

export const SPELL_S = 12 * 60; // one spell of weather lasts 12 minutes
export const TURN_S = 3 * 60; // ...and turns into the next over its last 3 minutes

// the sea state of each kind (as the settings panel's Conditions presets) plus its sky
export const WEATHER = [
	{ id: 'calm', name: 'Calm', weight: 2, wind: 3.5, fetch: 40, chop: 0.75, swell: 0.28, surf: 0.18, period: 11, whitecaps: 0.2, clouds: 0.22, haze: 1.3 },
	{ id: 'breezy', name: 'Breezy', weight: 4, wind: 7, fetch: 120, chop: 0.9, swell: 0.48, surf: 0.34, period: 9, whitecaps: 0.5, clouds: 0.45, haze: 1.6 },
	{ id: 'choppy', name: 'Choppy', weight: 3, wind: 12, fetch: 300, chop: 1.05, swell: 0.68, surf: 0.56, period: 8.5, whitecaps: 0.75, clouds: 0.7, haze: 2.0 },
	{ id: 'storm', name: 'Storm', weight: 1, wind: 20, fetch: 900, chop: 1.2, swell: 1.0, surf: 0.9, period: 12, whitecaps: 1, clouds: 0.95, haze: 2.8 },
];
export const WEATHER_KEYS = [ 'wind', 'fetch', 'chop', 'swell', 'surf', 'period', 'whitecaps', 'clouds', 'haze' ];

const WIND_DIR = 25; // degrees: the prevailing wind (the sea's default)
const WIND_SWING = 40; // ...wandering this far either side
const WIND_WANDER_S = 30 * 60; // ...over about half an hour

// an integer hash to [0, 1): the same on every computer
export function hash01( n ) {

	let x = ( n | 0 ) ^ 0x2545f491;
	x = Math.imul( x ^ ( x >>> 16 ), 0x7feb352d );
	x = Math.imul( x ^ ( x >>> 15 ), 0x846ca68b );
	x ^= x >>> 16;
	return ( x >>> 0 ) / 4294967296;

}

const TOTAL = WEATHER.reduce( ( a, w ) => a + w.weight, 0 );

// the kind of weather (index into WEATHER) of spell number i
export function spellKind( i ) {

	let r = hash01( i ) * TOTAL;
	for ( let k = 0; k < WEATHER.length; k ++ ) {

		r -= WEATHER[ k ].weight;
		if ( r < 0 ) return k;

	}

	return WEATHER.length - 1;

}

const smooth = ( u ) => u <= 0 ? 0 : u >= 1 ? 1 : u * u * ( 3 - 2 * u );

// the weather at time t (seconds on the wall clock): the blended conditions, the kind of weather the
// sea is in now (`id`, `name`), what it is turning into (`next`) and how far it has turned (`turn`, 0..1)
export function weatherAt( t ) {

	const i = Math.floor( t / SPELL_S );
	const into = t - i * SPELL_S;
	const a = WEATHER[ spellKind( i ) ], b = WEATHER[ spellKind( i + 1 ) ];
	const u = a === b ? 0 : smooth( ( into - ( SPELL_S - TURN_S ) ) / TURN_S );
	const w = {};
	for ( const k of WEATHER_KEYS ) w[ k ] = a[ k ] + ( b[ k ] - a[ k ] ) * u;
	// the wind direction: smooth value noise around the prevailing wind
	const s = t / WIND_WANDER_S, j = Math.floor( s );
	const n = hash01( 0x5eed + j ) + ( hash01( 0x5eed + j + 1 ) - hash01( 0x5eed + j ) ) * smooth( s - j );
	w.windDir = ( ( WIND_DIR + ( n * 2 - 1 ) * WIND_SWING ) % 360 + 360 ) % 360;
	const now = u < 0.5 ? a : b;
	w.id = now.id;
	w.name = now.name;
	w.next = b.id;
	w.turn = u;
	return w;

}

// Drives the sea and sky from the shared weather while the player is online (Game creates it,
// Multiplayer starts it once connected). The settings panel's sea-state and cloud controls follow it.
export class SharedWeather {

	constructor( game ) {

		this.game = game;
		this.app = game.app;
		this.on = false;
		this.wait = 0;
		this.id = null;

	}

	// the shared clock: real seconds (every player's computer clock agrees to within a few seconds)
	clock() {

		return Date.now() / 1000;

	}

	start() {

		if ( this.on ) return;
		this.on = true;
		this.wait = 0;
		this.id = null;
		this.update( 0 );

	}

	update( dt ) {

		if ( ! this.on ) return;
		this.wait -= dt;
		if ( this.wait > 0 ) return;
		// once a second: the conditions change slowly (a new wave spectrum costs a small compute pass)
		this.wait = 1;
		const ui = this.app.ui;
		if ( ! ui || ! ui.applyConditions ) return;
		const w = weatherAt( this.clock() );
		ui.applyConditions( w );
		if ( w.id !== this.id ) {

			if ( this.id === null ) this.game.toast( `🌐 Shared weather: ${ w.name.toLowerCase() } seas. Every player online has the same weather and waves.`, 4000 );
			else this.game.toast( w.id === 'storm' ? '🌐 ⛈ A storm is rolling in' : `🌐 The weather is turning ${ w.name.toLowerCase() }`, 3200 );
			this.id = w.id;

		}

	}

}
