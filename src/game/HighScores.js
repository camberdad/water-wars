import { FISH } from './FishTable.js';
import { BOATS } from './BoatCatalog.js';
import { DANGER_TIERS, dangerZoneAt } from './DangerZones.js';

/* ============ Water Wars :: shared high-score board (Firebase Realtime Database) ============ */
/*
  The board lives in the game's own Firebase project (Water Wars 1.22: it was a jsonbin.io bin), in its
  Realtime Database, read and written straight from the page over Firebase's REST API (no SDK):

    /scores/<captain>   one row per captain: { name, score, cash, fish, species, pirates, giants, furthest,
                        boat, timePlayed, active, t }   (<captain>: rowId( name ), the name lower-cased)

  While you play, your row is written every SYNC_SECONDS of active play, marked "active". A row counts as
  active for ACTIVE_MS after its last sync, so the board shows who is out on the water right now. The
  High Scores screen (start screen button, or K in game) re-reads the top MAX_ENTRIES every POLL_MS while
  it is open.

  The database's rules (firebase/database.rules.json, set in the Firebase console) let anyone read the
  board and write a row, but only a well-formed one (every field checked: types, lengths, ranges, no
  extra fields), never a delete, and never one that lowers a captain's earnings or time at sea. A write
  the rules turn down (this captain has a better row from another device) is merged with the row that's
  there and written again.

  To point the game at another database: put its URL below. Leave it empty to run offline: scores are
  still kept on this device and the board shows them.
*/
export const LEADERBOARD_CONFIG = {
	// the Water Wars Firebase project's Realtime Database (Firebase console: Build > Realtime Database)
	DATABASE_URL: 'https://water-wars-a96d2-default-rtdb.firebaseio.com',
	PATH: 'scores',
	MAX_ENTRIES: 100, // the board shows (and reads) the top 100
	MAX_MONEY: 1e11,
	SYNC_SECONDS: 10, // write your row this often while playing
	ACTIVE_MS: 45000, // a row is "active" this long after its last write
	POLL_MS: 15000, // the open board re-reads this often
};

// a captain's key in the database: their name lower-cased, anything but a-z 0-9 _ - spelled out as ~hex
// (keys can't hold . $ # [ ] /; one key per name, as the board has always merged names case-blind)
export const rowId = ( name ) => playerKey( name ).replace( /[^a-z0-9_-]/g, ( c ) => '~' + c.codePointAt( 0 ).toString( 16 ) );

const LOCAL_KEY = 'waterwars.highscores';
const TIME_KEY = 'waterwars.playtime';

export const playerKey = ( name ) => String( name || 'Captain' ).trim().toLowerCase() || 'captain';
const int = ( v, max = Infinity ) => Math.max( 0, Math.min( max, Math.floor( Number( v ) || 0 ) ) );

// one clean row: names are trimmed and capped, numbers clamped, active only while fresh
export function sanitize( e, now = Date.now(), cfg = LEADERBOARD_CONFIG ) {

	e = e || {};
	const t = Number( e.t ) || now;
	return {
		name: String( e.name || 'Captain' ).trim().slice( 0, 18 ) || 'Captain',
		score: int( e.score, cfg.MAX_MONEY ),
		cash: int( e.cash, cfg.MAX_MONEY ),
		fish: int( e.fish, 1e7 ),
		species: int( e.species, 1000 ),
		pirates: int( e.pirates, 1e7 ),
		giants: int( e.giants, 1e6 ),
		furthest: int( e.furthest, 3 ),
		boat: String( e.boat || '' ).slice( 0, 32 ),
		timePlayed: e.timePlayed == null ? 0 : int( e.timePlayed, 1e9 ),
		active: !! e.active && now - t < cfg.ACTIVE_MS,
		t: Math.floor( t ),
	};

}

export function sortBoard( list ) {

	return list.sort( ( a, b ) => ( b.score - a.score ) || ( b.fish - a.fish ) || ( b.timePlayed - a.timePlayed ) );

}

