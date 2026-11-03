import { describe, expect, it } from 'vitest';

import { fixtureNames, loadFixture } from './fixtures.js';

// These checks keep the sample solver outputs honest so the other tests
// (and manual testing with ?solution=) are run against sensible data.

const isTriple = ( v ) => Array.isArray( v ) && v.length === 3 && v.every( Number.isFinite );

function overlaps( a, b ) {
  return [ 0, 1, 2 ].every( ( i ) =>
    a.position[ i ] < b.position[ i ] + b.dims[ i ] && b.position[ i ] < a.position[ i ] + a.dims[ i ] );
}

it( 'finds the fixture files', () => {
  expect( fixtureNames.length ).toBeGreaterThan( 0 );
} );

describe.each( fixtureNames )( 'fixture %s', ( name ) => {
  const data = loadFixture( name );

  it( 'has cartons and rejects arrays', () => {
    expect( Array.isArray( data.cartons ) ).toBe( true );
    expect( Array.isArray( data.rejects ) ).toBe( true );
  } );

  it( 'uses mm / g, Z-up, min-corner origin', () => {
    expect( data.units ).toEqual( { length: 'mm', mass: 'g' } );
    expect( data.coordinate_system?.up ).toBe( 'z' );
    expect( data.coordinate_system?.origin ).toBe( 'min_corner' );
  } );

  it( 'has the fields the visualiser reads on every carton and placement', () => {
    for ( const carton of data.cartons ) {
      expect( typeof carton.carton_id ).toBe( 'string' );
      expect( typeof carton.sku ).toBe( 'string' );
      expect( isTriple( carton.inner_dims ) ).toBe( true );
      expect( Number.isFinite( carton.contents_mass ) ).toBe( true );
      expect( Array.isArray( carton.placements ) ).toBe( true );

      for ( const p of carton.placements ) {
        expect( typeof p.item_ref ).toBe( 'string' );
        expect( typeof p.label ).toBe( 'string' );
        expect( isTriple( p.position ) ).toBe( true );
        expect( isTriple( p.dims ) ).toBe( true );
        expect( Number.isFinite( p.mass ) ).toBe( true );
        expect( Array.isArray( p.tags ) ).toBe( true );
      }
    }
  } );

  it( 'has the fields the visualiser reads on every reject', () => {
    for ( const reject of data.rejects ) {
      expect( typeof reject.item_ref ).toBe( 'string' );
      expect( typeof reject.reason_code ).toBe( 'string' );
      expect( typeof reject.message ).toBe( 'string' );
    }
  } );

  it( 'keeps every placement inside its carton', () => {
    for ( const carton of data.cartons ) {
      for ( const p of carton.placements ) {
        [ 0, 1, 2 ].forEach( ( i ) => {
          expect( p.position[ i ] ).toBeGreaterThanOrEqual( 0 );
          expect( p.position[ i ] + p.dims[ i ] ).toBeLessThanOrEqual( carton.inner_dims[ i ] );
        } );
      }
    }
  } );

  it( 'has no overlapping placements', () => {
    for ( const carton of data.cartons ) {
      const ps = carton.placements;
      for ( let i = 0; i < ps.length; i++ ) {
        for ( let j = i + 1; j < ps.length; j++ ) {
          expect( overlaps( ps[ i ], ps[ j ] ), `${ carton.carton_id }: ${ ps[ i ].placement_id } vs ${ ps[ j ].placement_id }` ).toBe( false );
        }
      }
    }
  } );

  it( 'lists placements in packing order (the LEGO steps follow array order)', () => {
    for ( const carton of data.cartons ) {
      const seq = carton.placements.map( ( p ) => p.sequence );
      expect( seq ).toEqual( [ ...seq ].sort( ( a, b ) => a - b ) );
    }
  } );

  it( 'has contents_mass equal to the sum of placement masses', () => {
    for ( const carton of data.cartons ) {
      const total = carton.placements.reduce( ( sum, p ) => sum + p.mass, 0 );
      expect( carton.contents_mass ).toBe( total );
    }
  } );
} );
