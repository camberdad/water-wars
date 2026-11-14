import { Mesh, SphereGeometry, CylinderGeometry, BoxGeometry, Vector3, Quaternion } from '../../engine/index.js';
import { G } from '../../engine/render/Frame.js';
import { standard } from '../../materials/Materials.js';
import { SPRAY } from '../../fx/Spray.js';
import { LAYERS } from '../../core/SceneRenderer.js';

// Projectiles and the short-lived effects of a gunfight: tracers and cannon shells, muzzle flashes,
// fire, smoke puffs and flying splinters, plus water splashes through the ocean's spray particles.
// Everything is pooled (meshes created once, hidden when idle) so a fight allocates nothing and
// every pipeline is compiled behind the loading screen.

const _q = new Quaternion();
const _v = new Vector3();
const _d = new Vector3();
const UP = new Vector3( 0, 1, 0 );

function pool( scene, n, geo, mat, name ) {

	const list = [];
	for ( let i = 0; i < n; i ++ ) {

		const m = new Mesh( geo, mat );
		m.name = name;
		m.visible = false;
		m.castShadow = false;
		m.receiveShadow = false;
		m.frustumCulled = false;
		// blended puffs go in the late pass, over the water
		if ( mat.transparent ) m.layers.set( LAYERS.TRANSPARENT );
		scene.add( m );
		list.push( { mesh: m, live: false } );

	}

	return list;

}

function grab( list ) {

	let best = null;
	for ( const p of list ) {

		if ( ! p.live ) return p;
		if ( ! best || p.age / p.life > best.age / best.life ) best = p; // recycle the oldest

	}

	return best;

}

export class CombatFX {

	constructor( { scene, spray = null, terrain = null } ) {

		this.scene = scene;
		this.spray = spray;
		this.terrain = terrain;

		this.mats = {
			tracer: standard( { color: 0x000000, emissive: 0xffb45a, emissiveIntensity: 45, roughness: 1 } ),
			enemyTracer: standard( { color: 0x000000, emissive: 0xff5a3c, emissiveIntensity: 45, roughness: 1 } ),
			shell: standard( { color: 0x1a1612, emissive: 0xff8a3a, emissiveIntensity: 6, roughness: 0.4, metalness: 0.6 } ),
			flash: standard( { color: 0x000000, emissive: 0xffc070, emissiveIntensity: 90, roughness: 1 } ),
			fire: standard( { color: 0x120400, emissive: 0xff6a1a, emissiveIntensity: 30, roughness: 1, transparent: true, opacity: 0.8, depthWrite: false } ),
			smoke: standard( { color: 0x8a8580, roughness: 1, transparent: true, opacity: 0.42, depthWrite: false } ),
			darkSmoke: standard( { color: 0x262321, roughness: 1, transparent: true, opacity: 0.6, depthWrite: false } ),
			wood: standard( { color: 0x6b4a2b, roughness: 0.9 } ),
		};
		for ( const k in this.mats ) this.mats[ k ].name = 'combat-' + k;

		const tracerGeo = new CylinderGeometry( 0.045, 0.045, 1, 6 );
		const ball = new SphereGeometry( 1, 12, 8 );
		const lowBall = new SphereGeometry( 1, 14, 10 );
		this.bullets = pool( scene, 90, tracerGeo, this.mats.tracer, 'combat-tracer' );
		this.enemyBullets = pool( scene, 90, tracerGeo, this.mats.enemyTracer, 'combat-enemy-tracer' );
		this.shells = pool( scene, 16, ball, this.mats.shell, 'combat-shell' );
		this.flashes = pool( scene, 24, ball, this.mats.flash, 'combat-flash' );
		this.fires = pool( scene, 40, lowBall, this.mats.fire, 'combat-fire' );
		this.smokes = pool( scene, 90, lowBall, this.mats.smoke, 'combat-smoke' );
		this.darkSmokes = pool( scene, 60, lowBall, this.mats.darkSmoke, 'combat-dark-smoke' );
		this.splinters = pool( scene, 50, new BoxGeometry( 1, 1, 1 ), this.mats.wood, 'combat-splinter' );

		this.projectiles = [];
		this.puffs = [];
		this.onImpact = null; // ( projectile, point, what: 'water' | 'ground' | 'expire' )

	}

	// ---------------------------------------------------------------- projectiles

