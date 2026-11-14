import { Mesh, Vector3 } from '../engine/index.js';
import { prepare, mergePrepared, cylinder, sphere, mat4 } from '../world/boat/GeoKit.js';
import { standard } from '../materials/Materials.js';
import { PAT, createPropMaterial } from './GameMaterials.js';

// Danger Waters: the pirates' hunting grounds, out in the deep water off the island. Pirates only
// attack on sight in here (elsewhere they leave you alone unless you shoot first), and the reward
// matches the risk: epic and legendary fish bite twice as often in there (Bites.tierChances), and the
// pirates carry more plunder.
// Each zone is ringed with red marker buoys and shown in red on the minimap.
export const DANGER_ZONES = [
	{ id: 'devils-deep', name: 'Devil\'s Deep', x: - 515, z: 250, r: 120 },
	{ id: 'blackwater', name: 'Blackwater Bank', x: 515, z: 290, r: 120 },
	{ id: 'graveyard', name: 'The Graveyard', x: 0, z: 370, r: 90 },
];

export const DANGER_LOOT_BONUS = 1.5; // pirates' cash there

// the zone at (x, z), with `margin` metres of slack (positive = larger), or null
export function dangerZoneAt( x, z, margin = 0 ) {

	for ( const d of DANGER_ZONES ) if ( ( x - d.x ) ** 2 + ( z - d.z ) ** 2 < ( d.r + margin ) ** 2 ) return d;
	return null;

}

// a random point inside a zone (deep enough to sail)
export function randomInZone( zone, terrain, minDepth = 6 ) {

	for ( let i = 0; i < 40; i ++ ) {

		const a = Math.random() * Math.PI * 2, r = Math.sqrt( Math.random() ) * zone.r * 0.85;
		const x = zone.x + Math.cos( a ) * r, z = zone.z + Math.sin( a ) * r;
		if ( - terrain.heightAt( x, z ) >= minDepth ) return new Vector3( x, 0, z );

	}

	return new Vector3( zone.x, 0, zone.z );

}

// red marker buoys around every zone, one merged mesh (one draw call); their lamps glow at night
export function buildDangerBuoys( scene, terrain ) {

	const body = [], lamps = [];
	for ( const d of DANGER_ZONES ) {

		const n = Math.max( 12, Math.round( 2 * Math.PI * d.r / 45 ) );
		for ( let i = 0; i < n; i ++ ) {

			const a = i / n * Math.PI * 2;
			const x = d.x + Math.cos( a ) * d.r, z = d.z + Math.sin( a ) * d.r;
			if ( terrain.heightAt( x, z ) > - 1.5 ) continue; // not on the rocks
			const tilt = ( Math.random() - 0.5 ) * 0.12;
			body.push( prepare( cylinder( 0.55, 0.75, 1.2, 14 ), { color: 0xc81e14, rough: 0.5, pattern: PAT.rusty, matrix: mat4( x, 0.2, z, tilt, a, tilt ) } ) );
			body.push( prepare( cylinder( 0.08, 0.32, 1.6, 8 ), { color: 0xb01a12, rough: 0.5, matrix: mat4( x, 1.6, z, tilt, a, tilt ) } ) );
			body.push( prepare( cylinder( 0.38, 0.38, 0.12, 12 ), { color: 0x1a1a1a, rough: 0.6, matrix: mat4( x, 2.25, z, tilt, a, tilt ) } ) );
			lamps.push( prepare( sphere( 0.16, 10, 8 ), { color: 0xff3020, matrix: mat4( x, 2.5, z ) } ) );

		}

	}

	const bodyMesh = new Mesh( mergePrepared( body ), createPropMaterial( 'dangerBuoys' ) );
	bodyMesh.name = 'danger-buoys';
	bodyMesh.castShadow = true;
	bodyMesh.receiveShadow = true;
	const lampMat = standard( { color: 0x300404, emissive: 0xff2a18, emissiveIntensity: 8, vertexColors: false } );
	lampMat.name = 'dangerBuoyLamp';
	const lampMesh = new Mesh( mergePrepared( lamps ), lampMat );
	lampMesh.name = 'danger-buoy-lamps';
	scene.add( bodyMesh, lampMesh );
	return { bodyMesh, lampMesh, lampMat };

}

