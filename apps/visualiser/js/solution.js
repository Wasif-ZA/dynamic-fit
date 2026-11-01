export async function loadSceneData( jsonPath ) {
  const response = await fetch( jsonPath );
  if ( !response.ok ) {
    const error = new Error( `Failed to load ${ jsonPath }: ${ response.status }` );
    error.status = response.status;
    throw error;
  }
  return response.json();
}

/* The hosted Portal's addresses, set at build time. Locally both are loopback, which is
 * already allowed. VITE_PORTAL_API_BASE serves solutions; VITE_PORTAL_BASE is the website
 * that Done and Cancel return to. */
function originOf( base ) {
  try {
    return base ? new URL( base ).origin : null;
  } catch {
    return null;
  }
}
export const PORTAL_API_ORIGIN = originOf( import.meta.env.VITE_PORTAL_API_BASE );
export const PORTAL_ORIGIN = originOf( import.meta.env.VITE_PORTAL_BASE );

/* Resolves `requested` (a possibly-relative URL) against the page, but only if it stays
 * same-origin, loopback, or one of `trustedOrigins`; otherwise falls back to `fallback`.
 * Shared by ?solution= (below) and ?portal= (js/portalActions.js) so both query params get
 * the same safety check. */
export function resolveAllowedUrl( requested, fallback, trustedOrigins = [] ) {
  if ( !requested ) {
    return fallback;
  }

  let target;
  try {
    target = new URL( requested, window.location.href );
  } catch {
    console.error( `Ignoring unreadable URL value: ${ requested }` );
    return fallback;
  }

  const loopback = [ '127.0.0.1', 'localhost', '[::1]' ]; // URL.hostname keeps the brackets on IPv6
  const allowed =
    target.origin === window.location.origin ||
    ( [ 'http:', 'https:' ].includes( target.protocol ) && loopback.includes( target.hostname ) ) ||
    trustedOrigins.filter( Boolean ).includes( target.origin );

  if ( !allowed ) {
    console.error( `Ignoring off-origin host: ${ target.host }` );
    return fallback;
  }

  return target.href;
}

/* Default: fixture named on the canvas. ?solution=<url> loads that URL instead (same origin,
 * loopback, or the hosted Portal API). */
export function solutionSource( canvas ) {
  const requested = new URLSearchParams( window.location.search ).get( 'solution' );
  return resolveAllowedUrl( requested, canvas.dataset.json, [ PORTAL_API_ORIGIN ] );
}