// Names are the only identity the board has: one row per name (case-insensitive) with the best of
// each stat; "active" and the boat follow the newest row.
export function oneRunPerPlayer( list ) {

	sortBoard( list );
	const seen = new Map(), out = [];
	for ( const e of list ) {

		const k = playerKey( e.name );
		const kept = seen.get( k );
		if ( ! kept ) {

			seen.set( k, e );
			out.push( e );
			continue;

		}

		for ( const f of [ 'cash', 'fish', 'species', 'pirates', 'giants', 'furthest', 'timePlayed' ] ) kept[ f ] = Math.max( Number( kept[ f ] ) || 0, Number( e[ f ] ) || 0 );
		if ( ( Number( e.t ) || 0 ) >= ( Number( kept.t ) || 0 ) ) {

			kept.active = !! e.active;
			kept.t = Number( e.t ) || Date.now();
			if ( e.boat ) kept.boat = e.boat;

		}

	}

	return sortBoard( out );

}

// the rows of a database read: { key: row, ... } (or null when there are none)
const scoresOf = ( d ) => d && typeof d === 'object' ? Object.values( d ).filter( ( r ) => r && typeof r === 'object' ) : [];

function safeStorage() {

	try {

		return typeof localStorage !== 'undefined' ? localStorage : null;

	} catch ( e ) {

		return null;

	}

}

// The board itself: a local copy (always written first, so nothing is lost) with the shared bin on top.
export class Leaderboard {

	constructor( { fetch: fetchFn = typeof fetch === 'function' ? fetch.bind( globalThis ) : null, storage = safeStorage(), config = LEADERBOARD_CONFIG, now = () => Date.now() } = {} ) {

		this.fetch = fetchFn;
		this.storage = storage;
		this.cfg = config;
		this.now = now;
		this.times = this._load( TIME_KEY, { players: {} } ).players || {};
		for ( const r of Object.values( this.times ) ) {

			r.syncing = false;
			r.retryAt = 0;

		}

		this._queue = Promise.resolve();

	}

	configured() {

		return !! ( this.cfg.DATABASE_URL && this.fetch );

	}

	_load( key, fallback ) {

		try {

			const raw = this.storage && this.storage.getItem( key );
			return raw ? JSON.parse( raw ) : fallback;

		} catch ( e ) {

			return fallback;

		}

	}

	_save( key, v ) {

		try {

			if ( this.storage ) this.storage.setItem( key, JSON.stringify( v ) );

		} catch ( e ) { /* storage full or blocked */ }

	}

	localScores() {

		const v = this._load( LOCAL_KEY, null );
		return v && Array.isArray( v.scores ) ? v.scores : [];

	}

	_setLocal( scores ) {

		this._save( LOCAL_KEY, { scores } );

	}

	// the REST URL of the board, or of one captain's row; query: extra search parameters
	_url( id = null, query = '' ) {

		const base = String( this.cfg.DATABASE_URL ).replace( /\/+$/, '' );
		return `${ base }/${ this.cfg.PATH }${ id ? '/' + encodeURIComponent( id ) : '' }.json${ query ? '?' + query : '' }`;

	}

	// the top MAX_ENTRIES rows by earnings
	async _get() {

		const q = `orderBy=${ encodeURIComponent( '"score"' ) }&limitToLast=${ this.cfg.MAX_ENTRIES }`;
		const r = await this.fetch( this._url( null, q ), { cache: 'no-store' } );
		if ( ! r.ok ) throw new Error( 'http ' + r.status );
		return scoresOf( await r.json() );

	}

	async _getRow( id ) {

		const r = await this.fetch( this._url( id ), { cache: 'no-store' } );
		if ( ! r.ok ) throw new Error( 'http ' + r.status );
		const v = await r.json();
		return v && typeof v === 'object' ? v : null;

	}

