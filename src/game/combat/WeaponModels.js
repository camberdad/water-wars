import { Group, Mesh, Object3D, Vector3 } from '../../engine/index.js';
import { prepare, mergePrepared, box, cylinder, sphere, mat4 } from '../../world/boat/GeoKit.js';
import { createPropMaterial, PAT } from '../GameMaterials.js';

// Procedural deck guns, built like the boat's fittings (GeoKit: vertex colour + rough / metal /
// pattern). A turret is three nodes: the root (fixed to the deck), `yaw` (turns about +Y) and
// `pitch` (elevates about +X); the barrels point along the pitch node's +Z. `muzzles` are local
// points in the pitch frame.

let _mat = null;
export function weaponMaterial() {

	if ( ! _mat ) _mat = createPropMaterial( 'weapons' );
	return _mat;

}

const GUNMETAL = { color: 0x2a2d30, rough: 0.38, metal: 1, pattern: PAT.machined };
const DARK = { color: 0x16181a, rough: 0.5, metal: 1 };
const OLIVE = { color: 0x3c4430, rough: 0.6, metal: 0.2, pattern: PAT.rusty };
const WOOD = { color: 0x5a3a20, rough: 0.7, metal: 0, pattern: PAT.wood };
const BRASS = { color: 0x9a7a3a, rough: 0.3, metal: 1 };

function part( list, geo, style, m ) {

	list.push( prepare( geo, { ...style, matrix: m } ) );

}

// tier: index into UPGRADES.gun (0 rifle .. 4 rotary cannon)
export function buildGunTurret( tier = 0 ) {

	const base = [], body = [];
	const muzzles = [];
	// pedestal
	part( base, cylinder( 0.16, 0.22, 0.22, 16 ), OLIVE, mat4( 0, 0.11, 0 ) );
	part( base, cylinder( 0.06, 0.06, 0.3, 10 ), GUNMETAL, mat4( 0, 0.36, 0 ) );
	// yoke
	part( body, box( 0.34, 0.06, 0.2 ), OLIVE, mat4( 0, - 0.02, 0 ) );
	for ( const s of [ - 1, 1 ] ) part( body, box( 0.04, 0.2, 0.14 ), OLIVE, mat4( s * 0.15, 0.06, 0 ) );
	if ( tier <= 1 ) {

		// a long rifle on a swivel: wooden stock, receiver, barrel
		const len = tier === 0 ? 0.75 : 0.85;
		part( body, box( 0.07, 0.1, 0.42 ), WOOD, mat4( 0, 0.1, - 0.3 ) );
		part( body, box( 0.08, 0.09, 0.3 ), GUNMETAL, mat4( 0, 0.12, 0.02 ) );
		part( body, cylinder( 0.018, 0.022, len, 10 ), DARK, mat4( 0, 0.13, 0.17 + len / 2, Math.PI / 2, 0, 0 ) );
		if ( tier === 1 ) part( body, cylinder( 0.012, 0.012, 0.5, 8 ), BRASS, mat4( 0, 0.09, 0.4, Math.PI / 2, 0, 0 ) );
		part( body, box( 0.03, 0.05, 0.05 ), DARK, mat4( 0, 0.185, 0.0 ) );
		muzzles.push( new Vector3( 0, 0.13, 0.17 + len ) );

	} else {

		// a machine-gun mount: receiver box, ammo can, gun shield, one or two barrels with jackets
		const twin = tier >= 3;
		const rotary = tier >= 4;
		part( body, box( 0.62, 0.42, 0.03 ), OLIVE, mat4( 0, 0.2, 0.32 ) ); // shield
		part( body, box( 0.62, 0.08, 0.12 ), OLIVE, mat4( 0, 0.43, 0.27, - 0.5, 0, 0 ) );
		for ( const s of twin ? [ - 1, 1 ] : [ 0 ] ) {

			const x = s * 0.13;
			part( body, box( 0.12, 0.13, 0.46 ), GUNMETAL, mat4( x, 0.13, 0.05 ) );
			part( body, box( 0.1, 0.12, 0.16 ), OLIVE, mat4( x + ( s || 1 ) * 0.12, 0.08, - 0.02 ) ); // ammo can
			if ( rotary ) {

				part( body, cylinder( 0.07, 0.07, 0.9, 14 ), DARK, mat4( x, 0.13, 0.75, Math.PI / 2, 0, 0 ) );
				for ( let k = 0; k < 6; k ++ ) {

					const a = k / 6 * Math.PI * 2;
					part( body, cylinder( 0.014, 0.014, 0.96, 6 ), GUNMETAL, mat4( x + Math.cos( a ) * 0.045, 0.13 + Math.sin( a ) * 0.045, 0.8, Math.PI / 2, 0, 0 ) );

				}

				muzzles.push( new Vector3( x, 0.13, 1.28 ) );

			} else {

				part( body, cylinder( 0.035, 0.035, 0.5, 12 ), DARK, mat4( x, 0.13, 0.5, Math.PI / 2, 0, 0 ) ); // cooling jacket
				part( body, cylinder( 0.016, 0.016, 0.9, 8 ), GUNMETAL, mat4( x, 0.13, 0.7, Math.PI / 2, 0, 0 ) );
				part( body, cylinder( 0.026, 0.02, 0.08, 10 ), DARK, mat4( x, 0.13, 1.14, Math.PI / 2, 0, 0 ) );
				muzzles.push( new Vector3( x, 0.13, 1.18 ) );

			}

		}

		// spade grips behind
		for ( const s of [ - 1, 1 ] ) part( body, cylinder( 0.015, 0.015, 0.14, 8 ), DARK, mat4( s * 0.09, 0.12, - 0.26, Math.PI / 2, 0, 0 ) );

	}

	return assemble( base, body, muzzles, 0.47 );

}

