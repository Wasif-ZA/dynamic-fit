import * as THREE from 'three';

import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

import { jsonDimsToThree, jsonMinCornerToThreeCenter } from './coords.js';

export const CARTON_GAP = 5; // cm between cartons when laying out 2+
const CARTON_DIM_PADDING = 0.05; // cm added to each carton axis to avoid z-clipping with placements
const HIGHLIGHT_RENDER_ORDER = 20;

let placementColorSeed = 0;
const itemRefColors = new Map();
const placementMeshes = [];

export function resetCartonBuildState() {
  placementColorSeed = 0;
  itemRefColors.clear();
  placementMeshes.length = 0;
}

export function computeCartonLayouts( cartons ) {
  let offsetX = 0;

  return cartons.map( ( carton ) => {
    const [ width ] = jsonDimsToThree( carton.inner_dims );
    const minCorner = new THREE.Vector3( offsetX, 0, 0 );
    offsetX += width + CARTON_GAP;
    return minCorner;
  } );
}

function placementColorAt( index ) {
  const hue = ( index * 0.61803398875 ) % 1;
  return new THREE.Color().setHSL( hue, 0.85, 0.55 );
}

function nextPlacementColor() {
  return placementColorAt( placementColorSeed++ );
}

export function colorForItemRef( itemRef ) {
  const key = itemRef ?? '';
  let color = itemRefColors.get( key );
  if ( !color ) {
    color = nextPlacementColor();
    itemRefColors.set( key, color );
  }
  return color;
}

export function colorToHex( color ) {
  return `#${ color.getHexString() }`;
}

function getPlacementEdgeColor( baseColor ) {
  const hsl = { h: 0, s: 0, l: 0 };
  baseColor.getHSL( hsl );
  return new THREE.Color().setHSL( hsl.h, Math.min( 1, hsl.s * 0.7 ), 0.22 );
}

function getPlacementHighlightColor( baseColor ) {
  const hsl = { h: 0, s: 0, l: 0 };
  baseColor.getHSL( hsl );
  return new THREE.Color().setHSL( hsl.h, Math.min( 1, hsl.s * 1.05 ), 0.86 );
}

export function setPlacementHighlighted( placementIndex, highlighted ) {
  const mesh = placementMeshes[ placementIndex ];
  const outline = mesh?.userData.outline;
  if ( !outline ) {
    return;
  }
  outline.visible = highlighted;
}

export function isPlacementHighlighted( placementIndex ) {
  return placementMeshes[ placementIndex ]?.userData.outline?.visible === true;
}

function createLabel( text ) {
  const element = document.createElement( 'div' );
  element.className = 'label';
  element.textContent = text;
  return new CSS2DObject( element );
}

function addCartonIDLabel( cartonMesh, carton_id, height ) {
  const idLabel = createLabel( `${ carton_id }` );
  idLabel.position.set( 0, height, 0 );
  cartonMesh.add( idLabel );
}

function createCartonMesh( carton ) {
  const [ width, height, depth ] = jsonDimsToThree( carton.inner_dims );
  const cartonGeometry = new THREE.BoxGeometry(
    width + CARTON_DIM_PADDING,
    height + CARTON_DIM_PADDING,
    depth + CARTON_DIM_PADDING,
  );
  const cartonMaterial = new THREE.MeshStandardMaterial( {
    color: 0x404040,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  } );
  const cartonMesh = new THREE.Mesh( cartonGeometry, cartonMaterial );
  cartonMesh.position.set( width / 2, height / 2, depth / 2 );
  cartonMesh.renderOrder = 2;

  const edges = new THREE.EdgesGeometry( cartonGeometry );
  const edgeLines = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial( { color: 0x222222 } ),
  );
  cartonMesh.add( edgeLines );

  addCartonIDLabel( cartonMesh, carton.carton_id, height );

  return cartonMesh;
}

function createPlacementMesh( placement ) {
  const [ width, height, depth ] = jsonDimsToThree( placement.dims );
  const geometry = new THREE.BoxGeometry( width, height, depth );
  const color = colorForItemRef( placement.item_ref );
  const material = new THREE.MeshStandardMaterial( {
    color,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  } );
  const mesh = new THREE.Mesh( geometry, material );
  mesh.position.copy( jsonMinCornerToThreeCenter( placement.position, placement.dims ) );
  mesh.renderOrder = 1;

  const edgeGeometry = new THREE.EdgesGeometry( geometry );
  const edges = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial( { color: getPlacementEdgeColor( color ) } ),
  );
  mesh.add( edges );

  const outline = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial( {
      color: getPlacementHighlightColor( color ),
      depthTest: false,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    } ),
  );
  outline.renderOrder = HIGHLIGHT_RENDER_ORDER;
  outline.visible = false;
  mesh.add( outline );
  mesh.userData.outline = outline;
  placementMeshes.push( mesh );

  return mesh;
}

export function createCartonGroup( carton, minCorner ) {
  const group = new THREE.Group();
  group.position.copy( minCorner );
  group.add( createCartonMesh( carton ) );

  for ( const placement of carton.placements ?? [] ) {
    group.add( createPlacementMesh( placement ) );
  }

  return group;
}

export function setCartonGroupVisible( group, visible ) {
  group.visible = visible;
  group.traverse( ( object ) => {
    if ( object.isCSS2DObject ) {
      object.element.style.display = visible ? '' : 'none';
    }
  } );
}

export function buildCartonGroups( cartons ) {
  const layouts = computeCartonLayouts( cartons );
  const parent = new THREE.Group();
  const groups = cartons.map( ( carton, index ) => {
    const group = createCartonGroup( carton, layouts[ index ] );
    parent.add( group );
    return group;
  } );

  return { cartonsGroup: parent, cartonGroups: groups };
}
