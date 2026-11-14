// Synthesised gunfire for Water Wars (the field-recording bank has no guns): filtered noise bursts
// with a low thump, routed into the soundscape's "near" bus so the master volume and mute apply.
// Quietly does nothing until the soundscape has an AudioContext (after the first click).

const PRESETS = {
	rifle: { len: 0.32, hp: 900, lp: 7000, gain: 0.55, thump: 120, thumpGain: 0.5, decay: 0.07 },
	mg: { len: 0.18, hp: 700, lp: 6000, gain: 0.4, thump: 95, thumpGain: 0.45, decay: 0.045 },
	cannon: { len: 1.6, hp: 40, lp: 1100, gain: 1.0, thump: 55, thumpGain: 1.0, decay: 0.35 },
	explosion: { len: 2.2, hp: 30, lp: 900, gain: 1.0, thump: 42, thumpGain: 1.0, decay: 0.55 },
	hit: { len: 0.25, hp: 300, lp: 3000, gain: 0.5, thump: 180, thumpGain: 0.6, decay: 0.06 },
	clank: { len: 0.3, hp: 1800, lp: 9000, gain: 0.35, thump: 900, thumpGain: 0.25, decay: 0.08 },
};

export class CombatSFX {

	constructor( app ) {

		this.app = app;
		this.noise = null;
		this._n = 0;
		this._t = 0;

	}

	get ctx() {

		const a = this.app.audio;
		return a && a.ctx && a.near && ! a.muted ? a.ctx : null;

	}

	_noise( ctx ) {

		if ( this.noise && this.noise.sampleRate === ctx.sampleRate ) return this.noise;
		const n = Math.floor( ctx.sampleRate * 2.5 );
		const b = ctx.createBuffer( 1, n, ctx.sampleRate );
		const d = b.getChannelData( 0 );
		let last = 0;
		for ( let i = 0; i < n; i ++ ) {

			const w = Math.random() * 2 - 1;
			last = last * 0.6 + w * 0.4; // a little pinker
			d[ i ] = last * 1.6;

		}

		this.noise = b;
		return b;

	}

	// kind: rifle | mg | cannon | explosion | hit | clank; pos (world) for distance attenuation
	shot( pos, kind = 'rifle', volume = 1 ) {

		const ctx = this.ctx;
		if ( ! ctx ) return;
		const P = PRESETS[ kind ] || PRESETS.rifle;
		const cam = this.app.camera.position;
		const d = pos ? Math.hypot( pos.x - cam.x, pos.y - cam.y, pos.z - cam.z ) : 0;
		const att = 1 / ( 1 + d / ( kind === 'cannon' || kind === 'explosion' ? 90 : 35 ) );
		if ( att < 0.02 ) return;
		// voice limit: at most ~24 shots a second get through
		const now = ctx.currentTime;
		if ( now - this._t > 0.05 ) {

			this._t = now;
			this._n = 0;

		}

		if ( ++ this._n > ( kind === 'mg' ? 2 : 4 ) ) return;

		const out = this.app.audio.near;
		const g = ctx.createGain();
		const vol = P.gain * att * volume * ( 0.85 + Math.random() * 0.3 );
		g.gain.setValueAtTime( vol, now );
		g.gain.exponentialRampToValueAtTime( Math.max( 1e-4, vol * 0.25 ), now + P.decay );
		g.gain.exponentialRampToValueAtTime( 1e-4, now + P.len );
		// far shots lose their crack
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = P.lp * ( 0.35 + 0.65 * att );
		const hp = ctx.createBiquadFilter();
		hp.type = 'highpass';
		hp.frequency.value = P.hp;
		const src = ctx.createBufferSource();
		src.buffer = this._noise( ctx );
		src.playbackRate.value = 0.9 + Math.random() * 0.2;
		src.connect( hp ).connect( lp ).connect( g ).connect( out );
		src.start( now, Math.random() * 0.5, P.len + 0.05 );

		// the body: a quickly falling sine
		const o = ctx.createOscillator();
		const og = ctx.createGain();
		o.type = 'sine';
		o.frequency.setValueAtTime( P.thump * 2.2, now );
		o.frequency.exponentialRampToValueAtTime( P.thump * 0.5, now + P.len * 0.6 );
		const tv = P.thumpGain * att * volume;
		og.gain.setValueAtTime( tv, now );
		og.gain.exponentialRampToValueAtTime( 1e-4, now + P.len * 0.7 );
		o.connect( og ).connect( out );
		o.start( now );
		o.stop( now + P.len );

	}

}
