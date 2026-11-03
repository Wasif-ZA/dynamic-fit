import { describe, expect, it } from 'vitest';

import {
  MM_TO_CM,
  jsonDimsToThree,
  jsonMinCornerToThreeCenter,
  jsonPositionToThree,
} from '../../js/coords.js';

describe( 'coords: solver JSON (Z-up, mm) → Three.js (Y-up, cm)', () => {
  it( 'converts millimetres to centimetres', () => {
    expect( MM_TO_CM ).toBe( 0.1 );
  } );

  it( 'swaps Y and Z when converting a position', () => {
    const v = jsonPositionToThree( [ 10, 20, 30 ] );
    expect( v.x ).toBeCloseTo( 1 );
    expect( v.y ).toBeCloseTo( 3 ); // JSON z (up) → Three y (up)
    expect( v.z ).toBeCloseTo( 2 ); // JSON y (depth) → Three z
  } );

  it( 'swaps Y and Z when converting dimensions', () => {
    const [ w, h, d ] = jsonDimsToThree( [ 220, 160, 120 ] );
    expect( w ).toBeCloseTo( 22 );
    expect( h ).toBeCloseTo( 12 );
    expect( d ).toBeCloseTo( 16 );
  } );

  it( 'keeps the origin at the origin', () => {
    const v = jsonPositionToThree( [ 0, 0, 0 ] );
    expect( v.toArray() ).toEqual( [ 0, 0, 0 ] );
  } );

  it( 'turns a min-corner + dims into the box centre', () => {
    const centre = jsonMinCornerToThreeCenter( [ 0, 0, 0 ], [ 180, 120, 90 ] );
    expect( centre.x ).toBeCloseTo( 9 );
    expect( centre.y ).toBeCloseTo( 4.5 );
    expect( centre.z ).toBeCloseTo( 6 );
  } );

  it( 'offsets the centre by the min corner', () => {
    const centre = jsonMinCornerToThreeCenter( [ 100, 50, 20 ], [ 20, 40, 60 ] );
    expect( centre.x ).toBeCloseTo( 11 ); // 10 + 2/2
    expect( centre.y ).toBeCloseTo( 5 ); // 2 + 6/2
    expect( centre.z ).toBeCloseTo( 7 ); // 5 + 4/2
  } );
} );
