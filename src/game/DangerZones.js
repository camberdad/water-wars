import { Mesh, Vector3 } from '../engine/index.js';
import { prepare, mergePrepared, cylinder, sphere, mat4 } from '../world/boat/GeoKit.js';
import { standard } from '../materials/Materials.js';
import { PAT, createPropMaterial } from './GameMaterials.js';

// Danger tiers (Water Wars 1.7): the sea gets more dangerous the further you go from the harbour.
// Bands of distance from the harbour (the start docks):
//
//   safe harbour         < 220 m   nobody fires (Harbours.js)
//   1  Coastal Waters    220-700   a few weak pirates; they only attack if you come close
//   2  Open Sea          700-1400  tougher pirates further off; rarer fish; giants surface
//   3  Deadwater         1400-2400 pirate warlords with cannons, more of them; the rarest fish and
//                                  the most giants; the most plunder
//
// Beyond WORLD_RADIUS is the edge of the charted sea (you are turned back). Coloured buoy rings mark
// the tier borders and the minimap draws the bands. The API keeps the old "danger zone" names:
// dangerZoneAt() returns the tier you are in (null in the harbour).

export const HARBOUR = { x: 40, z: 20 };
export const SAFE_RADIUS = 220;
export const WORLD_RADIUS = 2400;

// aggro: m, how close you must come before a pirate notices you and comes for you (Water Wars 1.13.7:
// close by only, was 120 / 200 / 300); chase: m, how far it then follows you before it gives up
export const DANGER_TIERS = [
	{ tier: 1, id: 'coastal', name: 'Coastal Waters', r0: SAFE_RADIUS, r1: 700, color: '#e8d24a', lamp: 0xffd040, aggro: 60, chase: 200, loot: 1, fishMul: 1, pirateTier: 1 },
	{ tier: 2, id: 'open-sea', name: 'Open Sea', r0: 700, r1: 1400, color: '#ff9a3a', lamp: 0xff8a20, aggro: 75, chase: 240, loot: 1.5, fishMul: 1.4, pirateTier: 2 },
	{ tier: 3, id: 'deadwater', name: 'Deadwater', r0: 1400, r1: WORLD_RADIUS, color: '#ff4a3a', lamp: 0xff2a18, aggro: 90, chase: 280, loot: 2.5, fishMul: 2, pirateTier: 3 },
];
// (older code iterates DANGER_ZONES)
export const DANGER_ZONES = DANGER_TIERS;
export const DANGER_LOOT_BONUS = 1;

export const harbourDistance = ( x, z ) => Math.hypot( x - HARBOUR.x, z - HARBOUR.z );

// the tier at (x, z), or null in the harbour; `margin` m of slack outward (a zone reaches a little
// further into the safer band)
export function dangerZoneAt( x, z, margin = 0 ) {

	const d = harbourDistance( x, z ) + margin;
	if ( d < SAFE_RADIUS ) return null;
	for ( const t of DANGER_TIERS ) if ( d < t.r1 ) return t;
	return DANGER_TIERS[ DANGER_TIERS.length - 1 ];

}

export const dangerTierAt = dangerZoneAt;

// a random point of open water in a tier's band (deep enough to sail). With `near`, one 250-650 m from
// it if possible (so things turn up around the player, not on the far side of the ring).
export function randomInZone( zone, terrain, near = null, minDepth = 6 ) {

	const ok = ( x, z ) => {

		const d = harbourDistance( x, z );
		return d > zone.r0 + 15 && d < zone.r1 - 15 && - terrain.heightAt( x, z ) >= minDepth;

	};

	if ( near ) for ( let i = 0; i < 60; i ++ ) {

		const a = Math.random() * Math.PI * 2, r = 250 + Math.random() * 400;
		const x = near.x + Math.cos( a ) * r, z = near.z + Math.sin( a ) * r;
		if ( ok( x, z ) ) return new Vector3( x, 0, z );

	}

	for ( let i = 0; i < 80; i ++ ) {

		const a = Math.random() * Math.PI * 2, r = zone.r0 + 20 + Math.random() * ( zone.r1 - zone.r0 - 40 );
		const x = HARBOUR.x + Math.cos( a ) * r, z = HARBOUR.z + Math.sin( a ) * r;
		if ( ok( x, z ) ) return new Vector3( x, 0, z );

	}

	return new Vector3( HARBOUR.x, 0, HARBOUR.z + ( zone.r0 + zone.r1 ) / 2 );

}

// buoy rings on the tier borders (700 m: amber lamps, 1400 m: red lamps), one merged mesh for the
// buoys and one per lamp colour
export function buildDangerBuoys( scene, terrain ) {

	const body = [];
	const lampMeshes = [];
	for ( let k = 1; k < DANGER_TIERS.length; k ++ ) {

		const t = DANGER_TIERS[ k ];
		const R = t.r0;
		const lamps = [];
		const n = Math.round( 2 * Math.PI * R / 55 );
		for ( let i = 0; i < n; i ++ ) {

			const a = i / n * Math.PI * 2;
			const x = HARBOUR.x + Math.cos( a ) * R, z = HARBOUR.z + Math.sin( a ) * R;
			if ( terrain.heightAt( x, z ) > - 1.5 ) continue; // not on the land or the rocks
			const tilt = ( Math.random() - 0.5 ) * 0.12;
			const col = k === 1 ? 0xd88a10 : 0xc81e14;
			body.push( prepare( cylinder( 0.55, 0.75, 1.2, 14 ), { color: col, rough: 0.5, pattern: PAT.rusty, matrix: mat4( x, 0.2, z, tilt, a, tilt ) } ) );
			body.push( prepare( cylinder( 0.08, 0.32, 1.6, 8 ), { color: col, rough: 0.5, matrix: mat4( x, 1.6, z, tilt, a, tilt ) } ) );
			body.push( prepare( cylinder( 0.38, 0.38, 0.12, 12 ), { color: 0x1a1a1a, rough: 0.6, matrix: mat4( x, 2.25, z, tilt, a, tilt ) } ) );
			lamps.push( prepare( sphere( 0.16, 10, 8 ), { color: t.lamp, matrix: mat4( x, 2.5, z ) } ) );

		}

		if ( lamps.length ) {

			const m = standard( { color: 0x200404, emissive: t.lamp, emissiveIntensity: 8 } );
			m.name = 'dangerBuoyLamp-' + t.id;
			const mesh = new Mesh( mergePrepared( lamps ), m );
			mesh.name = 'danger-buoy-lamps-' + t.id;
			lampMeshes.push( mesh );

		}

	}

	const bodyMesh = new Mesh( mergePrepared( body ), createPropMaterial( 'dangerBuoys' ) );
	bodyMesh.name = 'danger-buoys';
	bodyMesh.castShadow = true;
	bodyMesh.receiveShadow = true;
	scene.add( bodyMesh, ...lampMeshes );
	return { bodyMesh, lampMeshes };

}
