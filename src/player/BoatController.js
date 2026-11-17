import * as THREE from '../engine/index.js';
import { WORLD } from '../world/WorldLayout.js';

const RHO = 1025; // sea water density
const GRAV = 9.81;
const DEG = Math.PI / 180;

const sstep = THREE.MathUtils.smoothstep;
const clamp = THREE.MathUtils.clamp;

// scratch (the integrator runs at 120 Hz: no allocations in the loop)
const _F = new THREE.Vector3();
const _T = new THREE.Vector3();
const _com = new THREE.Vector3();
const _p = new THREE.Vector3();
const _r = new THREE.Vector3();
const _f = new THREE.Vector3();
const _vp = new THREE.Vector3();
const _vl = new THREE.Vector3();
const _a = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3();
const _v = new THREE.Vector3();
const _rud = new THREE.Vector3();
const _g = new THREE.Vector3();
const _t = new THREE.Vector3();
const _c1 = new THREE.Vector3();
const _c2 = new THREE.Vector3();
const _c3 = new THREE.Vector3();
const _c4 = new THREE.Vector3();
const _c5 = new THREE.Vector3();
const _invQ = new THREE.Quaternion();
const RESERVE = 0.3; // m above a hull sample's design waterline where the reserve buoyancy starts (1.18)
const WAVE_FOLLOW = 1; // how much of the wave slope the stabiliser rights toward (0: dead level, as before 1.18)
const _n = new THREE.Vector3();
const _wo = new THREE.Vector3();
const _euler = new THREE.Euler();
const _dq = new THREE.Quaternion();

// Rigid-body model of an 8.2 m, 3.2 t Downeast lobster boat (semi-displacement hull, full keel).
//
// Hydrostatics come from the hull model's buoyancy samples (waterplane patches, water heights
// queried on the GPU). The samples are laid out as a slightly narrower / shorter "effective"
// waterplane so the boat has a lobster boat's feel rather than the stiffness of the bare canoe
// body: GM ~0.6 m, roll ~3.3 s, pitch ~1.8 s, heave ~1.25 s, all well damped. Added mass and
// inertia (heave, pitch, sway...) scale with how much of the hull is in the water.
//
// Manoeuvring: calm-water resistance curve with the wave-making hump past hull speed; propeller
// thrust from a spooling engine (falls off towards the pitch speed); rudder as a lifting surface
// in the propeller race; hull lift and cross-flow drag along the keel (directional stability, the
// turning circle, speed lost in turns, outward heel); running trim and rise with speed (the bow
// lifts over the hump, then runs at a few degrees); prop walk astern. Grounding, pier piles and
// mooring lines as before.
export class BoatController {

