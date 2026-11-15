// Water Wars version, shown on the loading and start screens. The single source is package.json
// ("version"): vite.config.js passes it in as VITE_APP_VERSION. Bump it there for each release.
export const VERSION = ( import.meta.env && import.meta.env.VITE_APP_VERSION ) || 'dev';
