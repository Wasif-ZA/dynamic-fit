import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadSceneData, resolveAllowedUrl, solutionSource } from '../../js/solution.js';

describe( 'loadSceneData (Req01)', () => {
  afterEach( () => {
    vi.unstubAllGlobals();
  } );

  it( 'fetches the path and returns the parsed JSON', async () => {
    const data = { cartons: [], rejects: [] };
    const fetchMock = vi.fn().mockResolvedValue( { ok: true, status: 200, json: async () => data } );
    vi.stubGlobal( 'fetch', fetchMock );

    await expect( loadSceneData( '/fixtures/x.json' ) ).resolves.toEqual( data );
    expect( fetchMock ).toHaveBeenCalledWith( '/fixtures/x.json' );
  } );

  it( 'throws an error carrying the HTTP status when the file is missing (Req06)', async () => {
    vi.stubGlobal( 'fetch', vi.fn().mockResolvedValue( { ok: false, status: 404 } ) );

    const error = await loadSceneData( '/missing.json' ).catch( ( e ) => e );
    expect( error ).toBeInstanceOf( Error );
    expect( error.status ).toBe( 404 );
    expect( error.message ).toContain( '/missing.json' );
  } );

  it( 'rejects when the body is not valid JSON (Req06)', async () => {
    vi.stubGlobal( 'fetch', vi.fn().mockResolvedValue( {
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError( 'Unexpected token' ); },
    } ) );

    await expect( loadSceneData( '/bad.json' ) ).rejects.toThrow( SyntaxError );
  } );

  it( 'rejects when the network fails', async () => {
    vi.stubGlobal( 'fetch', vi.fn().mockRejectedValue( new TypeError( 'Failed to fetch' ) ) );
    await expect( loadSceneData( '/x.json' ) ).rejects.toThrow( 'Failed to fetch' );
  } );
} );

describe( 'solutionSource', () => {
  const canvas = { dataset: { json: '/fixtures/default.json' } };

  function setQuery( query ) {
    window.history.replaceState( {}, '', `/${ query }` );
  }

  beforeEach( () => {
    vi.spyOn( console, 'error' ).mockImplementation( () => {} );
  } );

  afterEach( () => {
    setQuery( '' );
  } );

  it( 'uses the canvas data-json attribute by default', () => {
    setQuery( '' );
    expect( solutionSource( canvas ) ).toBe( '/fixtures/default.json' );
  } );

  it( 'uses ?solution= for a same-origin path', () => {
    setQuery( '?solution=/fixtures/03_multi_carton.json' );
    expect( solutionSource( canvas ) ).toBe( `${ window.location.origin }/fixtures/03_multi_carton.json` );
  } );

  it.each( [
    'http://localhost:9000/sol.json',
    'http://127.0.0.1:8080/sol.json',
    'https://localhost/sol.json',
    'http://[::1]:5000/sol.json',
  ] )( 'allows loopback URL %s', ( url ) => {
    setQuery( `?solution=${ encodeURIComponent( url ) }` );
    expect( solutionSource( canvas ) ).toBe( new URL( url ).href );
  } );

  it.each( [
    'https://evil.example.com/sol.json',
    '//evil.example.com/sol.json',
    'ftp://localhost/sol.json',
    'javascript:alert(1)',
    'data:application/json,{}',
  ] )( 'ignores off-origin or non-http URL %s and falls back to the default', ( url ) => {
    setQuery( `?solution=${ encodeURIComponent( url ) }` );
    expect( solutionSource( canvas ) ).toBe( '/fixtures/default.json' );
    expect( console.error ).toHaveBeenCalled();
  } );

  it( 'falls back to the default for an unparseable URL', () => {
    setQuery( `?solution=${ encodeURIComponent( 'http://[bad' ) }` );
    expect( solutionSource( canvas ) ).toBe( '/fixtures/default.json' );
    expect( console.error ).toHaveBeenCalled();
  } );
} );

describe( 'resolveAllowedUrl (shared by ?solution= and ?portal=)', () => {
  beforeEach( () => {
    vi.spyOn( console, 'error' ).mockImplementation( () => {} );
  } );

  it( 'returns the fallback when nothing is requested', () => {
    expect( resolveAllowedUrl( null, '/portal' ) ).toBe( '/portal' );
    expect( resolveAllowedUrl( '', '/portal' ) ).toBe( '/portal' );
  } );

  it( 'resolves a same-origin path against the page', () => {
    expect( resolveAllowedUrl( '/orders/done', '/portal' ) ).toBe( `${ window.location.origin }/orders/done` );
  } );

  it( 'allows loopback hosts', () => {
    expect( resolveAllowedUrl( 'http://127.0.0.1:9000/p', '/portal' ) ).toBe( 'http://127.0.0.1:9000/p' );
  } );

  it( 'falls back for other hosts and non-http URLs', () => {
    expect( resolveAllowedUrl( 'https://evil.example.com/p', '/portal' ) ).toBe( '/portal' );
    expect( resolveAllowedUrl( 'javascript:alert(1)', '/portal' ) ).toBe( '/portal' );
  } );

  it( 'allows the hosted Portal addresses it is given', () => {
    const portal = 'https://dynamicfit.example.dev';
    expect( resolveAllowedUrl( `${ portal }/packing-return`, '/portal', [ portal ] ) ).toBe( `${ portal }/packing-return` );
    expect( resolveAllowedUrl( `${ portal }/packing-return`, '/portal', [ null ] ) ).toBe( '/portal' );
    expect( resolveAllowedUrl( 'https://evil.example.com/p', '/portal', [ portal ] ) ).toBe( '/portal' );
  } );
} );