	// opts: { from: Vector3, vel: Vector3, dmg, owner, kind: 'bullet' | 'shell', life, splash, gravity }
	fire( opts ) {

		const kind = opts.kind || 'bullet';
		const list = kind === 'shell' ? this.shells : opts.owner === 'player' ? this.bullets : this.enemyBullets;
		const p = grab( list );
		if ( p.live ) this._kill( p );
		p.live = true;
		p.kind = kind;
		p.owner = opts.owner;
		p.ownerRef = opts.ownerRef || null;
		p.dmg = opts.dmg;
		p.splash = opts.splash || 0;
		p.gravity = opts.gravity ?? ( kind === 'shell' ? 9.81 : 0 );
		p.pos = ( p.pos || new Vector3() ).copy( opts.from );
		p.prev = ( p.prev || new Vector3() ).copy( opts.from );
		p.vel = ( p.vel || new Vector3() ).copy( opts.vel );
		p.age = 0;
		p.life = opts.life || 1.2;
		p.range = opts.range || 0; // full damage up to here (m), falling off beyond
		p.speed0 = opts.vel.length();
		p.mesh.visible = true;
		p.mesh.scale.setScalar( kind === 'shell' ? 0.16 : 1 );
		this._orient( p );
		this.projectiles.push( p );
		return p;

	}

	_orient( p ) {

		const m = p.mesh;
		m.position.copy( p.pos );
		if ( p.kind === 'shell' ) return;
		const sp = p.vel.length();
		_d.copy( p.vel ).divideScalar( sp || 1 );
		m.quaternion.setFromUnitVectors( UP, _d );
		// a streak about as long as the distance travelled in ~1/60 s, behind the head
		const len = Math.min( 6, Math.max( 0.6, sp * 0.018 ) );
		m.scale.set( 1, len, 1 );
		m.position.addScaledVector( _d, - len * 0.5 );

	}

	_kill( p ) {

		p.live = false;
		p.mesh.visible = false;
		const i = this.projectiles.indexOf( p );
		if ( i >= 0 ) this.projectiles.splice( i, 1 );

	}

	// hit test callback: ( p, a, b ) -> { point, target } | null for the segment a -> b
	updateProjectiles( dt, hitTest ) {

		const night = G.night.value;
		const glow = 1 - 0.65 * night;
		this.mats.tracer.emissiveIntensity = 45 * glow;
		this.mats.enemyTracer.emissiveIntensity = 45 * glow;
		this.mats.flash.emissiveIntensity = 90 * glow;
		this.mats.fire.emissiveIntensity = 30 * ( 1 - 0.6 * night );

		for ( let i = this.projectiles.length - 1; i >= 0; i -- ) {

			const p = this.projectiles[ i ];
			p.prev.copy( p.pos );
			p.vel.y -= p.gravity * dt;
			p.pos.addScaledVector( p.vel, dt );
			p.age += dt;
			const hit = hitTest( p, p.prev, p.pos );
			if ( hit ) {

				p.pos.copy( hit.point );
				this._kill( p );
				if ( this.onImpact ) this.onImpact( p, hit.point, hit.target );
				continue;

			}

			// the sea (y = 0 give or take the swell) and the island
			const ground = this.terrain ? this.terrain.heightAt( p.pos.x, p.pos.z ) : - 100;
			if ( p.pos.y < Math.max( 0, ground ) ) {

				const t = p.prev.y - p.pos.y > 1e-5 ? ( p.prev.y - Math.max( 0, ground ) ) / ( p.prev.y - p.pos.y ) : 1;
				p.pos.lerpVectors( p.prev, p.pos, Math.min( 1, Math.max( 0, t ) ) );
				const what = ground > 0 ? 'ground' : 'water';
				this._kill( p );
				if ( what === 'water' ) this.splash( p.pos, p.kind === 'shell' ? 1 : 0.2 );
				else this.dust( p.pos, p.kind === 'shell' ? 1 : 0.25 );
				if ( this.onImpact ) this.onImpact( p, p.pos, what );
				continue;

			}

			if ( p.age > p.life ) {

				this._kill( p );
				if ( p.kind === 'shell' && this.onImpact ) {

					this.explosion( p.pos, 0.8 );
					this.onImpact( p, p.pos, 'expire' );

				}

				continue;

			}

			this._orient( p );

		}

	}

	// ---------------------------------------------------------------- effects