	// write a captain's row; false if the database's rules turned it down
	async _put( row ) {

		const r = await this.fetch( this._url( rowId( row.name ) ), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( row ) } );
		if ( r.status === 401 || r.status === 403 ) return false;
		if ( ! r.ok ) throw new Error( 'http ' + r.status );
		return true;

	}

	// ---- time at sea, per captain name (kept locally, the bin's figure wins when it is higher)
	playerTime( name ) {

		const k = playerKey( name );
		if ( ! this.times[ k ] ) {

			const cached = this.localScores().find( ( s ) => playerKey( s.name ) === k );
			this.times[ k ] = { total: cached ? int( cached.timePlayed ) : 0, pending: 0, syncing: false, retryAt: 0, saveAcc: 0 };

		}

		return this.times[ k ];

	}

	_saveTimes() {

		const players = {};
		for ( const [ k, r ] of Object.entries( this.times ) ) players[ k ] = { total: r.total, pending: r.pending };
		this._save( TIME_KEY, { players } );

	}

	// Call every frame of active play: adds dt seconds to the captain's time and, every SYNC_SECONDS,
	// pushes their row (snapshot() gives the current stats) to the shared board marked active.
	trackTime( name, dt, snapshot ) {

		dt = Number( dt );
		if ( ! name || ! isFinite( dt ) || dt <= 0 ) return;
		dt = Math.min( dt, 30 );
		const r = this.playerTime( name );
		r.total += dt;
		r.pending += dt;
		r.saveAcc = ( r.saveAcc || 0 ) + dt;
		if ( r.saveAcc >= 5 ) {

			r.saveAcc = 0;
			this._saveTimes();

		}

		if ( r.syncing || r.pending < this.cfg.SYNC_SECONDS || this.now() < r.retryAt ) return;
		r.syncing = true;
		const entry = { ...( typeof snapshot === 'function' ? snapshot() : snapshot ), name, timePlayed: Math.floor( r.total ), active: true, t: this.now() };
		this.submit( entry ).then( ( res ) => {

			r.syncing = false;
			r.retryAt = res.ok ? 0 : this.now() + 5000;
			if ( ! res.ok ) return;
			r.pending = 0;
			const row = res.scores.find( ( s ) => playerKey( s.name ) === playerKey( name ) );
			if ( row ) r.total = Math.max( r.total, int( row.timePlayed ) );
			this._saveTimes();

		} );

	}

	// Submit a row: 1. into the local board, always; 2. if configured, write the captain's row (the best of
	// it and this device's copy) to the database; if the rules turn it down (a better row is there, from
	// another device), merge with that one and write again. One write at a time. Resolves { ok, scores, reason }.
	submit( entry ) {

		entry = sanitize( entry, this.now(), this.cfg );
		const local = oneRunPerPlayer( [ ...this.localScores().map( ( s ) => sanitize( s, this.now(), this.cfg ) ), entry ] ).slice( 0, this.cfg.MAX_ENTRIES );
		this._setLocal( local );
		if ( ! this.configured() ) return Promise.resolve( { ok: false, scores: local, reason: 'unconfigured' } );

		const job = async () => {

			const mine = local.find( ( s ) => playerKey( s.name ) === playerKey( entry.name ) ) || entry;
			let row = { ...mine, name: entry.name, active: entry.active, t: entry.t, boat: entry.boat || mine.boat };
			if ( ! ( await this._put( row ) ) ) {

				const there = await this._getRow( rowId( entry.name ) );
				row = oneRunPerPlayer( [ sanitize( there, this.now(), this.cfg ), row ] )[ 0 ];
				row = { ...row, name: entry.name, active: entry.active, t: entry.t };
				if ( ! ( await this._put( row ) ) ) throw new Error( 'rejected' );

			}

			return oneRunPerPlayer( [ ...local.filter( ( s ) => playerKey( s.name ) !== playerKey( entry.name ) ), row ] ).slice( 0, this.cfg.MAX_ENTRIES );

		};

		const run = this._queue.then( job, job );
		this._queue = run.catch( () => {} );
		return run.then( ( scores ) => {

			this._setLocal( scores );
			return { ok: true, scores, reason: '' };

		}, () => ( { ok: false, scores: this.localScores(), reason: 'offline' } ) );

	}

	// the board to show: the shared one when it can be reached, else this device's
	async fetchBoard() {

		const overlay = ( list ) => {

			for ( const row of list ) {

				const r = this.times[ playerKey( row.name ) ];
				if ( r ) row.timePlayed = Math.max( row.timePlayed || 0, Math.floor( r.total ) );

			}

			return list;

		};

		const local = () => overlay( oneRunPerPlayer( this.localScores().map( ( s ) => sanitize( s, this.now(), this.cfg ) ) ) );
		if ( ! this.configured() ) return { online: false, scores: local(), reason: 'unconfigured' };
		try {

			const scores = ( await this._get() ).map( ( s ) => sanitize( s, this.now(), this.cfg ) );
			return { online: true, scores: overlay( oneRunPerPlayer( scores ) ), reason: '' };

		} catch ( e ) {

			return { online: false, scores: local(), reason: 'offline' };

		}

	}

}

