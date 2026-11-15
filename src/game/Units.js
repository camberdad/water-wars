// Display units (Water Wars shows US customary units). The game keeps metric internally (kg, cm, m,
// litres): these turn a value into what the player reads.

export const LB_PER_KG = 2.20462;
export const IN_PER_CM = 0.393701;
export const FT_PER_M = 3.28084;
export const GAL_PER_L = 0.264172;

const num = ( v, d ) => Number( v ).toLocaleString( 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d } );

// pounds: "1.85 lb", "24.6 lb", "31,986 lb"
export function lb( kg, digits ) {

	const v = kg * LB_PER_KG;
	const d = digits ?? ( v < 10 ? 2 : v < 1000 ? 1 : 0 );
	return `${ num( v, d ) } lb`;

}

// a length from cm: inches up to 8 ft, then feet and inches ("14.2 in", "30 ft 9 in")
export function len( cm ) {

	const inch = cm * IN_PER_CM;
	if ( inch < 96 ) return `${ num( inch, inch < 10 ? 1 : 1 ) } in`;
	const ft = Math.floor( inch / 12 ), rest = Math.round( inch - ft * 12 );
	return rest === 12 ? `${ ft + 1 } ft` : `${ ft } ft ${ rest } in`;

}

// distances / ranges from metres: "245 ft", "2,953 ft"
export function ft( m ) {

	return `${ num( Math.round( m * FT_PER_M ), 0 ) } ft`;

}

// depth from metres with one decimal below 100 ft: "18.4 ft"
export function depth( m ) {

	const v = m * FT_PER_M;
	return `${ num( v, v < 100 ? 1 : 0 ) } ft`;

}

// fuel from litres: "10.6 gal", "317 gal"
export function gal( l ) {

	const v = l * GAL_PER_L;
	return `${ num( v, v < 20 ? 1 : 0 ) } gal`;

}

// a price per litre shown per gallon: "$75.71"
export function perGallon( pricePerLitre ) {

	return `$${ num( pricePerLitre / GAL_PER_L, 2 ) }`;

}

// wind / speed from m/s: "12.3 mph"
export function mph( ms ) {

	return `${ num( ms * 2.23694, 1 ) } mph`;

}
