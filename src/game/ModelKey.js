// Licensed boat models (Water Wars 1.13). Some purchased models may only ship inside a game in a form
// players can't simply download and reuse: the CGTrader Royalty Free licence asks for "commercially
// reasonable measures" such as a proprietary format or encryption. Those models are converted by
// tools/boats/convert.mjs into the game's own binary layout and sealed with AES-256-GCM (<id>.dat); the
// game opens them in memory when the boat loads (Boats.loadBoatGeometry). No plain copy is published.
//
// Sealed file: [ 12-byte IV ][ ciphertext + 16-byte tag ] of [ u32 json length ][ json ][ pad to 4 ][ bin ].

const P = [ 0x57, 0x57, 0x2d, 0x6d ];
const Q = [ 0x9e, 0x37, 0x79, 0xb9 ];

// the 32-byte key, assembled rather than stored as one literal
export function modelKey() {

	const k = new Uint8Array( 32 );
	let s = 0x2545f491;
	for ( let i = 0; i < 32; i ++ ) {

		s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
		k[ i ] = ( ( s >>> ( ( i & 3 ) * 8 ) ) ^ P[ i & 3 ] ^ Q[ ( i >> 2 ) & 3 ] ) & 0xff;

	}

	return k;

}

// open a sealed model: { meta, bin } (WebCrypto, in the browser)
export async function openSealedModel( sealed ) {

	const subtle = globalThis.crypto && globalThis.crypto.subtle;
	if ( ! subtle ) throw new Error( 'this browser cannot open the boat model (no WebCrypto)' );
	const key = await subtle.importKey( 'raw', modelKey(), { name: 'AES-GCM' }, false, [ 'decrypt' ] );
	const iv = new Uint8Array( sealed, 0, 12 );
	const plain = await subtle.decrypt( { name: 'AES-GCM', iv }, key, new Uint8Array( sealed, 12 ) );
	const jsonLen = new DataView( plain ).getUint32( 0, true );
	const meta = JSON.parse( new TextDecoder().decode( new Uint8Array( plain, 4, jsonLen ) ) );
	const start = ( 4 + jsonLen + 3 ) & ~ 3;
	return { meta, bin: plain.slice( start ) };

}