// the stats a captain's row shows, from the save
export function snapshotOf( state ) {

	let fish = 0, giants = 0, species = 0;
	for ( const [ id, e ] of Object.entries( state.log || {} ) ) {

		const n = int( e && e.count );
		if ( ! n || ! FISH[ id ] ) continue;
		fish += n;
		species ++;
		if ( FISH[ id ].tier === 'giant' ) giants += n;

	}

	const b = BOATS[ state.boat ];
	return {
		score: Math.round( state.earned || 0 ),
		cash: Math.round( state.money || 0 ),
		fish, species, giants,
		pirates: int( state.pirate && state.pirate.piratesSunk ),
		furthest: int( state.furthest, 3 ),
		boat: b ? b.name : '',
	};

}

export function formatPlayedTime( s ) {

	s = int( s );
	const h = Math.floor( s / 3600 ), m = Math.floor( ( s % 3600 ) / 60 );
	if ( h ) return `${ h }h ${ String( m ).padStart( 2, '0' ) }m`;
	if ( m ) return `${ m }m ${ String( s % 60 ).padStart( 2, '0' ) }s`;
	return `${ s }s`;

}

const money = ( v ) => '$' + Math.round( v || 0 ).toLocaleString( 'en-US' );
const TIER_LABEL = [ 'Harbour', ...DANGER_TIERS.map( ( t ) => t.name ) ];
const TIER_COLOR = [ '#9fd8c8', ...DANGER_TIERS.map( ( t ) => t.color ) ];

// The game side: tracks the captain's play time and pushes their row while they sail, and the High
// Scores screen (start-screen button, or K in game).
export class HighScores {

	constructor( game, board = new Leaderboard() ) {

		this.game = game;
		this.board = board;
		this.name = '';
		this.isOpen = false;
		this._poll = 0;
		this._el = null;
		if ( typeof window !== 'undefined' ) window.addEventListener( 'keydown', ( e ) => this._onKey( e ), true );

	}

	// the captain name from the start screen; from now on their time at sea counts
	start( name ) {

		this.name = String( name || '' ).trim().slice( 0, 18 );

	}

	// every frame of play
	update( dt ) {

		if ( ! this.name || ( typeof document !== 'undefined' && document.hidden ) ) return;
		const app = this.game.app, st = this.game.state;
		const p = app.player;
		if ( p && ( p.mode === 'boat' || p.mode === 'deck' ) && app.boatCtl ) {

			const z = dangerZoneAt( app.boatCtl.position.x, app.boatCtl.position.z );
			if ( z && z.tier > ( st.furthest || 0 ) ) st.furthest = z.tier;

		}

		this.board.trackTime( this.name, dt, () => snapshotOf( st ) );

	}

	toggle( force ) {

		( force ?? ! this.isOpen ) ? this.open() : this.close();

	}

	open() {

		if ( typeof document === 'undefined' ) return;
		this._build();
		this.isOpen = true;
		this._el.classList.add( 'is-open' );
		this._el.hidden = false;
		const inp = this.game.app && this.game.app.input;
		if ( inp ) inp.enabled = false;
		try {

			if ( document.pointerLockElement && document.exitPointerLock ) document.exitPointerLock();

		} catch ( e ) { /* ignore */ }

		this._status.textContent = this.board.configured() ? 'Live' : 'Local';
		this._body.innerHTML = '<div class="ww-hs-empty">Loading…</div>';
		this.refresh();
		clearInterval( this._poll );
		this._poll = setInterval( () => {

			if ( this.isOpen && ! document.hidden ) this.refresh();

		}, this.board.cfg.POLL_MS );

	}

