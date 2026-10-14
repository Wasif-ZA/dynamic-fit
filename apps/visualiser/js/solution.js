export async function loadSceneData( jsonPath ) {
  const response = await fetch( jsonPath );
  if ( !response.ok ) {
    const error = new Error( `Failed to load ${ jsonPath }: ${ response.status }` );
    error.status = response.status;
    throw error;
  }
  return response.json();
}

/* Default: fixture named on the canvas. ?solution=<url> loads that URL instead (same origin or loopback only). */
export function solutionSource( canvas ) {
  const requested = new URLSearchParams( window.location.search ).get( 'solution' );
  if ( !requested ) {
    return canvas.dataset.json;
  }

  let target;
  try {
    target = new URL( requested, window.location.href );
  } catch {
    console.error( `Ignoring unreadable ?solution= value: ${ requested }` );
    return canvas.dataset.json;
  }

  const loopback = [ '127.0.0.1', 'localhost', '::1' ];
  const allowed =
    target.origin === window.location.origin ||
    ( [ 'http:', 'https:' ].includes( target.protocol ) && loopback.includes( target.hostname ) );

  if ( !allowed ) {
    console.error( `Ignoring off-origin ?solution= host: ${ target.host }` );
    return canvas.dataset.json;
  }

  return target.href;
}
