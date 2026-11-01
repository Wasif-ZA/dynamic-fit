import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CARTON_GAP,
  buildCartonGroups,
  colorForItemRef,
  colorToHex,
  computeCartonLayouts,
  isPlacementHighlighted,
  resetCartonBuildState,
  setCartonGroupVisible,
  setCartonInstructionStep,
  setOrientationMarkersVisible,
  setPlacementHighlighted,
} from '../../js/cartons.js';
import { fixtureNames, loadFixture } from './fixtures.js';

const GOLDEN_RATIO_CONJUGATE = 0.61803398875;

function carton( id, inner_dims, placements = [] ) {
  return { carton_id: id, sku: 'BOX', inner_dims, placements };
}

function placement( item_ref, position, dims ) {
  return { item_ref, label: item_ref, position, dims, mass: 100, tags: [] };
}

beforeEach( () => {
  resetCartonBuildState();
} );

describe( 'computeCartonLayouts', () => {
  it( 'places the first carton at the origin', () => {
    const [ first ] = computeCartonLayouts( [ carton( 'c1', [ 200, 100, 100 ] ) ] );
    expect( first.toArray() ).toEqual( [ 0, 0, 0 ] );
  } );

  it( 'lays cartons out along +X with a gap between them', () => {
    const layouts = computeCartonLayouts( [
      carton( 'c1', [ 200, 100, 100 ] ), // 20 cm wide
      carton( 'c2', [ 300, 100, 100 ] ), // 30 cm wide
      carton( 'c3', [ 100, 100, 100 ] ),
    ] );
    expect( layouts.map( ( v ) => v.x ) ).toEqual( [ 0, 20 + CARTON_GAP, 20 + CARTON_GAP + 30 + CARTON_GAP ] );
    layouts.forEach( ( v ) => {
      expect( v.y ).toBe( 0 );
      expect( v.z ).toBe( 0 );
    } );
  } );

  it( 'returns nothing for no cartons', () => {
    expect( computeCartonLayouts( [] ) ).toEqual( [] );
  } );
} );