	close() {

		if ( ! this._el ) return;
		this.isOpen = false;
		this._el.classList.remove( 'is-open' );
		this._el.hidden = true;
		clearInterval( this._poll );
		const inp = this.game.app && this.game.app.input;
		if ( inp ) inp.enabled = true;

	}

	_onKey( e ) {

		if ( ! this.isOpen ) return;
		if ( e.code === 'Escape' || e.code === 'KeyK' || e.code === 'Space' ) {

			e.preventDefault();
			this.close();

		}

		// nothing else reaches the game (or the start screen) while the board is up
		e.stopImmediatePropagation();

	}

	async refresh() {

		const res = await this.board.fetchBoard();
		if ( this.isOpen ) this._render( res );

	}

	_render( { online, scores } ) {

		const s = this._status;
		s.textContent = online ? 'Live' : 'Local';
		s.classList.toggle( 'is-live', online );
		const note = online
			? `Global board · ranked by lifetime earnings. Rows sync about every ${ this.board.cfg.SYNC_SECONDS } seconds of play; green rows are at sea right now. Refreshes every ${ Math.round( this.board.cfg.POLL_MS / 1000 ) } s.`
			: this.board.configured() ? 'Could not reach the global board · showing this device\'s scores.' : 'Offline board · showing this device\'s scores.';
		const me = playerKey( this.name || ( () => {

			try {

				return localStorage.getItem( 'waterwars.name' );

			} catch ( e ) {

				return '';

			}

		} )() );
		const body = this._body;
		body.innerHTML = '';
		const n = document.createElement( 'div' );
		n.className = 'ww-hs-note';
		n.textContent = note;
		body.append( n );
		if ( ! scores.length ) {

			const e = document.createElement( 'div' );
			e.className = 'ww-hs-empty';
			e.textContent = 'No scores yet · set sail and make your fortune!';
			body.append( e );
			return;

		}

		const wrap = document.createElement( 'div' );
		wrap.className = 'ww-hs-scroll';
		const tbl = document.createElement( 'table' );
		tbl.className = 'ww-hs-table';
		tbl.innerHTML = '<thead><tr><th>#</th><th class="l">Captain</th><th>Earned</th><th>Fish</th><th>Pirates sunk</th><th>Giants</th><th class="l">Furthest</th><th class="l">Boat</th><th>Time at sea</th></tr></thead>';
		const tb = document.createElement( 'tbody' );
		scores.slice( 0, 100 ).forEach( ( r, i ) => {

			const tr = document.createElement( 'tr' );
			if ( r.active ) tr.classList.add( 'is-active' );
			if ( me && playerKey( r.name ) === me ) tr.classList.add( 'is-mine' );
			const cells = [
				[ String( i + 1 ) ],
				[ ( r.active ? '● ' : '' ) + r.name, 'l name' ],
				[ money( r.score ), 'money' ],
				[ r.fish.toLocaleString( 'en-US' ) + ( r.species ? ` · ${ r.species } sp.` : '' ) ],
				[ r.pirates.toLocaleString( 'en-US' ) ],
				[ String( r.giants ) ],
				[ TIER_LABEL[ r.furthest ] || '—', 'l tier' ],
				[ r.boat || '—', 'l' ],
				[ formatPlayedTime( r.timePlayed ) ],
			];
			for ( const [ text, cls ] of cells ) {

				const td = document.createElement( 'td' );
				td.textContent = text;
				if ( cls ) td.className = cls;
				if ( cls && cls.includes( 'tier' ) ) td.style.color = TIER_COLOR[ r.furthest ] || '';
				tr.append( td );

			}

			tb.append( tr );

		} );
		tbl.append( tb );
		wrap.append( tbl );
		body.append( wrap );

	}

