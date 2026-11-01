export async function loadSceneData( jsonPath ) {
  const response = await fetch( jsonPath );
  if ( !response.ok ) {
    const error = new Error( `Failed to load ${ jsonPath }: ${ response.status }` );
    error.status = response.status;
    throw error;
  }
  return response.json();
}

/* Resolves `requested` (a possibly-relative URL) against the page, but only if it stays
 * same-origin or loopback; otherwise falls back to `fallback`. Shared by ?solution= (below)
 * and ?portal= (js/portalActions.js) so both query params get the same safety check. */
export function resolveAllowedUrl( requested, fallback ) {
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
    ( [ 'http:', 'https:' ].includes( target.protocol ) && loopback.includes( target.hostname ) );

  if ( !allowed ) {
    console.error( `Ignoring off-origin host: ${ target.host }` );
    return fallback;
  }

  return target.href;
}

/* Default: fixture named on the canvas. ?solution=<url> loads that URL instead (same origin or loopback only). */
export function solutionSource( canvas ) {
  const requested = new URLSearchParams( window.location.search ).get( 'solution' );
  return resolveAllowedUrl( requested, canvas.dataset.json );
}