describe( 'item colouring (Req07)', () => {
  it( 'gives the same item_ref the same colour', () => {
    const a = colorForItemRef( 'SKU-1' );
    const b = colorForItemRef( 'SKU-1' );
    expect( colorToHex( a ) ).toBe( colorToHex( b ) );
  } );

  it( 'gives different item_refs different colours', () => {
    const refs = Array.from( { length: 30 }, ( _, i ) => `SKU-${ i }` );
    const hexes = new Set( refs.map( ( ref ) => colorToHex( colorForItemRef( ref ) ) ) );
    expect( hexes.size ).toBe( refs.length );
  } );

  it( 'steps hue by the golden ratio for each new item_ref', () => {
    [ 'A', 'B', 'C', 'D' ].forEach( ( ref, index ) => {
      const hsl = {};
      colorForItemRef( ref ).getHSL( hsl );
      const expectedHue = ( index * GOLDEN_RATIO_CONJUGATE ) % 1;
      expect( hsl.h ).toBeCloseTo( expectedHue, 2 );
    } );
  } );

  it( 'treats a missing item_ref as one shared key', () => {
    expect( colorToHex( colorForItemRef( undefined ) ) ).toBe( colorToHex( colorForItemRef( null ) ) );
  } );

  it( 'starts the colour sequence again after a reset', () => {
    const first = colorToHex( colorForItemRef( 'X' ) );
    colorForItemRef( 'Y' );
    resetCartonBuildState();
    expect( colorToHex( colorForItemRef( 'Y' ) ) ).toBe( first );
  } );

  it( 'formats colours as #rrggbb', () => {
    expect( colorToHex( new THREE.Color( 0xff0000 ) ) ).toBe( '#ff0000' );
    expect( colorToHex( colorForItemRef( 'Z' ) ) ).toMatch( /^#[0-9a-f]{6}$/ );
  } );
} );

describe( 'buildCartonGroups (Req02)', () => {
  const cartons = [
    carton( 'c1', [ 220, 160, 120 ], [
      placement( 'A', [ 0, 0, 0 ], [ 100, 100, 100 ] ),
      placement( 'B', [ 100, 0, 0 ], [ 100, 100, 100 ] ),
    ] ),
    carton( 'c2', [ 300, 200, 200 ], [ placement( 'A', [ 0, 0, 0 ], [ 50, 50, 50 ] ) ] ),
  ];

  it( 'creates one group per carton under a shared parent', () => {
    const { cartonsGroup, cartonGroups } = buildCartonGroups( cartons );
    expect( cartonGroups ).toHaveLength( 2 );
    expect( cartonsGroup.children ).toEqual( cartonGroups );
  } );

  it( 'adds a carton mesh plus one mesh per placement', () => {
    const { cartonGroups } = buildCartonGroups( cartons );
    expect( cartonGroups[ 0 ].children ).toHaveLength( 1 + 2 );
    expect( cartonGroups[ 1 ].children ).toHaveLength( 1 + 1 );
  } );

  it( 'positions each group at its layout offset', () => {
    const { cartonGroups } = buildCartonGroups( cartons );
    const layouts = computeCartonLayouts( cartons );
    cartonGroups.forEach( ( group, i ) => {
      expect( group.position.toArray() ).toEqual( layouts[ i ].toArray() );
    } );
  } );

  it( 'labels each carton with its carton_id', () => {
    const { cartonGroups } = buildCartonGroups( cartons );
    const labels = [];
    cartonGroups.forEach( ( group ) => group.traverse( ( o ) => o.isCSS2DObject && labels.push( o.element.textContent ) ) );
    expect( labels ).toEqual( [ 'c1', 'c2' ] );
  } );

  it( 'colours placements with the same item_ref the same, across cartons', () => {
    const { cartonGroups } = buildCartonGroups( cartons );
    const aInC1 = cartonGroups[ 0 ].children[ 1 ].material.color.getHex();
    const bInC1 = cartonGroups[ 0 ].children[ 2 ].material.color.getHex();
    const aInC2 = cartonGroups[ 1 ].children[ 1 ].material.color.getHex();
    expect( aInC1 ).toBe( aInC2 );
    expect( aInC1 ).not.toBe( bInC1 );
  } );

  it( 'handles cartons with no placements', () => {
    const { cartonGroups } = buildCartonGroups( [ { carton_id: 'empty', inner_dims: [ 100, 100, 100 ] } ] );
    expect( cartonGroups[ 0 ].children ).toHaveLength( 1 );
  } );
} );

describe( 'placement highlighting', () => {
  it( 'is off by default and can be toggled per placement', () => {
    buildCartonGroups( [ carton( 'c1', [ 200, 200, 200 ], [
      placement( 'A', [ 0, 0, 0 ], [ 50, 50, 50 ] ),
      placement( 'B', [ 50, 0, 0 ], [ 50, 50, 50 ] ),
    ] ) ] );

    expect( isPlacementHighlighted( 0 ) ).toBe( false );
    setPlacementHighlighted( 1, true );
    expect( isPlacementHighlighted( 0 ) ).toBe( false );
    expect( isPlacementHighlighted( 1 ) ).toBe( true );
    setPlacementHighlighted( 1, false );
    expect( isPlacementHighlighted( 1 ) ).toBe( false );
  } );

  it( 'ignores indexes that do not exist', () => {
    expect( () => setPlacementHighlighted( 99, true ) ).not.toThrow();
    expect( isPlacementHighlighted( 99 ) ).toBe( false );
  } );
} );

describe( 'setCartonInstructionStep (Req10)', () => {
  function buildThree() {
    const { cartonGroups } = buildCartonGroups( [ carton( 'c1', [ 300, 100, 100 ], [
      placement( 'A', [ 0, 0, 0 ], [ 100, 100, 100 ] ),
      placement( 'B', [ 100, 0, 0 ], [ 100, 100, 100 ] ),
      placement( 'C', [ 200, 0, 0 ], [ 100, 100, 100 ] ),
    ] ) ] );
    const group = cartonGroups[ 0 ];
    return { group, meshes: group.userData.placementMeshes };
  }

  const isSolid = ( mesh ) => mesh.material.transparent === false && mesh.material.opacity === 1;
  const isDimmed = ( mesh ) => mesh.material.transparent === true && mesh.material.opacity < 0.5;

  it( 'keeps one mesh per placement in packing order', () => {
    const { group, meshes } = buildThree();
    expect( meshes ).toHaveLength( 3 );
    expect( meshes ).toEqual( group.children.slice( 1 ) );
  } );

  it( 'shows every item solid at step 0 (completed view)', () => {
    const { group, meshes } = buildThree();
    setCartonInstructionStep( group, 0 );
    expect( meshes.every( isSolid ) ).toBe( true );
  } );

  it( 'shows only the current item solid and dims the rest', () => {
    const { group, meshes } = buildThree();
    setCartonInstructionStep( group, 2 );
    expect( isDimmed( meshes[ 0 ] ) ).toBe( true );
    expect( isSolid( meshes[ 1 ] ) ).toBe( true );
    expect( isDimmed( meshes[ 2 ] ) ).toBe( true );
  } );

  it( 'restores the original colours when going back to step 0', () => {
    const { group, meshes } = buildThree();
    const before = meshes.map( ( m ) => m.material.color.getHex() );
    setCartonInstructionStep( group, 1 );
    setCartonInstructionStep( group, 3 );
    setCartonInstructionStep( group, 0 );
    expect( meshes.map( ( m ) => m.material.color.getHex() ) ).toEqual( before );
    expect( meshes.every( isSolid ) ).toBe( true );
  } );

  it( 'does nothing for a missing group', () => {
    expect( () => setCartonInstructionStep( undefined, 1 ) ).not.toThrow();
  } );
} );

describe( 'orientation markers', () => {
  // Each item mesh has its edge lines, its highlight outline and one marker group.
  function markersOf( group ) {
    return group.userData.placementMeshes.map( ( mesh ) => mesh.children.find( ( child ) => child.isGroup ) );
  }

  function build( orientations ) {
    const placements = orientations.map( ( orientation, i ) => ( {
      ...placement( `O${ i }`, [ i * 100, 0, 0 ], [ 100, 100, 100 ] ),
      orientation,
    } ) );
    return buildCartonGroups( [ carton( 'c1', [ orientations.length * 100, 100, 100 ], placements ) ] ).cartonGroups[ 0 ];
  }

  it( 'adds one hidden marker per placement', () => {
    const markers = markersOf( build( [ 0, 1, 2 ] ) );
    expect( markers ).toHaveLength( 3 );
    markers.forEach( ( marker ) => expect( marker.visible ).toBe( false ) );
  } );

  it( 'shows and hides every marker together', () => {
    const markers = markersOf( build( [ 0, 3, 5 ] ) );
    setOrientationMarkersVisible( true );
    markers.forEach( ( marker ) => expect( marker.visible ).toBe( true ) );
    setOrientationMarkersVisible( false );
    markers.forEach( ( marker ) => expect( marker.visible ).toBe( false ) );
  } );

  it( 'draws each marker as a solid arrow (shaft + head) with no text label', () => {
    const [ marker ] = markersOf( build( [ 4 ] ) );
    const meshes = marker.children.filter( ( o ) => o.isMesh );
    expect( meshes.map( ( m ) => m.geometry.type ) ).toEqual( [ 'CylinderGeometry', 'ConeGeometry' ] );
    expect( marker.children.some( ( o ) => o.isCSS2DObject ) ).toBe( false );
  } );

  it( 'falls back to orientation 0 for a missing or unknown orientation', () => {
    const [ missing, unknown ] = markersOf( build( [ undefined, 9 ] ) );
    [ missing, unknown ].forEach( ( marker ) => {
      expect( marker.position.clone().normalize().toArray().map( ( v ) => Math.round( v ) + 0 ) ).toEqual( [ 1, 0, 0 ] );
    } );
  } );

  it.each( [
    [ 0, [ 1, 0, 0 ] ],
    [ 1, [ -1, 0, 0 ] ],
    [ 2, [ 0, 1, 0 ] ],
    [ 3, [ 0, -1, 0 ] ],
    [ 4, [ 0, 0, 1 ] ],
    [ 5, [ 0, 0, -1 ] ],
  ] )( 'places the orientation %i marker outside the item along %j', ( orientation, direction ) => {
    const [ marker ] = markersOf( build( [ orientation ] ) );
    const unit = marker.position.clone().normalize().toArray().map( ( v ) => Math.round( v ) + 0 );
    expect( unit ).toEqual( direction );
    expect( marker.position.length() ).toBeGreaterThan( 5 ); // item is 10 cm, so half-size is 5
  } );

  it( 'is forgotten after a reset', () => {
    const [ marker ] = markersOf( build( [ 0 ] ) );
    resetCartonBuildState();
    setOrientationMarkersVisible( true );
    expect( marker.visible ).toBe( false );
  } );
} );

describe( 'setCartonGroupVisible', () => {
  it( 'hides the group and its HTML label, then shows them again', () => {
    const { cartonGroups } = buildCartonGroups( [ carton( 'c1', [ 100, 100, 100 ] ) ] );
    const group = cartonGroups[ 0 ];
    let label;
    group.traverse( ( o ) => { if ( o.isCSS2DObject ) label = o; } );

    setCartonGroupVisible( group, false );
    expect( group.visible ).toBe( false );
    expect( label.element.style.display ).toBe( 'none' );

    setCartonGroupVisible( group, true );
    expect( group.visible ).toBe( true );
    expect( label.element.style.display ).toBe( '' );
  } );
} );

describe.each( fixtureNames )( 'scene built from fixture %s', ( name ) => {
  const data = loadFixture( name );
  const cartons = data.cartons ?? [];

  it( 'has one group per carton and one mesh per placement', () => {
    const { cartonGroups } = buildCartonGroups( cartons );
    expect( cartonGroups ).toHaveLength( cartons.length );
    cartonGroups.forEach( ( group, i ) => {
      expect( group.children ).toHaveLength( 1 + ( cartons[ i ].placements?.length ?? 0 ) );
    } );
  } );

  it( 'keeps every placement mesh inside its carton', () => {
    const { cartonGroups } = buildCartonGroups( cartons );
    const eps = 0.06; // cartons are padded by 0.05 cm to avoid z-fighting
    cartonGroups.forEach( ( group ) => {
      group.updateMatrixWorld( true );
      const [ cartonMesh, ...placements ] = group.children;
      const cartonBox = new THREE.Box3().setFromObject( cartonMesh, true ).expandByScalar( eps );
      placements.forEach( ( mesh ) => {
        // The item's own box only, not child markers (e.g. orientation arrows) that stick out.
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox.clone().applyMatrix4( mesh.matrixWorld );
        expect( cartonBox.containsBox( box ) ).toBe( true );
      } );
    } );
  } );

  it( 'does not overlap cartons in the layout', () => {
    const { cartonGroups } = buildCartonGroups( cartons );
    const boxes = cartonGroups.map( ( g ) => {
      g.updateMatrixWorld( true );
      return new THREE.Box3().setFromObject( g.children[ 0 ], true );
    } );
    for ( let i = 1; i < boxes.length; i++ ) {
      expect( boxes[ i ].min.x ).toBeGreaterThan( boxes[ i - 1 ].max.x );
    }
  } );
} );