	_build() {

		if ( this._el ) return;
		const st = document.createElement( 'style' );
		st.textContent = `
.ww-hs{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:rgba(2,8,14,0.62);backdrop-filter:blur(6px);font:500 14px Inter,system-ui,sans-serif;color:#e8f2f8}
.ww-hs[hidden]{display:none}
.ww-hs-panel{width:min(980px,100%);max-height:min(720px,100%);display:flex;flex-direction:column;background:rgba(10,22,32,0.94);border:1px solid rgba(255,255,255,0.14);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.5);overflow:hidden}
.ww-hs-head{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.1)}
.ww-hs-title{font:800 20px Inter,system-ui,sans-serif;letter-spacing:0.08em}
.ww-hs-status{font:700 11px 'JetBrains Mono',ui-monospace,monospace;letter-spacing:0.1em;text-transform:uppercase;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,0.1);color:#b8c6d0}
.ww-hs-status.is-live{background:rgba(70,200,130,0.18);color:#7fe0a8}
.ww-hs-close{margin-left:auto;height:32px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,0.25);background:transparent;color:#e8f2f8;font:600 13px Inter,system-ui,sans-serif;cursor:pointer}
.ww-hs-close:hover{background:rgba(255,255,255,0.1)}
.ww-hs-body{padding:12px 20px 20px;overflow:auto;min-height:0}
.ww-hs-note{font-size:12.5px;color:#9fb2c0;margin:0 0 12px}
.ww-hs-empty{padding:40px 0;text-align:center;color:#9fb2c0}
.ww-hs-scroll{overflow-x:auto}
.ww-hs-table{width:100%;border-collapse:separate;border-spacing:0 3px;font-variant-numeric:tabular-nums;white-space:nowrap}
.ww-hs-table th{font:700 11px Inter,system-ui,sans-serif;letter-spacing:0.06em;text-transform:uppercase;color:#8aa0b0;text-align:right;padding:4px 10px}
.ww-hs-table td{text-align:right;padding:7px 10px;background:rgba(255,255,255,0.04)}
.ww-hs-table td:first-child{border-radius:8px 0 0 8px;color:#8aa0b0}
.ww-hs-table td:last-child{border-radius:0 8px 8px 0}
.ww-hs-table .l{text-align:left}
.ww-hs-table td.name{font-weight:700}
.ww-hs-table td.money{color:#ffd66a;font-weight:700}
.ww-hs-table tr.is-active td{background:rgba(70,160,110,0.16)}
.ww-hs-table tr.is-active td.name{color:#7fe0a8}
.ww-hs-table tr.is-mine td{box-shadow:inset 0 1px 0 rgba(255,214,106,0.5),inset 0 -1px 0 rgba(255,214,106,0.5)}
.ww-hs-table tr.is-mine td:first-child{box-shadow:inset 1px 1px 0 rgba(255,214,106,0.5),inset 0 -1px 0 rgba(255,214,106,0.5)}
.ww-hs-table tr.is-mine td:last-child{box-shadow:inset -1px 1px 0 rgba(255,214,106,0.5),inset 0 -1px 0 rgba(255,214,106,0.5)}
.ww-hs-foot{font-size:11.5px;color:#7d90a0;padding:0 20px 14px}
@media (max-width:600px){.ww-hs{padding:8px}.ww-hs-head{padding:12px 14px}.ww-hs-body{padding:10px 12px 14px}.ww-hs-title{font-size:17px}}`;
		document.head.append( st );
		const el = this._el = document.createElement( 'div' );
		el.className = 'ww-hs';
		el.hidden = true;
		el.innerHTML = `<div class="ww-hs-panel" role="dialog" aria-label="High scores">
			<div class="ww-hs-head"><span class="ww-hs-title">🏆 HIGH SCORES</span><span class="ww-hs-status">Live</span><button type="button" class="ww-hs-close">Close (Esc / Space)</button></div>
			<div class="ww-hs-body"></div>
			<div class="ww-hs-foot">Press K in game to open this board.</div>
		</div>`;
		this._status = el.querySelector( '.ww-hs-status' );
		this._body = el.querySelector( '.ww-hs-body' );
		el.querySelector( '.ww-hs-close' ).addEventListener( 'click', () => this.close() );
		// clicks stay on the board (the start screen behind would set sail)
		for ( const t of [ 'click', 'pointerdown', 'mousedown', 'wheel', 'touchstart' ] ) el.addEventListener( t, ( e ) => e.stopPropagation(), { passive: t === 'wheel' || t === 'touchstart' } );
		el.addEventListener( 'click', ( e ) => {

			if ( e.target === el ) this.close();

		} );
		document.body.append( el );

	}

}