	_puff( list, pos, { vel = null, life = 1, s0 = 0.3, s1 = 1, rise = 0, drag = 1.5, spin = 0, kind = 'puff', box = null } = {} ) {

		const p = grab( list );
		if ( p.live ) {

			const i = this.puffs.indexOf( p );
			if ( i >= 0 ) this.puffs.splice( i, 1 );

		}

		p.live = true;
		p.pos = ( p.pos || new Vector3() ).copy( pos );
		p.vel = ( p.vel || new Vector3() ).copy( vel || _v.set( 0, 0, 0 ) );
		p.age = 0;
		p.life = life;
		p.s0 = s0;
		p.s1 = s1;
		p.rise = rise;
		p.drag = drag;
		p.spin = spin;
		p.kind = kind;
		p.box = box;
		p.axis = p.axis || new Vector3();
		p.axis.set( Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 ).normalize();
		p.mesh.visible = true;
		p.mesh.position.copy( pos );
		p.mesh.scale.setScalar( s0 );
		this.puffs.push( p );
		return p;

	}

	updateEffects( dt ) {

		const wind = G.windDir ? G.windDir.value : null;
		for ( let i = this.puffs.length - 1; i >= 0; i -- ) {

			const p = this.puffs[ i ];
			p.age += dt;
			const t = p.age / p.life;
			if ( t >= 1 ) {

				p.live = false;
				p.mesh.visible = false;
				this.puffs.splice( i, 1 );
				continue;

			}

			if ( p.kind === 'splinter' ) {

				p.vel.y -= 9.81 * dt;
				p.pos.addScaledVector( p.vel, dt );
				if ( p.pos.y < 0 ) {

					p.pos.y = 0;
					p.vel.set( p.vel.x * 0.3, 0, p.vel.z * 0.3 );

				}

				p.mesh.position.copy( p.pos );
				_q.setFromAxisAngle( p.axis, p.spin * dt );
				p.mesh.quaternion.premultiply( _q );
				const s = p.s0 * ( t > 0.8 ? ( 1 - t ) / 0.2 : 1 );
				p.mesh.scale.set( p.box.x * s, p.box.y * s, p.box.z * s );
				continue;

			}

			p.vel.multiplyScalar( Math.exp( - p.drag * dt ) );
			p.vel.y += p.rise * dt;
			if ( wind && p.kind === 'smoke' ) {

				p.pos.x += wind.x * dt * 1.5;
				p.pos.z += wind.y * dt * 1.5;

			}

			p.pos.addScaledVector( p.vel, dt );
			p.mesh.position.copy( p.pos );
			let s;
			if ( p.kind === 'flash' ) s = p.s0 + ( p.s1 - p.s0 ) * Math.sin( Math.min( 1, t * 1.6 ) * Math.PI );
			else if ( p.kind === 'fire' ) s = ( p.s0 + ( p.s1 - p.s0 ) * Math.sin( t * Math.PI ) ) * ( 0.85 + 0.3 * Math.random() );
			else s = ( p.s0 + ( p.s1 - p.s0 ) * Math.sqrt( t ) ) * ( t > 0.75 ? 1 - ( t - 0.75 ) / 0.25 * 0.85 : 1 );
			p.mesh.scale.setScalar( Math.max( 0.001, s ) );

		}

	}

	muzzle( pos, dir, big = false ) {

		this._puff( this.flashes, _v.copy( pos ).addScaledVector( dir, big ? 0.5 : 0.2 ), { life: big ? 0.16 : 0.07, s0: 0.05, s1: big ? 0.9 : 0.28, kind: 'flash' } );
		if ( big || Math.random() < 0.35 ) {

			this._puff( this.smokes, pos, { vel: _d.copy( dir ).multiplyScalar( big ? 6 : 2 ), life: big ? 2.2 : 0.9, s0: big ? 0.3 : 0.1, s1: big ? 1.6 : 0.45, rise: 0.6, drag: 2.5, kind: 'smoke' } );

		}

	}

	// a hit on a hull: splinters, a flash and a puff of smoke
	hit( pos, normal = UP, power = 0.3 ) {

		this._puff( this.flashes, pos, { life: 0.08 + power * 0.12, s0: 0.1, s1: 0.35 + power * 1.6, kind: 'flash' } );
		const n = Math.round( 1 + power * 7 );
		for ( let i = 0; i < n; i ++ ) {

			_v.set( normal.x + ( Math.random() - 0.5 ) * 1.6, 0.6 + Math.random() * 1.2, normal.z + ( Math.random() - 0.5 ) * 1.6 ).multiplyScalar( 3 + power * 9 );
			const s = 0.05 + Math.random() * 0.08 * ( 1 + power );
			this._puff( this.splinters, pos, { vel: _v, life: 1.2 + Math.random(), s0: 1, kind: 'splinter', spin: 8 + Math.random() * 12, box: new Vector3( s, s * 0.3, s * 2.4 ) } );

		}

		this._puff( this.smokes, pos, { vel: _v.set( 0, 1, 0 ), life: 1.0 + power, s0: 0.1, s1: 0.35 + power * 1.8, rise: 0.8, kind: 'smoke' } );

	}