	constructor( { model, query, terrain, colliders } ) {

		this.model = model;
		this.query = query;
		this.terrain = terrain;
		this.colliders = colliders;

		const hydro = model.hydro || {};
		this.mass = hydro.suggestedMass || 3200;
		this.com = hydro.centerOfMass ? new THREE.Vector3().copy( hydro.centerOfMass ) : new THREE.Vector3( 0, 0.3, - 0.74 );
		// principal inertia in the boat frame (+Z forward, +X port): x = pitch, y = yaw, z = roll. Gear
		// high on deck (traps, hauler, wheelhouse) gives a larger roll radius than the bare hull.
		this.inertia = hydro.inertia ? hydro.inertia.clone() : new THREE.Vector3( 14600, 15700, 3500 );
		this.inertia.z *= 1.24;
		// added mass / inertia when fully wet (fraction of the rigid-body value): surge, sway, heave;
		// pitch, yaw, roll
		this.addedMass = new THREE.Vector3( 0.6, 0.7, 0.05 ); // x (sway), y (heave), z (surge)
		this.addedInertia = new THREE.Vector3( 1.0, 0.4, 0.2 ); // x (pitch), y (yaw), z (roll)

		// effective waterplane: lateral / longitudinal lever arms of the buoyancy samples
		const cbz = hydro.centerOfBuoyancy ? hydro.centerOfBuoyancy.z : this.com.z;
		const sx = 0.79, sz = 0.9;
		this.samples = model.hullSamples.map( ( s ) => ( {
			p: new THREE.Vector3( s.position.x * sx, s.position.y, cbz + ( s.position.z - cbz ) * sz ),
			area: s.area, bottom: s.bottomY ?? s.position.y,
		} ) );
		// (the lobster hull's own layout, for setHull to stretch over a bought boat's hull)
		this._cbz = cbz;
		this._base = this.samples.map( ( s ) => s.p.clone() );
		this._baseInertia = this.inertia.clone();
		this.hullK = { length: 1, beam: 1 };
		this.subCap = 1.6; // m: how deep under water a sample's buoyancy keeps growing (the hull's freeboard)
		let pitchK = 0;
		for ( const s of this.samples ) pitchK += s.area * ( s.p.z - cbz ) ** 2;
		this.pitchStiffness = RHO * GRAV * pitchK; // N m / rad (for the running-trim moment)
		this.slot = query.allocate( 'boatHull', this.samples.length );

		// lateral stations along the keel: (z, lateral area m^2) for hull lift and cross-flow drag
		this.stations = [ [ - 3.4, 0.73 ], [ - 2.3, 0.78 ], [ - 1.2, 0.8 ], [ - 0.1, 0.77 ], [ 1.0, 0.62 ], [ 2.1, 0.33 ], [ 3.2, 0.14 ] ];
		this.lateralY = 0.06; // height of the centre of lateral resistance (boat frame)
		this.bank = 0; // roll moment per (u * drift velocity): hull bottom lift banking into turns
		this.hullLift = 0.5; // lift coefficient of the hull + keel per radian of drift
		this.rudderLift = 2.8; // rudder lift slope (x area 0.12 m^2), includes the hull's flap effect
		// Water Wars 1.13.5: per-boat handling (BoatCatalog `handling`, set by Combat.setSkin; null = this
		// hull as tuned). waveSmooth: 0..1 of each sample's difference from the mean water height ignored (a
		// long hull spans the waves); heaveLag: s, the mean followed with this lag; stab / right: roll and
		// pitch damping / righting of the stabiliser x; mass / yaw: x effective mass in surge and sway / yaw
		// inertia (slower to speed up, stop and turn, without changing how it floats); lever / wheel / spool:
		// x how fast the throttle lever and wheel move / x the engine's spool time
		this.handling = null;
		this.netDrag = 0; // N per (m/s)^2: a trawl net in the water (src/game/Trawl.js)
		this.towDir = null; // world direction the net's warps pull the stern (null: straight astern)
		this.towZ = - 3.4; // boat-local z of the stern where the warps are made fast
		this.towLever = 0.2; // how much of the stern's lever arm the pull keeps (1: all of it, as up to 1.16.0)
		// where this boat is moored at the harbour (a wide boat lies further out from the pier: Combat.setSkin)
		this.berth = { position: WORLD.boatDock.position.clone(), heading: WORLD.boatDock.heading };
		this._meanH = null;

		// state (position = model origin at the design waterline)
		this.position = new THREE.Vector3().copy( WORLD.boatDock.position );
		this.quaternion = new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 0, 1, 0 ), WORLD.boatDock.heading );
		this.velocity = new THREE.Vector3();
		this.angular = new THREE.Vector3();

		this.throttle = 0; // lever -1..1 (moves with some inertia)
		this.steer = 0; // wheel -1..1
		this.rpm = 0; // engine 0..1 (spools after the lever)
		this.maxThrust = 26000; // N, bollard pull at full rpm
		this.pitchSpeed = 16; // m/s, propeller pitch speed at full rpm (thrust -> 0 there)
		this.reverseFactor = 0.45; // astern thrust relative to ahead
		this.driven = false;
		this.moored = true;
		this.mooring = { anchor: WORLD.boatDock.position.clone(), heading: WORLD.boatDock.heading };

		const n = this.samples.length;
		this.waterH = new Float32Array( n ); // latest read-back
		this.waterV = new Float32Array( n ); // vertical velocity of the water (m/s)
		this.waterOff = new Float32Array( n ); // blends the step when a new read-back arrives
		this.hEff = new Float32Array( n ); // water height used by the integrator (interpolated)
		this.qx = new Float32Array( n ); // query point + slope of the last result
		this.qz = new Float32Array( n );
		this.gx = new Float32Array( n );
		this.gz = new Float32Array( n );
		this.hasWater = false;
		this.wetFraction = 0;
		this.speed = 0;
		this.forwardSpeed = 0;
		this.thrust = 0;
		this.slam = 0;
		this.onSlam = null;
		this._acc = 0;
		this._age = 0; // s since the latest read-back was issued

		this.bowWorld = new THREE.Vector3();
		this.sternWorld = new THREE.Vector3();

		// Water Wars 1.16: the visual boat. The physics body above floats on the waves (buoyancy pitches and
		// rolls it with the swell) and its thrust always pushes along its own keel. On top of that pose the
		// model the player sees gets its own motion, visual only, on spring-dampers so it feels heavy: the bow
		// rises as the boat accelerates (easing back to a little running trim at speed) and dips as it slows,
		// the boat banks into turns (steering x forward speed), and it bobs gently when idle. The model, the
		// guns, the deck you walk on and the helm camera all follow this visual pose; the physics never does.
		this.visualQuaternion = new THREE.Quaternion();
		this.visualPosition = new THREE.Vector3();
		this.visualLength = 8.2; // m: the hull in use (Combat.setSkin): long hulls tilt and bob less
		this.vis = { pitch: 0, pitchV: 0, roll: 0, rollV: 0, heave: 0, heaveV: 0, acc: 0, uPrev: 0, t: Math.random() * 100, bobP: 0, bobR: 0, bobH: 0 };

		this.apply();

	}

	// world position of a local point
	toWorld( local, out ) {

		return out.copy( local ).applyQuaternion( this.quaternion ).add( this.position );

	}

	forward( out ) {

		return out.set( 0, 0, 1 ).applyQuaternion( this.quaternion );

	}

	setInput( throttle, steer, dt ) {

		// the throttle lever moves with some inertia (the engine then spools after it); the rudder
		// follows the wheel
		this.throttleTarget = throttle;
		const H = this.handling;
		this.throttle += ( throttle - this.throttle ) * ( 1 - Math.exp( - dt * 2.2 * ( H && H.lever || 1 ) ) );
		// Water Wars 1.15.2: the wheel comes back to the middle quickly when you let go of it (or swing it the
		// other way): it used to drift back over ~2.5 s, and at speed that leftover rudder kept turning the boat
		// long after you let go (a 0.5 s tap on the WaveCutter at 58 kn turned her 43 degrees), so every small
		// correction overshot and she never held a straight line
		const back = steer === 0 || Math.sign( steer ) !== Math.sign( this.steer );
		this.steer += ( steer - this.steer ) * ( 1 - Math.exp( - dt * ( back ? 6 : 1.6 ) * ( H && H.wheel || 1 ) ) );
		if ( steer === 0 && Math.abs( this.steer ) < 0.002 ) this.steer = 0;

	}

	// Queue this frame's water height queries at the hull sample positions. The results arrive
	// q.latency seconds later, so ask where the samples will be by then (at speed the hull moves
	// ~0.5 m in that time).
	queueQueries() {

		const q = this.query;
		const lead = q.latency;
		for ( let i = 0; i < this.samples.length; i ++ ) {

			this.toWorld( this.samples[ i ].p, _v ).addScaledVector( this.velocity, lead );
			q.setPoint( this.slot + i, _v.x, _v.z );

		}

	}

	// New read-backs arrive every 1-3 frames. The vertical velocity of the water under each sample is
	// the local rate of the surface, dh/dt at a fixed point: the height change between consecutive
	// results, minus the part caused by the sample moving across the slope (at speed a wave face would
	// otherwise read as fast-rising water and launch the hull), over the time between the results.
	// Between read-backs the heights are extrapolated with that rate, and the small jump when a new
	// result lands is blended out, so the hull is never kicked by a step in the forcing.
	readQueries() {

		const q = this.query;
		if ( ! q.cpuValid || q.version === this._qVersion ) return;
		const dt = q.resultTime - ( this._qTime ?? q.resultTime );
		this._qVersion = q.version;
		this._qTime = q.resultTime;
		const c = q.cpu, pts = q.resultInputs;
		for ( let i = 0; i < this.samples.length; i ++ ) {

			const k = ( this.slot + i ) * 4;
			// never let a bad GPU sample into the integrator (keep the last good value)
			let h = c[ k ];
			if ( ! Number.isFinite( h ) ) h = this.hasWater ? this.waterH[ i ] : 0;
			const nx = Number.isFinite( c[ k + 1 ] ) ? c[ k + 1 ] : 0, nz = Number.isFinite( c[ k + 2 ] ) ? c[ k + 2 ] : 0;
			const ny = Math.sqrt( Math.max( 1 - nx * nx - nz * nz, 0.05 ) );
			const gx = - nx / ny, gz = - nz / ny; // surface slope dh/dx, dh/dz
			let w = 0;
			if ( this.hasWater && dt > 1e-4 ) {

				const dx = pts[ k ] - this.qx[ i ], dz = pts[ k + 1 ] - this.qz[ i ];
				w = ( h - this.waterH[ i ] - 0.5 * ( ( gx + this.gx[ i ] ) * dx + ( gz + this.gz[ i ] ) * dz ) ) / dt;

			}

			if ( this.hasWater ) this.waterOff[ i ] = this.hEff[ i ] - h; // where the interpolation was
			else this.waterOff[ i ] = 0;
			this.waterV[ i ] += ( clamp( w, - 3, 3 ) - this.waterV[ i ] ) * 0.5;
			this.waterH[ i ] = h;
			this.hEff[ i ] = h + this.waterOff[ i ];
			this.qx[ i ] = pts[ k ];
			this.qz[ i ] = pts[ k + 1 ];
			this.gx[ i ] = gx;
			this.gz[ i ] = gz;

		}

		this._age = 0;
		this.hasWater = true;

	}

	update( dt ) {

		this.readQueries();
		if ( ! this.hasWater ) {

			this.updateVisual( dt );
			this.apply();
			return;

		}

		// engine: spools up after the lever (~0.9 s), a little slower down; idles while driven
		const lever = this.driven ? Math.abs( this.throttle ) : 0;
		const target = Math.max( lever, this.driven ? 0.15 : 0 );
		const tau = ( target > this.rpm ? 0.9 : 1.3 ) * ( this.handling && this.handling.spool || 1 );
		this.rpm += ( target - this.rpm ) * ( 1 - Math.exp( - Math.min( dt, 0.1 ) / tau ) );

		const h = 1 / 120;
		this._acc += Math.min( dt, 0.1 );
		let steps = 0;
		while ( this._acc >= h && steps < 12 ) {

			this.step( h );
			this.limitTilt();
			this.limitSpeed();
			this._acc -= h;
			steps ++;

		}

		if ( ! this.isFinite() ) this.reset();

		this.model.setThrottle( this.throttle );
		this.model.setSteering( this.steer );
		this.model.setPropellerRPM( this.rpm * 2400 * Math.sign( this.throttle || 1 ) );
		this.updateVisual( dt );
		this.apply();

	}

	step( h ) {

		const m = this.mass;
		const F = _F.set( 0, - m * GRAV, 0 );
		const T = _T.set( 0, 0, 0 ); // torque about COM (world)
		const comW = this.toWorld( this.com, _com );
		const invQ = _invQ.copy( this.quaternion ).invert();

		const addForceAt = ( f, pw ) => {

			F.add( f );
			T.add( _r.copy( pw ).sub( comW ).cross( f ) );

		};

		// water heights at the samples: latest read-back, extrapolated with the water's vertical
		// velocity (up to ~0.12 s), step blended out over ~0.06 s
		this._age = Math.min( this._age + h, 0.12 );
		const blend = Math.exp( - h / 0.06 );

		// the water under each sample (hEff: as read back, carried on between read-backs)
		const H = this.handling, smooth = H && H.waveSmooth ? H.waveSmooth : 0;
		const ns = this.samples.length;
		let mean = 0, areaSum = 0;
		for ( let i = 0; i < ns; i ++ ) {

			this.waterOff[ i ] *= blend;
			this.hEff[ i ] = this.waterH[ i ] + this.waterV[ i ] * this._age + this.waterOff[ i ];
			mean += this.hEff[ i ] * this.samples[ i ].area;
			areaSum += this.samples[ i ].area;

		}

		// a long, heavy hull (handling.waveSmooth) spans the waves: it feels their mean, followed with a
		// little lag, and only part of the slope under it, so it neither bobs nor rocks like a small boat
		mean = areaSum > 0 ? mean / areaSum : 0;
		if ( smooth > 0 ) {

			if ( this._meanH === null || ! Number.isFinite( this._meanH ) ) this._meanH = mean;
			this._meanH += ( mean - this._meanH ) * ( 1 - Math.exp( - h / Math.max( 0.01, H.heaveLag || 0.01 ) ) );

		} else this._meanH = null;

		// ---- buoyancy + vertical damping per hull sample
		let wetArea = 0, totalArea = 0, immersion = 0;
		for ( let i = 0; i < ns; i ++ ) {

			const s = this.samples[ i ];
			const hw = smooth > 0 ? this._meanH + ( this.hEff[ i ] - mean ) * ( 1 - smooth ) : this.hEff[ i ];
			const pw = this.toWorld( s.p, _p );
			const depth = hw - pw.y;
			totalArea += s.area;
			if ( depth <= 0 ) continue;
			const sub = Math.min( depth, this.subCap );
			const wet = Math.min( 1, depth / 0.3 );
			wetArea += s.area * wet;
			immersion += s.area * Math.min( sub / Math.max( - s.p.y, 0.05 ), 1.5 );
			// buoyancy + heave damping against the water's own vertical motion, along world up (in the
			// boat frame a trimmed hull would turn forward speed into an upward push)
			_vp.copy( this.angular ).cross( _r.copy( pw ).sub( comW ) ).add( this.velocity );
			const vy = _vp.y - this.waterV[ i ] * 0.6 * ( 1 - smooth );
			const wetK = Math.min( 1, sub / 0.25 ) * s.area;
			// (1.18: reserve buoyancy. Past RESERVE m above its own waterline the flared topsides go in too: the
			// push grows three times as fast, so a hull buried by a crest comes back up before the deck goes under)
			const over = Math.max( 0, Math.min( depth, this.subCap * 1.5 ) - ( - s.p.y + RESERVE ) );
			_f.set( 0, RHO * GRAV * s.area * ( sub + 5 * over ) - ( 1800 * vy + 900 * vy * Math.abs( vy ) ) * wetK, 0 );
			addForceAt( _f, pw );

		}

		const wet = this.wetFraction = totalArea > 0 ? wetArea / totalArea : 0;
		// how deep the hull sits relative to its design draft (lift fades as it rises out)
		const imm = totalArea > 0 ? clamp( immersion / totalArea, 0, 1 ) : 0;
		const wetD = Math.min( 1, wet * 1.6 ); // hydrodynamic forces: most of the hull in the water
		const fwd = this.forward( _fwd );
		const side = _side.set( 1, 0, 0 ).applyQuaternion( this.quaternion ); // port
		const up = _up.set( 0, 1, 0 ).applyQuaternion( this.quaternion );
		_vl.copy( this.velocity ).applyQuaternion( invQ ); // boat frame: x port, z forward
		const u = _vl.z, vs = _vl.x;
		this.speed = this.velocity.length();
		this.forwardSpeed = u;
		const aLoc = _a.copy( this.angular ).applyQuaternion( invQ ); // x pitch, y yaw, z roll rates

		// ---- calm-water resistance (friction + the wave-making hump past hull speed + planing)
		const au = Math.abs( u );
		const R = ( 40 * au + 22 * au * au + 3000 * sstep( au, 2.8, 5.4 ) + 55 * au * au * sstep( au, 7, 11 ) ) * wetD;
		// (1.16: through the centre of mass: drag slows the boat without pitching its bow down; the visual boat
		// does the pitching, BoatController.updateVisual)
		_p.set( 0, this.com.y, this.com.z );
		this.toWorld( _p, _p );
		addForceAt( _f.copy( fwd ).multiplyScalar( - R * Math.sign( u ) ), _p );
		// ---- a trawl net astern (Water Wars 1.13.6): its drag pulls the stern along the warps (straight
		// astern on a straight course, at an angle after a turn), at the height of the centre of mass
		//
		// 1.15.1: a tow line only resists the stern moving AWAY from the net, by that speed alone. (It used
		// to pull toward the net by the boat's whole speed squared, whichever way the boat moved: going
		// astern, coming round in a turn or after a U-turn the boat moved toward the net, so the pull sped
		// it up, which pulled harder... in seconds the speed ran away to NaN and the boat was reset to its
		// berth every frame: the "lost thrust, then the game froze".) Never more than would stop that motion
		// in this step, nor more than the engine can push; the lever arm stays on the hull the physics has.
		if ( this.netDrag > 0 ) {

			if ( this.towDir ) _f.copy( this.towDir ).setY( 0 );
			else _f.copy( fwd ).setY( 0 ).negate();
			if ( _f.lengthSq() > 1e-8 ) {

				_f.normalize(); // toward the net
				const away = - ( this.velocity.x * _f.x + this.velocity.z * _f.z );
				if ( away > 0 ) {

					const pull = Math.min( this.netDrag * away * away, m * away / h * 0.5, this.maxThrust * 1.5 );
					// (1.16.1: most of the pull goes through the middle of the hull, only towLever of it at the stern:
					// a net astern no longer drags the stern back into line and fights every turn)
					const sternZ = Math.max( - 4.2, Math.min( 0, this.towZ ) );
					_p.set( 0, this.com.y, this.com.z + ( sternZ - this.com.z ) * this.towLever );
					this.toWorld( _p, _p );
					addForceAt( _f.multiplyScalar( pull ), _p );

				}

			}

		}

		// air drag on hull + house (Cd ~0.9, ~6 m^2 frontal area)
		F.addScaledVector( this.velocity, - 3.3 * this.speed );

		// ---- lateral hydrodynamics along the keel: hull lift ~ u * v and cross-flow drag ~ v|v| at
		// each station (v includes the yaw rate): directional stability, the turning circle, speed
		// lost to the drift angle in turns and the outward heel (lateral resistance below the COM)
		let induced = 0;
		for ( const [ sz, A ] of this.stations ) {

			const dz = sz - this.com.z;
			// lateral velocity at the station: drift + yaw rate (about +Y) + roll rate (about +Z, the
			// keel swinging sideways below the COM)
			const vk = vs + aLoc.y * dz - aLoc.z * ( this.lateralY - this.com.y );
			const Y = - 0.5 * RHO * A * ( this.hullLift * au * vk + 1.1 * vk * Math.abs( vk ) ) * wetD;
			induced += Y * vk;
			// (1.16: at the height of the centre of mass: the keel's side force turns the boat without heeling
			// it outward; the visual boat banks into the turn instead)
			_p.set( 0, this.com.y, sz );
			this.toWorld( _p, _p );
			addForceAt( _f.copy( side ).multiplyScalar( Y ), _p );

		}

		// the drift angle also banks the hull into the turn (bottom pressure on the outer side),
		// leaving only a slight outward heel
		T.addScaledVector( fwd, this.bank * au * vs * wetD );

		// ---- propeller: thrust from the engine rpm, falling off towards the pitch speed; prop walk
		// astern (stern to port)
		const propW = this.toWorld( this.model.propeller, _p );
		const propSub = this.sampleWaterAt( propW ) - propW.y;
		const propWet = clamp( propSub / 0.3 + 0.5, 0, 1 );
		const dir = this.driven ? Math.sign( this.throttle ) : 0;
		const n = this.rpm * ( this.driven && Math.abs( this.throttle ) > 0.02 ? 1 : 0 );
		let thrust = 0;
		if ( dir > 0 ) thrust = this.maxThrust * n * n * Math.max( 0, 1 - Math.max( u, 0 ) / ( this.pitchSpeed * Math.max( n, 0.2 ) ) );
		else if ( dir < 0 ) thrust = - this.reverseFactor * this.maxThrust * n * n * Math.max( 0, 1 - Math.max( - u, 0 ) / ( this.pitchSpeed * 0.6 * Math.max( n, 0.2 ) ) );
		thrust *= propWet;
		this.thrust = thrust;
		// Water Wars: most of the push acts through the centre of mass; the low, aft propeller line would
		// otherwise lever the bow up harder with every engine upgrade
		F.addScaledVector( fwd, thrust * 0.85 );
		addForceAt( _f.copy( fwd ).multiplyScalar( thrust * 0.15 ), propW );
		if ( thrust < 0 ) addForceAt( _f.copy( side ).multiplyScalar( - thrust * 0.08 ), propW );

		// ---- rudder: lifting surface in the propeller race (actuator-disc slipstream); the local
		// flow angle at the stern (drift + yaw) reduces its angle of attack
		// the rudder's side force is partly carried by the aft hull (flap effect), so it acts higher
		// than the blade's centre: less heel kick when the wheel goes over
		const rudW = this.toWorld( _rud.set( 0, this.com.y, this.model.rudder.z ), _rud ); // (1.16: no heel from the rudder either)
		const race = Math.max( thrust, 0 ) * 2 / ( RHO * 0.14 ); // slipstream dynamic pressure term (m^2/s^2)
		const Ur2 = u * Math.abs( u ) + 0.9 * race;
		const Ur = Math.sqrt( Math.abs( Ur2 ) ) * Math.sign( Ur2 );
		const vRud = vs + aLoc.y * ( this.model.rudder.z - this.com.z );
		// (1.15.2: speed-sensitive steering. The rudder's bite grows with the square of the speed, so at speed
		// the same wheel turns the boat much harder: past 10 m/s, about 19 kn, the wheel puts on less rudder,
		// as a fast boat's helmsman would. Slow boats steer as before)
		const wheelGain = 1 / Math.max( 1, Math.abs( u ) / 10 );
		const delta = this.steer * 0.6 * wheelGain + ( Math.abs( Ur ) > 0.3 ? Math.atan2( vRud, Math.abs( Ur ) ) * Math.sign( Ur ) : 0 );
		const d = clamp( delta, - 0.7, 0.7 );
		const lift = 0.5 * RHO * 0.12 * Math.abs( Ur2 ) * this.rudderLift * Math.sin( d ) * Math.cos( d ) * propWet * Math.sign( Ur2 || 1 );
		addForceAt( _f.copy( side ).multiplyScalar( - lift ), rudW );
		// rudder drag (induced + form) slows the boat in a turn
		addForceAt( _f.copy( fwd ).multiplyScalar( - Math.abs( lift * Math.sin( d ) ) * 0.8 * Math.sign( u || 1 ) ), rudW );

		// ---- running trim and rise: the bow lifts over the hump, then the hull runs at a few degrees
		// with some dynamic lift (only while the hull is in the water)
		// (1.16: the bow-up running trim moment is gone from the physics: it tilted the body, and with it the
		// thrust, upward. The bow rise is now visual only: updateVisual)
		F.addScaledVector( up, m * GRAV * 0.08 * sstep( u, 3.5, 9 ) * imm );

		// ---- small extra angular damping (appendages, bilge), scaled by wetness
		const wd = 0.2 + wetD;
		// the keel's lift resists roll in proportion to speed (a boat underway rolls much less)
		// (1.18: scaled with the hull's pitch and roll inertia, setHull: a long hull is damped as well as a short one)
		const kL2 = this.hullK.length ** 2, kB2 = this.hullK.beam ** 2;
		_v.set( - aLoc.x * 25000 * kL2, - aLoc.y * 2000, - aLoc.z * ( 4500 + 900 * au ) * kB2 ).multiplyScalar( wd ).applyQuaternion( this.quaternion );
		T.add( _v );

		// ---- Water Wars stabiliser (gyro + ballast): a righting moment toward level that grows steeply
		// past ~20 degrees of heel or trim, plus pitch / roll damping, so the boat can't be flipped by
		// throttle, waves or a hard turn at speed. (The yaw is left alone: steering is unchanged.)
		//
		// 1.18: toward the WAVE SURFACE under the hull (the mean slope of the water at the hull samples), not
		// toward dead level: in a steep sea the boat rides up the face of a wave instead of being held flat
		// while the crest climbs over its bow. The rocking it damps is relative to the surface too.
		let sgx = 0, sgz = 0, sa = 0;
		for ( let i = 0; i < this.samples.length; i ++ ) {

			sgx += this.gx[ i ] * this.samples[ i ].area;
			sgz += this.gz[ i ] * this.samples[ i ].area;
			sa += this.samples[ i ].area;

		}

		const follow = clamp( 1 - smooth, 0, 1 ) * WAVE_FOLLOW;
		const wn = _n.set( - sgx / sa * follow, 1, - sgz / sa * follow ).normalize(); // the surface's normal
		if ( ! this._nPrev ) this._nPrev = wn.clone();
		_wo.copy( this._nPrev ).cross( wn ).divideScalar( h ); // the surface's rate of turn
		this._nPrev.copy( wn );
		const tilt = Math.acos( clamp( up.dot( wn ), - 1, 1 ) );
		const kRight = m * GRAV * ( 0.6 + 6 * sstep( tilt, 0.3, 1.0 ) ) * ( H && H.right || 1 );
		_v.copy( up ).cross( wn ); // the axis that rotates the deck back toward the surface
		const s = _v.length();
		if ( s > 1e-6 ) T.addScaledVector( _v, kRight * Math.min( 1, tilt ) / s );
		// (a yacht's fin / gyro stabilisers: handling.stab x the damping, so she settles instead of rocking)
		const stab = H && H.stab || 1;
		T.x -= ( this.angular.x - _wo.x ) * m * 1.2 * stab;
		T.z -= ( this.angular.z - _wo.z ) * m * 1.2 * stab;

		// ---- mooring lines when docked and not driven
		if ( this.moored && ! this.driven ) {

			const a = this.mooring.anchor;
			const k = 5500, c = 4200;
			const dx = a.x - this.position.x, dz = a.z - this.position.z;
			F.x += dx * k - this.velocity.x * c;
			F.z += dz * k - this.velocity.z * c;
			let dy = this.mooring.heading - this.getYaw();
			dy = Math.atan2( Math.sin( dy ), Math.cos( dy ) );
			T.y += dy * 60000 - this.angular.y * 30000;

		}

		// ---- grounding on terrain + contact with pier piles
		this.contacts( F, T, comW );

		// ---- integrate (semi-implicit Euler) with added mass / inertia in the boat frame
		const fl = _vl.copy( F ).applyQuaternion( invQ );
		const hm = H && H.mass || 1; // (a heavier boat in surge and sway only: it floats the same)
		fl.x /= m * ( 1 + this.addedMass.x * wetD ) * hm;
		fl.y /= m * ( 1 + this.addedMass.y * wetD );
		fl.z /= m * ( 1 + this.addedMass.z * wetD ) * hm;
		this.velocity.addScaledVector( fl.applyQuaternion( this.quaternion ), h );
		const tl = T.applyQuaternion( invQ );
		const I = this.inertia, ai = this.addedInertia;
		tl.set( tl.x / ( I.x * ( 1 + ai.x * wetD ) ), tl.y / ( I.y * ( 1 + ai.y * wetD ) * ( H && H.yaw || 1 ) ), tl.z / ( I.z * ( 1 + ai.z * wetD ) ) );
		this.angular.addScaledVector( tl.applyQuaternion( this.quaternion ), h );
		// integrate position of COM, then derive origin
		comW.addScaledVector( this.velocity, h );
		const w = this.angular;
		const angle = w.length() * h;
		if ( angle > 1e-8 ) {

			_dq.setFromAxisAngle( _v.copy( w ).normalize(), angle );
			this.quaternion.premultiply( _dq ).normalize();

		}

		// origin = com - R * comLocal
		this.position.copy( comW ).sub( _v.copy( this.com ).applyQuaternion( this.quaternion ) );

	}

	// Water Wars 1.15.1: a safety net under the integrator. No boat goes faster than MAX_SPEED (the WaveCutter
	// tops out near 34 m/s) or spins faster than MAX_SPIN: if a force ever runs away again, the boat is held
	// at the limit for a moment instead of the numbers blowing up to NaN (which reset it to its berth every
	// frame and froze the game).
	limitSpeed() {

		const MAX_SPEED = 60, MAX_SPIN = 4; // m/s, rad/s
		const v = this.velocity.length();
		if ( v > MAX_SPEED ) this.velocity.multiplyScalar( MAX_SPEED / v );
		const w = this.angular.length();
		if ( w > MAX_SPIN ) this.angular.multiplyScalar( MAX_SPIN / w );

	}

	isFinite() {

		const ok = ( v ) => Number.isFinite( v.x ) && Number.isFinite( v.y ) && Number.isFinite( v.z );
		return ok( this.position ) && ok( this.velocity ) && ok( this.angular ) && Number.isFinite( this.quaternion.w );

	}

	// Water Wars: the boat never flips. Heel and trim are held within MAX_TILT of level: past it the
	// orientation is turned back onto the limit (keeping the heading) and the roll / pitch rate that
	// would tip it further is removed.
	limitTilt() {

		const MAX_TILT = 0.55; // rad (~31 degrees)
		const up = _up.set( 0, 1, 0 ).applyQuaternion( this.quaternion );
		const tilt = Math.acos( clamp( up.y, - 1, 1 ) );
		if ( ! ( tilt > MAX_TILT ) ) return;
		// rotate the hull about the horizontal axis (up x worldUp) by the excess
		const axis = _v.set( - up.z, 0, up.x );
		const len = axis.length();
		if ( len < 1e-6 ) {

			// exactly upside down: back on the keel, same heading
			this.rightBoat( false );
			return;

		}

		axis.divideScalar( len );
		_dq.setFromAxisAngle( axis, tilt - MAX_TILT );
		// rotate about the centre of mass so the hull doesn't jump
		const comW = this.toWorld( this.com, _com );
		this.quaternion.premultiply( _dq ).normalize();
		const comW2 = this.toWorld( this.com, _c1 );
		this.position.add( _c2.copy( comW ).sub( comW2 ) );
		// remove the angular velocity that keeps tipping it over (the part about the tilt axis that
		// increases the tilt)
		const w = this.angular.dot( axis );
		if ( w < 0 ) this.angular.addScaledVector( axis, - w );

	}

	// Water Wars: put a capsized (or badly tilted) boat back upright where it is, at rest
	rightBoat( stop = true ) {

		const yaw = this.getYaw();
		this.quaternion.setFromAxisAngle( new THREE.Vector3( 0, 1, 0 ), Number.isFinite( yaw ) ? yaw : 0 );
		this.position.y = 0;
		this.angular.set( 0, 0, 0 );
		if ( stop ) {

			this.velocity.set( 0, 0, 0 );
			this.throttle = 0;
			this.rpm = 0;

		}

		this.apply();

	}

	// back to the berth, at rest (safety net if the integration ever blows up)
	reset() {

		this.position.copy( this.berth.position );
		this.quaternion.setFromAxisAngle( new THREE.Vector3( 0, 1, 0 ), this.berth.heading );
		this.velocity.set( 0, 0, 0 );
		this.angular.set( 0, 0, 0 );
		this.throttle = 0;
		this.steer = 0;
		this.rpm = 0;
		this.moored = true;
		this.mooring.anchor.copy( this.berth.position );
		this.mooring.heading = this.berth.heading;
		this._meanH = null;

	}

	getYaw() {

		const f = this.forward( _g );
		return Math.atan2( f.x, f.z );

	}

	sampleWaterAt( p ) {

		// nearest hull sample's water height (good enough for the prop / rudder)
		let best = 0, bd = Infinity;
		for ( let i = 0; i < this.samples.length; i ++ ) {

			this.toWorld( this.samples[ i ].p, _t );
			const d = ( _t.x - p.x ) ** 2 + ( _t.z - p.z ) ** 2;
			if ( d < bd ) { bd = d; best = this.hasWater ? this.hEff[ i ] : 0; }

		}

		return best;

	}

	contacts( F, T, comW ) {

		const pts = this.contactPoints || ( this.contactPoints = [
			new THREE.Vector3( 0, - 0.7, 3.2 ), new THREE.Vector3( 0, - 0.75, 0 ), new THREE.Vector3( 0, - 0.72, - 3.4 ),
			new THREE.Vector3( 1.1, - 0.4, 1.5 ), new THREE.Vector3( - 1.1, - 0.4, 1.5 ), new THREE.Vector3( 1.2, - 0.35, - 2.5 ), new THREE.Vector3( - 1.2, - 0.35, - 2.5 ),
			new THREE.Vector3( 0, 0.2, 4.2 ),
		] );
		const pw = _c1, vp = _c2, f = _c3, r = _c4;
		for ( const lp of pts ) {

			this.toWorld( lp, pw );
			const ground = this.terrain.heightAt( pw.x, pw.z );
			const pen = ground - pw.y;
			if ( pen > 0 ) {

				vp.copy( this.angular ).cross( r.copy( pw ).sub( comW ) ).add( this.velocity );
				const fn = pen * 400000 - Math.min( vp.y, 0 ) * 30000;
				f.set( - vp.x * 6000, Math.max( fn, 0 ), - vp.z * 6000 );
				F.add( f );
				T.add( r.copy( pw ).sub( comW ).cross( f ) );

			}

		}

		// pier piles and the dock's fender line: keep the hull outline out of vertical cylinders / solid boxes
		// near the waterline (the outline follows the boat in use: Combat.setSkin, Water Wars 1.12)
		if ( this.colliders ) {

			const outline = this.outline || ( this.outline = [
				new THREE.Vector3( 0, 0.3, 4.1 ), new THREE.Vector3( 1.2, 0.3, 2.0 ), new THREE.Vector3( - 1.2, 0.3, 2.0 ),
				new THREE.Vector3( 1.4, 0.3, - 1.0 ), new THREE.Vector3( - 1.4, 0.3, - 1.0 ), new THREE.Vector3( 1.2, 0.3, - 3.8 ), new THREE.Vector3( - 1.2, 0.3, - 3.8 ),
			] );
			const tmp = _c5;
			for ( const lp of outline ) {

				this.toWorld( lp, pw );
				tmp.copy( pw );
				tmp.y -= 0.9;
				if ( this.colliders.resolveCapsule( tmp, 0.25, 1.6, 0, true ) ) {

					vp.copy( this.angular ).cross( r.copy( pw ).sub( comW ) ).add( this.velocity );
					f.set( ( tmp.x - pw.x ) * 260000 - vp.x * 8000, 0, ( tmp.z - pw.z ) * 260000 - vp.z * 8000 );
					F.add( f );
					T.add( r.copy( pw ).sub( comW ).cross( f ) );

				}

			}

		}

	}

	// The visual boat's motion on top of the physics pose (see the constructor). Spring-dampers per channel
	// (about 0.4 Hz, damped: heavy, no snap), toward targets from the forward acceleration, the steering and
	// the speed, plus slow sine-wave bobbing that fades as the boat gets going.
	updateVisual( dt ) {

		const V = this.vis;
		dt = Math.min( Math.max( dt, 0 ), 0.1 );
		if ( dt <= 0 ) return this.composeVisual();
		const u = Number.isFinite( this.forwardSpeed ) ? this.forwardSpeed : 0;
		// forward acceleration, smoothed (the waves jiggle the speed a little every frame)
		const a = clamp( ( u - V.uPrev ) / dt, - 10, 10 );
		V.uPrev = u;
		V.acc += ( a - V.acc ) * ( 1 - Math.exp( - dt / 0.35 ) );
		// big hulls (the 40 m superyacht) move less; heavier handling springs slower
		const size = clamp( 10 / this.visualLength, 0.3, 1.2 );
		const heavy = this.handling && this.handling.mass || 1;
		const au = Math.abs( u );
		// 1. bow rise: up with the acceleration (dip when slowing), easing back to a little running trim once
		// the boat stops gaining speed at the top
		const trim = 1.4 * DEG * sstep( au, 2, 12 );
		const pitchT = ( clamp( V.acc * 1.5, - 2.5, 6 ) * DEG + trim ) * size;
		// 2. banking: into the turn, by the steering times the forward speed (port helm, port side down)
		const rollT = clamp( this.steer * u * 0.75, - 11, 11 ) * DEG * size;
		// 3. idle bobbing: low, slow, out of step sine waves on pitch, roll and heave, fading at speed
		V.t += dt;
		const t = V.t, idle = ( 1 - 0.75 * sstep( au, 0.3, 6 ) ) * size;
		V.bobP = ( 0.5 * Math.sin( t * 0.71 ) + 0.25 * Math.sin( t * 1.37 + 1.3 ) ) * DEG * idle;
		V.bobR = ( 0.75 * Math.sin( t * 0.53 + 2.1 ) + 0.3 * Math.sin( t * 1.21 + 0.4 ) ) * DEG * idle;
		V.bobH = ( 0.04 * Math.sin( t * 0.87 + 0.7 ) + 0.018 * Math.sin( t * 1.63 + 2.6 ) ) * idle;
		// spring-dampers (semi-implicit): w rad/s, zeta 0.75
		const w = 2.6 / Math.sqrt( heavy ), z = 0.75;
		const spring = ( k, target ) => {

			V[ k + 'V' ] += ( w * w * ( target - V[ k ] ) - 2 * z * w * V[ k + 'V' ] ) * dt;
			V[ k ] += V[ k + 'V' ] * dt;

		};
		spring( 'pitch', pitchT );
		spring( 'roll', rollT );
		spring( 'heave', 0.025 * sstep( au, 3, 10 ) * size ); // (a touch of lift on the plane)
		this.composeVisual();

	}

	// visual pose = physics pose x the visual tilt about the hull's middle (at the waterline) + heave
	composeVisual() {

		const V = this.vis;
		if ( ! V ) {

			this.visualQuaternion.copy( this.quaternion );
			this.visualPosition.copy( this.position );
			return;

		}

		const pitch = V.pitch + V.bobP, roll = V.roll + V.bobR;
		// bow up = a negative turn about the boat's +X (+Z forward); port side down = a negative turn about +Z
		_dq.setFromEuler( _euler.set( - pitch, 0, - roll, 'XYZ' ) );
		this.visualQuaternion.copy( this.quaternion ).multiply( _dq );
		const pivot = _c5.set( 0, 0, this.com.z );
		// position: keep the pivot where the physics has it
		this.visualPosition.copy( pivot ).applyQuaternion( this.quaternion ).add( this.position );
		this.visualPosition.sub( _c4.copy( pivot ).applyQuaternion( this.visualQuaternion ) );
		this.visualPosition.y += V.heave + V.bobH;
		if ( ! Number.isFinite( this.visualPosition.x + this.visualPosition.y + this.visualPosition.z + this.visualQuaternion.w ) ) {

			this.vis = { pitch: 0, pitchV: 0, roll: 0, rollV: 0, heave: 0, heaveV: 0, acc: 0, uPrev: 0, t: 0, bobP: 0, bobR: 0, bobH: 0 };
			this.visualQuaternion.copy( this.quaternion );
			this.visualPosition.copy( this.position );

		}

	}

	// Water Wars 1.18: fit the buoyancy to the hull in use. Every boat floats on the lobster boat's 32 hull
	// samples, which spread over its 8 m waterplane: a 14-40 m bought boat's bow and stern hung out past them,
	// so in a big sea they dipped into crests the physics never felt and the model clipped under the water.
	// The samples now spread over the hull in use (same areas: the boat floats at the same draft), so it rises
	// and tilts with the waves along its whole length and beam; the pitch and roll inertia (and their damping)
	// grow with the spread so it doesn't snap about; and each sample's buoyancy keeps growing deeper, to the
	// taller hull's freeboard. hull: { length, beam } (m), or null for the lobster boat
	setHull( hull ) {

		const kL = hull && hull.length ? Math.max( 0.8, hull.length / 8.2 ) : 1;
		const kB = hull && hull.beam ? Math.max( 0.8, hull.beam / 3.0 ) : 1;
		this.hullK = { length: kL, beam: kB };
		const cbz = this._cbz;
		this.samples.forEach( ( s, i ) => {

			const b = this._base[ i ];
			s.p.set( b.x * kB, b.y, cbz + ( b.z - cbz ) * kL );

		} );
		this.inertia.set( this._baseInertia.x * kL * kL, this._baseInertia.y, this._baseInertia.z * kB * kB );
		this.subCap = 1.6 * Math.min( 2.5, Math.max( 1, Math.sqrt( kL ) ) );
		let pitchK = 0;
		for ( const s of this.samples ) pitchK += s.area * ( s.p.z - cbz ) ** 2;
		this.pitchStiffness = RHO * GRAV * pitchK;

	}

	// a point on the visual boat (the deck you walk on, the helm eye): local -> world
	toVisual( local, out ) {

		return out.copy( local ).applyQuaternion( this.visualQuaternion ).add( this.visualPosition );

	}

	apply() {

		const g = this.model.group;
		this.composeVisual();
		g.position.copy( this.visualPosition );
		g.quaternion.copy( this.visualQuaternion );
		g.updateMatrixWorld( true );
		this.toWorld( _v.set( 0, 0, 3.9 * this.hullK.length ), this.bowWorld );
		this.toWorld( _v.set( 0, 0, - 3.8 * this.hullK.length ), this.sternWorld );

	}

}
