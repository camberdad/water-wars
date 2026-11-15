import { Mesh, Vector3 } from '../engine/index.js';
import { prepare, mergePrepared, box, cylinder, sphere, torus, mat4 } from '../world/boat/GeoKit.js';
import { standard } from '../materials/Materials.js';
import { PAT, createPropMaterial } from './GameMaterials.js';

// Safe zones and the harbour stations out at sea.
//
// The harbour (the bay, the pier, the beach and the reef) and a ring of water around each of the four
// sea stations are safe zones: nobody fires on you there (pirates and the coast guard break off), your
// own guns stay quiet, and you can fish, shop and repair in peace. Each station is a floating service
// platform: U alongside it opens harbour services (repairs, fuel, upgrades, boats, selling the catch),
// the same as at the pier.
export const STATIONS = [
	{ id: 'west', name: 'Westpoint Station', x: - 460, z: - 10 },
	{ id: 'east', name: 'Eastwind Station', x: 500, z: 30 },
	{ id: 'southwest', name: 'Southreach Barge', x: - 200, z: 430 },
	{ id: 'southeast', name: 'Coral Light Rig', x: 220, z: 430 },
	// out in the Open Sea and the Deadwater: safe havens to refuel and repair far from home
	{ id: 'midway', name: 'Midway Station', x: 40, z: 1050 },
	{ id: 'south', name: 'Southern Cross Outpost', x: 40, z: 1780 },
	{ id: 'far-east', name: 'Eastmost Outpost', x: 1360, z: 920 },
	{ id: 'far-west', name: 'Westmost Outpost', x: - 1260, z: 960 },
];

export const STATION_RADIUS = 80; // the safe water around a station
export const SERVICE_RADIUS = 40; // close enough to tie up and trade

export const SAFE_ZONES = [
	{ id: 'harbour', name: 'The harbour', x: 40, z: 20, r: 220 },
	...STATIONS.map( ( s ) => ( { id: s.id, name: s.name, x: s.x, z: s.z, r: STATION_RADIUS, station: s } ) ),
];

// the safe zone at (x, z), or null
export function safeZoneAt( x, z ) {

	for ( const s of SAFE_ZONES ) if ( ( x - s.x ) ** 2 + ( z - s.z ) ** 2 < s.r * s.r ) return s;
	return null;

}

// the station within `r` of (x, z), or null
export function stationNear( x, z, r = SERVICE_RADIUS ) {

	for ( const s of STATIONS ) if ( ( x - s.x ) ** 2 + ( z - s.z ) ** 2 < r * r ) return s;
	return null;

}

