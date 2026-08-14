import * as THREE from 'three';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* Scene */
const scene = new THREE.Scene();
scene.background = new THREE.Color( 0xe8eef5 );

/* Camera */
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
camera.position.set( 4, 3, 5 );
camera.lookAt( 0, 0, 0 );

/* Renderer */
const canvas = document.getElementById( 'visualiser-canvas' );
if ( !canvas ) {
  throw new Error( 'Canvas element #visualiser-canvas not found' );
}
const renderer = new THREE.WebGLRenderer( { canvas } );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setAnimationLoop( animate );

/* Touch Controls */
const controls = new OrbitControls( camera, renderer.domElement );
controls.enableRotate = true;
controls.touches = {
  ONE: THREE.TOUCH.ROTATE, // 1 finger rotate
  TWO: THREE.TOUCH.DOLLY_PAN // 2 finger to zoom + pan
};

/* Lighting */
const ambientLight = new THREE.AmbientLight( 0xffffff, 0.6 );
scene.add( ambientLight );

const directionalLight = new THREE.DirectionalLight( 0xffffff, 1.2 );
directionalLight.position.set( 5, 8, 4 );
scene.add( directionalLight );

/* Platform — sized to fit loaded cartons in buildSceneFromData */
const platformMaterial = new THREE.MeshStandardMaterial( { color: 0xb8c2cc } );
let platform = null;
const PLATFORM_OFFSET = 0.05; // cm below lowest geometry to avoid z-fighting

function updatePlatformFromBounds( box ) {
  const padding = 10; // cm margin around cartons
  let width = 100;
  let depth = 100;
  let centreX = 0;
  let centreZ = 0;
  let floorY = 0;

  if ( !box.isEmpty() ) {
    const size = box.getSize( new THREE.Vector3() );
    const centre = box.getCenter( new THREE.Vector3() );
    width = size.x + padding * 2;
    depth = size.z + padding * 2;
    centreX = centre.x;
    centreZ = centre.z;
    floorY = box.min.y - PLATFORM_OFFSET;
  }

  if ( platform ) {
    platform.geometry.dispose();
  } else {
    platform = new THREE.Mesh( undefined, platformMaterial );
    platform.rotation.x = -Math.PI / 2;
    scene.add( platform );
  }

  platform.geometry = new THREE.PlaneGeometry( width, depth );
  platform.position.set( centreX, floorY, centreZ );
}

async function loadSceneData( jsonPath ) {
  const response = await fetch( jsonPath );
  if ( !response.ok ) {
    throw new Error( `Failed to load ${ jsonPath }: ${ response.status }` );
  }
  return response.json();
}

const MM_TO_CM = 0.1; // JSON lengths are in millimetres; scene units are centimetres

function jsonPositionToThree( [ x, y, z ] ) {
  // Solver JSON is Z-up; Three.js is Y-up → (x, z, y)
  return new THREE.Vector3( x * MM_TO_CM, z * MM_TO_CM, y * MM_TO_CM );
}

function jsonDimsToThree( [ x, y, z ] ) {
  // BoxGeometry(width, height, depth) with Y-up → (x, z, y)
  return [ x * MM_TO_CM, z * MM_TO_CM, y * MM_TO_CM ];
}

function jsonMinCornerToThreeCenter( minCorner, dims ) {
  const [ width, height, depth ] = jsonDimsToThree( dims );
  const min = jsonPositionToThree( minCorner );
  return new THREE.Vector3(
    min.x + width / 2,
    min.y + height / 2,
    min.z + depth / 2,
  );
}

let placementColorSeed = 0;

function nextPlacementColor() {
  // Golden-ratio hue stepping keeps successive items visually distinct.
  const hue = ( placementColorSeed * 0.61803398875 ) % 1;
  placementColorSeed++;
  return new THREE.Color().setHSL( hue, 0.85, 0.55 );
}

function createCartonMesh( carton ) {
  const [ width, height, depth ] = jsonDimsToThree( carton.inner_dims );
  const cartonGeometry = new THREE.BoxGeometry( width, height, depth );
  const cartonMaterial = new THREE.MeshStandardMaterial( {
    color: 0x404040,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  } );
  const cartonMesh = new THREE.Mesh( cartonGeometry, cartonMaterial );
  cartonMesh.position.copy( jsonPositionToThree( carton.centre_of_mass ) );

  const edges = new THREE.EdgesGeometry( cartonGeometry );
  const edgeLines = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial( { color: 0x222222 } ),
  );
  cartonMesh.add( edgeLines );

  return cartonMesh;
}

function createPlacementMesh( placement ) {
  const [ width, height, depth ] = jsonDimsToThree( placement.dims );
  const geometry = new THREE.BoxGeometry( width, height, depth );
  const material = new THREE.MeshStandardMaterial( {color: nextPlacementColor()} );
  const mesh = new THREE.Mesh( geometry, material );
  mesh.position.copy( jsonMinCornerToThreeCenter( placement.position, placement.dims ) );
  return mesh;
}

function frameCameraOnObject( object ) {
  const box = new THREE.Box3().setFromObject( object );
  if ( box.isEmpty() ) {
    return;
  }

  const centre = box.getCenter( new THREE.Vector3() );
  const size = box.getSize( new THREE.Vector3() );
  const maxDim = Math.max( size.x, size.y, size.z );
  const distance = Math.max( maxDim * 2.5, 1 );

  camera.position.copy( centre ).add( new THREE.Vector3( distance, distance * 0.75, distance ) );
  controls.target.copy( centre );
  controls.update();
}

function buildSceneFromData( data ) {
  placementColorSeed = 0;

  const cartonsGroup = new THREE.Group();
  scene.add( cartonsGroup );

  for ( const carton of data.cartons ?? [] ) {
    cartonsGroup.add( createCartonMesh( carton ) );

    for ( const placement of carton.placements ?? [] ) {
      cartonsGroup.add( createPlacementMesh( placement ) );
    }
  }

  const cartonsBox = new THREE.Box3().setFromObject( cartonsGroup );
  updatePlatformFromBounds( cartonsBox );
  frameCameraOnObject( cartonsGroup );
}

const jsonFileName = canvas.dataset.json;
loadSceneData( jsonFileName )
  .then( buildSceneFromData )
  .catch( ( error ) => console.error( error ) );

function animate( time ) {
  controls.update();
  renderer.render( scene, camera );
}