	explosion( pos, power = 1 ) {

		this._puff( this.flashes, pos, { life: 0.25, s0: 0.4, s1: 2.6 * power, kind: 'flash' } );
		for ( let i = 0; i < 5; i ++ ) {

			_v.set( Math.random() - 0.5, 0.5 + Math.random(), Math.random() - 0.5 ).multiplyScalar( 4 * power );
			this._puff( this.fires, pos, { vel: _v, life: 0.5 + Math.random() * 0.4, s0: 0.3, s1: ( 0.9 + Math.random() * 0.6 ) * power, drag: 3, kind: 'fire' } );

		}

		for ( let i = 0; i < 6; i ++ ) {

			_v.set( Math.random() - 0.5, 0.4 + Math.random(), Math.random() - 0.5 ).multiplyScalar( 5 * power );
			this._puff( this.darkSmokes, pos, { vel: _v, life: 2.5 + Math.random() * 2, s0: 0.5, s1: ( 2 + Math.random() * 1.5 ) * power, rise: 1.2, drag: 2, kind: 'smoke' } );

		}

		this.hit( pos, UP, 0.8 * power );

	}

	// a burning, disabled boat: call every frame with its fire points (world)
	burn( pos, intensity, dt ) {

		if ( Math.random() < dt * 14 * intensity ) {

			_v.set( ( Math.random() - 0.5 ) * 0.6, 1 + Math.random(), ( Math.random() - 0.5 ) * 0.6 );
			this._puff( this.fires, _d.copy( pos ).add( _v.set( ( Math.random() - 0.5 ) * 0.8, 0, ( Math.random() - 0.5 ) * 0.8 ) ), { vel: _v.set( 0, 1.5, 0 ), life: 0.4 + Math.random() * 0.5, s0: 0.2, s1: 0.5 + Math.random() * 0.5 * intensity, drag: 1, kind: 'fire' } );

		}

		if ( Math.random() < dt * 6 * intensity ) {

			this._puff( this.darkSmokes, _d.copy( pos ).add( _v.set( 0, 0.8, 0 ) ), { vel: _v.set( ( Math.random() - 0.5 ) * 0.5, 2.2, ( Math.random() - 0.5 ) * 0.5 ), life: 4 + Math.random() * 2, s0: 0.4, s1: 2.2 + Math.random() * 1.5, rise: 0.4, drag: 0.6, kind: 'smoke' } );

		}

	}

	// a damaged (not burning) hull trailing grey smoke
	smoulder( pos, intensity, dt ) {

		if ( Math.random() < dt * 5 * intensity ) {

			this._puff( this.smokes, pos, { vel: _v.set( ( Math.random() - 0.5 ) * 0.3, 1.6, ( Math.random() - 0.5 ) * 0.3 ), life: 2.5 + Math.random() * 1.5, s0: 0.2, s1: 1 + Math.random() * intensity, rise: 0.3, drag: 0.8, kind: 'smoke' } );

		}

	}

	splash( pos, power = 0.3 ) {

		if ( ! this.spray ) return;
		const p = _v.set( pos.x, 0.05, pos.z );
		this.spray.emit( p, _d.set( 0, 3 + power * 9, 0 ), Math.round( 30 + power * 260 ), 0.05 + power * 0.05, SPRAY.SPRAY, { spread: 1 + power * 3.5, jitter: 0.1 + power * 0.8, life: 1.4 + power } );
		this.spray.emit( p, _d.set( 0, 4 + power * 12, 0 ), Math.round( 20 + power * 160 ), 0.02, SPRAY.DROPLET, { spread: 1.5 + power * 4, jitter: 0.1 + power * 0.5 } );
		if ( power > 0.6 ) this.spray.emit( p, _d.set( 0, 1, 0 ), 120, 0.25, SPRAY.MIST, { spread: 2.5, jitter: 1.5, life: 3 } );

	}

	dust( pos, power = 0.3 ) {

		this._puff( this.smokes, pos, { vel: _v.set( 0, 1.5, 0 ), life: 1 + power * 2, s0: 0.1, s1: 0.4 + power * 2.5, rise: 0.2, kind: 'smoke' } );
		if ( power > 0.6 ) this.explosion( pos, 0.6 );

	}

}
