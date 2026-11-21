// The loading bar's plan (Water Wars 1.24.2): how much of the bar each loading stage gets.
//
// The stages take very different times on different machines: on a desktop compiling the shaders is most
// of the wait; on an iPhone that stage is quick and the first frames ("warming up", where its browser does
// the real compiling) take a minute. So each stage's share of the bar is its expected time, from how long it
// took on this device last time (kept in this browser, per mode; blended with the time before), or a typical
// time for a desktop or a phone the first time. Within a stage the bar follows real counts where there are
// some (pipelines compiled, frames warmed), else the time spent against the time expected, and it never
// reaches the stage's end until the stage is done: the percentage means "this much of the expected wait".

export const STAGES = [ 'webgpu', 'atmosphere', 'island', 'village', 'planting', 'swell', 'reef', 'ocean', 'prep', 'compile', 'warmup1', 'warmup2' ];

// typical seconds per stage, for a first load
export const TYPICAL = {
	desktop: { webgpu: 0.4, atmosphere: 1.5, island: 2, village: 1, planting: 2, swell: 1, reef: 1.5, ocean: 2, prep: 1.5, compile: 25, warmup1: 2, warmup2: 1 },
	mobile: { webgpu: 0.6, atmosphere: 2, island: 3, village: 2, planting: 3, swell: 2, reef: 2, ocean: 3, prep: 2, compile: 8, warmup1: 60, warmup2: 20 },
};

export const LOAD_TIMES_KEY = 'waterwars.loadTimes.v1';

export class LoadPlan {

	constructor( mode = 'desktop', storage = null, now = () => ( typeof performance !== 'undefined' ? performance.now() : Date.now() ) ) {

		this.mode = mode === 'mobile' ? 'mobile' : 'desktop';
		this.storage = storage;
		this.now = now;
		this.expect = { ...TYPICAL[ this.mode ] };
		try {

			const all = JSON.parse( ( storage && storage.getItem( LOAD_TIMES_KEY ) ) || '{}' );
			const mine = all && all[ this.mode ];
			if ( mine && typeof mine === 'object' ) for ( const s of STAGES ) if ( Number.isFinite( mine[ s ] ) && mine[ s ] > 0 ) this.expect[ s ] = mine[ s ];

		} catch ( e ) { /* the typical times */ }

		this.total = STAGES.reduce( ( a, s ) => a + this.expect[ s ], 0 );
		this.took = {};
		this.stage = null;
		this.t = 0;

	}

	// a stage starts: where it starts on the bar (p), where it ends (until), its expected milliseconds
	begin( stage ) {

		const t = this.now();
		if ( this.stage ) this.took[ this.stage ] = ( this.took[ this.stage ] || 0 ) + ( t - this.t ) / 1000;
		this.stage = stage;
		this.t = t;
		let before = 0;
		for ( const s of STAGES ) {

			if ( s === stage ) break;
			before += this.expect[ s ];

		}

		const share = this.expect[ stage ] || 0;
		return { p: before / this.total, until: Math.min( 0.995, ( before + share ) / this.total ), ms: share * 1000 };

	}

	// loading is done: keep how long each stage took (blended half and half with what was kept before)
	finish() {

		if ( this.stage ) this.took[ this.stage ] = ( this.took[ this.stage ] || 0 ) + ( this.now() - this.t ) / 1000;
		this.stage = null;
		try {

			if ( ! this.storage ) return;
			const all = JSON.parse( this.storage.getItem( LOAD_TIMES_KEY ) || '{}' ) || {};
			const prev = all[ this.mode ] || {};
			const next = {};
			for ( const s of STAGES ) {

				const t = this.took[ s ];
				if ( ! ( t > 0 ) ) {

					if ( Number.isFinite( prev[ s ] ) ) next[ s ] = prev[ s ];
					continue;

				}

				next[ s ] = + ( Number.isFinite( prev[ s ] ) ? ( prev[ s ] + t ) / 2 : t ).toFixed( 2 );

			}

			all[ this.mode ] = next;
			this.storage.setItem( LOAD_TIMES_KEY, JSON.stringify( all ) );

		} catch ( e ) { /* not kept */ }

	}

}