// tier: index into UPGRADES.cannon (1 swivel gun .. 3 naval gun)
export function buildCannon( tier = 1 ) {

	const base = [], body = [];
	const big = tier >= 3, mid = tier === 2;
	const len = big ? 1.9 : mid ? 1.5 : 1.0;
	const r = big ? 0.13 : mid ? 0.1 : 0.07;
	part( base, cylinder( 0.3, 0.38, 0.14, 18 ), OLIVE, mat4( 0, 0.07, 0 ) );
	part( base, cylinder( 0.12, 0.14, 0.3, 14 ), GUNMETAL, mat4( 0, 0.29, 0 ) );
	// carriage cheeks
	for ( const s of [ - 1, 1 ] ) part( body, box( 0.05, 0.26 + r, 0.42 ), OLIVE, mat4( s * ( r + 0.08 ), 0.02, 0 ) );
	part( body, box( 2 * r + 0.2, 0.06, 0.42 ), OLIVE, mat4( 0, - 0.1, 0 ) );
	// the tube: breech, chase, muzzle swell
	part( body, sphere( r * 1.25, 14, 10 ), DARK, mat4( 0, 0.06, - 0.18 ) );
	part( body, cylinder( r * 1.05, r * 1.3, len * 0.45, 18 ), DARK, mat4( 0, 0.06, - 0.18 + len * 0.225, Math.PI / 2, 0, 0 ) );
	part( body, cylinder( r * 0.85, r * 1.05, len * 0.55, 18 ), DARK, mat4( 0, 0.06, - 0.18 + len * 0.45 + len * 0.275, Math.PI / 2, 0, 0 ) );
	part( body, cylinder( r * 1.1, r * 1.0, 0.08, 18 ), BRASS, mat4( 0, 0.06, - 0.18 + len - 0.04, Math.PI / 2, 0, 0 ) );
	if ( big ) part( body, box( 0.8, 0.5, 0.04 ), OLIVE, mat4( 0, 0.15, 0.25 ) ); // shield
	return assemble( base, body, [ new Vector3( 0, 0.06, - 0.18 + len ) ], 0.42 );

}

function assemble( base, body, muzzles, pivotY ) {

	const mat = weaponMaterial();
	const root = new Group();
	root.name = 'weapon';
	const baseMesh = new Mesh( mergePrepared( base ), mat );
	baseMesh.castShadow = true;
	root.add( baseMesh );
	const yaw = new Object3D();
	yaw.position.y = pivotY;
	root.add( yaw );
	const pitch = new Object3D();
	yaw.add( pitch );
	const bodyMesh = new Mesh( mergePrepared( body ), mat );
	bodyMesh.castShadow = true;
	pitch.add( bodyMesh );
	return {
		root, yaw, pitch, muzzles,
		dispose() {

			baseMesh.geometry.dispose();
			bodyMesh.geometry.dispose();
			if ( root.parent ) root.parent.remove( root );

		},
	};

}

// small props for the NPC boats: a black flag on a pole, a coast-guard light bar
export function buildFlag( color = 0x0c0c0c, emblem = 0xe8e2d0 ) {

	const list = [];
	part( list, cylinder( 0.025, 0.03, 2.2, 8 ), { color: 0x8a8d90, rough: 0.3, metal: 1 }, mat4( 0, 1.1, 0 ) );
	part( list, box( 0.02, 0.6, 0.95 ), { color, rough: 0.9, pattern: PAT.cloth }, mat4( 0, 1.85, - 0.5 ) );
	// a crude skull: a pale disc and crossed bones
	part( list, cylinder( 0.12, 0.12, 0.025, 14 ), { color: emblem, rough: 0.9 }, mat4( 0.01, 1.9, - 0.5, 0, 0, Math.PI / 2 ) );
	for ( const s of [ - 1, 1 ] ) part( list, box( 0.024, 0.04, 0.42 ), { color: emblem, rough: 0.9 }, mat4( 0.01, 1.72, - 0.5, s * 0.6, 0, 0 ) );
	const mesh = new Mesh( mergePrepared( list ), weaponMaterial() );
	mesh.castShadow = true;
	mesh.name = 'npc-flag';
	return mesh;

}

export function buildLightBar() {

	const list = [];
	part( list, box( 1.1, 0.1, 0.22 ), { color: 0x202224, rough: 0.4, metal: 1 }, mat4( 0, 0.05, 0 ) );
	const mesh = new Mesh( mergePrepared( list ), weaponMaterial() );
	mesh.name = 'npc-lightbar';
	return mesh;

}
