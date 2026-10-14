import * as THREE from 'three';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import { jsonDimsToThree } from './coords.js';

/* Scene */
export const scene = new THREE.Scene();
scene.background = new THREE.Color( 0xe8eef5 );

/* Camera */
export const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
camera.position.set( 4, 3, 5 );
camera.lookAt( 0, 0, 0 );

/* Renderer */
export const canvas = document.getElementById( 'visualiser-canvas' );
if ( !canvas ) {
  throw new Error( 'Canvas element #visualiser-canvas not found' );
}

export const renderer = new THREE.WebGLRenderer( { canvas } );
renderer.setSize( window.innerWidth, window.innerHeight );

export const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize( window.innerWidth, window.innerHeight );
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
document.body.appendChild( labelRenderer.domElement );

/* Touch Controls */
export const controls = new OrbitControls( camera, renderer.domElement );
controls.enableRotate = true;
controls.touches = {
  ONE: THREE.TOUCH.ROTATE, // 1 finger rotate
  TWO: THREE.TOUCH.DOLLY_PAN // 2 finger to zoom + pan
};

/* Cartons are laid out along +X. Keep the orbit pivot on that row's
 * centreline (locked Y/Z from the layout bounds) so pan can slide along
 * the row while rotate/dolly still orbit the cartons, not a drifted point. */
const rowOrbitCentre = new THREE.Vector3();
let constrainOrbitToRow = false;

function constrainOrbitTargetToRow() {
  if ( !constrainOrbitToRow ) {
    return;
  }

  const dy = rowOrbitCentre.y - controls.target.y;
  const dz = rowOrbitCentre.z - controls.target.z;
  controls.target.y = rowOrbitCentre.y;
  controls.target.z = rowOrbitCentre.z;
  camera.position.y += dy;
  camera.position.z += dz;
}

/* Lighting */
const ambientLight = new THREE.AmbientLight( 0xffffff, 0.6 );
scene.add( ambientLight );

const directionalLight = new THREE.DirectionalLight( 0xffffff, 1.2 );
directionalLight.position.set( 5, 8, 4 );
scene.add( directionalLight );

/* Platform — sized to fit visible cartons */
const platformMaterial = new THREE.MeshStandardMaterial( { color: 0xb8c2cc } );
let platform = null;
const PLATFORM_OFFSET = 0.05; // cm below lowest geometry to avoid z-fighting

export function updatePlatformFromBounds( box ) {
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

export function frameCameraOnObject( object, cartons ) {
  const box = new THREE.Box3().setFromObject( object );
  if ( box.isEmpty() ) {
    return;
  }

  const centre = box.getCenter( new THREE.Vector3() );

  let maxCartonDim = 0;
  for ( const carton of cartons ) {
    const [ width, height, depth ] = jsonDimsToThree( carton.inner_dims );
    maxCartonDim = Math.max( maxCartonDim, width, height, depth );
  }

  const distance = Math.max( maxCartonDim * 1.6, 1 );
  camera.position.copy( centre ).add( new THREE.Vector3( distance * 0.85, distance * 0.65, distance * 0.85 ) );
  controls.target.copy( centre );
  rowOrbitCentre.copy( centre );
  constrainOrbitToRow = true;
  controls.update();
}

export function fitViewToObject( object, cartons ) {
  const box = new THREE.Box3().setFromObject( object );
  updatePlatformFromBounds( box );
  frameCameraOnObject( object, cartons );
}

function animate() {
  controls.update();
  constrainOrbitTargetToRow();
  renderer.render( scene, camera );
  labelRenderer.render( scene, camera );
}

export function startRenderLoop() {
  renderer.setAnimationLoop( animate );
}

window.addEventListener( 'resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
  labelRenderer.setSize( window.innerWidth, window.innerHeight );
} );