// The floating service platforms: two pontoons under a plank deck, a white office with a green roof,
// fuel tanks, a crane, tyre fenders and a mast with a green "safe harbour" lamp. One merged mesh for
// all four (one draw call), plus the lamps.
export function buildStations( scene, colliders = null ) {

	const parts = [], lamps = [];
	const WOOD = { color: 0x7a6248, rough: 0.85, pattern: PAT.woodX };
	const add = ( geo, style, m ) => parts.push( prepare( geo, { ...style, matrix: m } ) );
	for ( const s of STATIONS ) {

		const yaw = Math.atan2( - s.x, 150 - s.z ); // face the island
		const at = ( x, y, z, rx = 0, ry = 0, rz = 0 ) => {

			const c = Math.cos( yaw ), n = Math.sin( yaw );
			// 'YXZ': the part's own tilt first, then the station's heading
			return mat4( s.x + x * c + z * n, y, s.z - x * n + z * c, rx, yaw + ry, rz, 1, 1, 1, 'YXZ' );

		};

		// pontoons and deck
		for ( const px of [ - 3.4, 3.4 ] ) {

			add( cylinder( 0.95, 0.95, 13, 16 ), { color: 0xd8d4c8, rough: 0.5, pattern: PAT.rusty }, at( px, 0.15, 0, Math.PI / 2 ) );
			add( cylinder( 0.97, 0.97, 1.2, 16 ), { color: 0xc23a22, rough: 0.5 }, at( px, 0.15, 5.4, Math.PI / 2 ) );
			add( cylinder( 0.97, 0.97, 1.2, 16 ), { color: 0xc23a22, rough: 0.5 }, at( px, 0.15, - 5.4, Math.PI / 2 ) );

		}

		add( box( 9.6, 0.28, 13.4 ), WOOD, at( 0, 1.25, 0 ) );
		for ( const pz of [ - 6.2, - 3, 0, 3, 6.2 ] ) add( box( 9.4, 0.18, 0.3 ), { color: 0x5a4a38, rough: 0.9 }, at( 0, 1.02, pz ) );
		// office
		add( box( 4.2, 2.6, 3.6 ), { color: 0xeeeae0, rough: 0.6 }, at( - 1.6, 2.69, - 3.2 ) );
		add( box( 4.6, 0.16, 4.0 ), { color: 0x2f7a4a, rough: 0.5, pattern: PAT.rusty }, at( - 1.6, 4.06, - 3.2, 0.08 ) );
		add( box( 1.2, 0.9, 0.05 ), { color: 0x1a2a33, rough: 0.1 }, at( - 2.4, 3.1, - 1.38 ) );
		add( box( 1.2, 0.9, 0.05 ), { color: 0x1a2a33, rough: 0.1 }, at( - 0.6, 3.1, - 1.38 ) );
		add( box( 0.9, 2.0, 0.06 ), { color: 0x2f7a4a, rough: 0.6 }, at( 0.2, 2.4, - 1.38 ) );
		// sign board over the door: white with a green cross (services)
		add( box( 2.6, 0.7, 0.08 ), { color: 0xf4f2ea, rough: 0.6 }, at( - 1.6, 4.55, - 1.34 ) );
		add( box( 0.5, 0.14, 0.04 ), { color: 0x22a050, rough: 0.5 }, at( - 1.6, 4.55, - 1.28 ) );
		add( box( 0.14, 0.5, 0.04 ), { color: 0x22a050, rough: 0.5 }, at( - 1.6, 4.55, - 1.28 ) );
		// fuel tanks and a pump
		for ( const tz of [ 1.8, 3.6 ] ) add( cylinder( 0.75, 0.75, 1.8, 18 ), { color: 0xd6b830, rough: 0.45, pattern: PAT.rusty }, at( 3.0, 2.3, tz ) );
		add( box( 0.5, 1.3, 0.4 ), { color: 0xc23a22, rough: 0.5 }, at( 3.8, 2.05, 0.2 ) );
		// crane
		add( cylinder( 0.16, 0.2, 4.2, 10 ), { color: 0xe0a020, rough: 0.5, metal: 0.6 }, at( - 3.6, 3.5, 4.8 ) );
		add( box( 0.22, 0.22, 3.6 ), { color: 0xe0a020, rough: 0.5, metal: 0.6 }, at( - 3.6, 5.4, 3.2, - 0.25 ) );
		// crates
		for ( const [ cx, cz ] of [ [ 0.8, 4.2 ], [ 1.6, 5.4 ], [ 0.9, 5.4 ] ] ) add( box( 0.8, 0.8, 0.8 ), { color: 0x8a6a40, rough: 0.9, pattern: PAT.wood }, at( cx, 1.79, cz ) );
		// tyre fenders along the sides
		for ( const fz of [ - 4.5, - 1.5, 1.5, 4.5 ] ) for ( const sx of [ - 4.85, 4.85 ] ) add( torus( 0.36, 0.14, 8, 16 ), { color: 0x151515, rough: 0.9 }, at( sx, 0.95, fz, 0, Math.PI / 2 ) );
		// mast with the green lamp and a flag
		add( cylinder( 0.07, 0.1, 7, 8 ), { color: 0xdcdcdc, rough: 0.3, metal: 1 }, at( 3.6, 4.9, - 5.6 ) );
		add( box( 0.02, 0.7, 1.1 ), { color: 0x22a050, rough: 0.9, pattern: PAT.cloth }, at( 3.6, 7.6, - 5.0 ) );
		add( box( 0.024, 0.14, 0.6 ), { color: 0xffffff, rough: 0.9 }, at( 3.61, 7.6, - 5.0 ) );
		add( box( 0.024, 0.5, 0.16 ), { color: 0xffffff, rough: 0.9 }, at( 3.61, 7.6, - 5.0 ) );
		const lp = at( 3.6, 8.55, - 5.6 );
		lamps.push( prepare( sphere( 0.28, 12, 10 ), { color: 0x30ff70, matrix: lp } ) );

		if ( colliders ) {

			// the platform is solid to the boats (and the player can't drive through it)
			colliders.addBox( new Vector3( s.x, 1.0, s.z ), new Vector3( 5.0, 1.6, 7.0 ), yaw, { tag: 'station' } );

		}

	}

	const mesh = new Mesh( mergePrepared( parts ), createPropMaterial( 'stations' ) );
	mesh.name = 'harbour-stations';
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	const lampMat = standard( { color: 0x022008, emissive: 0x30ff70, emissiveIntensity: 10 } );
	lampMat.name = 'stationLamp';
	const lampMesh = new Mesh( mergePrepared( lamps ), lampMat );
	lampMesh.name = 'harbour-station-lamps';
	scene.add( mesh, lampMesh );
	return { mesh, lampMesh };

}
