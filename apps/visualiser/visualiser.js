import * as THREE from 'three';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

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

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize( window.innerWidth, window.innerHeight );
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
document.body.appendChild( labelRenderer.domElement );

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
const CARTON_GAP = 5; // cm between cartons when laying out 2+
const CARTON_DIM_PADDING = 0.05; // cm added to each carton axis to avoid z-clipping with placements

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

/* Load Scene Data */
async function loadSceneData( jsonPath ) {
  const response = await fetch( jsonPath );
  if ( !response.ok ) {
    throw new Error( `Failed to load ${ jsonPath }: ${ response.status }` );
  }
  return response.json();
}

/* Dimensions and Layouts */
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

function computeCartonLayouts( cartons ) {
  let offsetX = 0;

  return cartons.map( ( carton ) => {
    const [ width ] = jsonDimsToThree( carton.inner_dims );
    const minCorner = new THREE.Vector3( offsetX, 0, 0 );
    offsetX += width + CARTON_GAP;
    return minCorner;
  } );
}

/* Placement Colors */
let placementColorSeed = 0;

function placementColorAt( index ) {
  const hue = ( index * 0.61803398875 ) % 1;
  return new THREE.Color().setHSL( hue, 0.85, 0.55 );
}

function nextPlacementColor() {
  return placementColorAt( placementColorSeed++ );
}

function colorToHex( color ) {
  return `#${ color.getHexString() }`;
}

function getPlacementHighlightColor( baseColor ) {
  const hsl = { h: 0, s: 0, l: 0 };
  baseColor.getHSL( hsl );
  return new THREE.Color().setHSL( hsl.h, Math.min( 1, hsl.s * 1.05 ), 0.86 );
}

const HIGHLIGHT_RENDER_ORDER = 20;
const placementMeshes = [];

function setPlacementHighlighted( placementIndex, highlighted ) {
  const mesh = placementMeshes[ placementIndex ];
  const outline = mesh?.userData.outline;
  if ( !outline ) {
    return;
  }
  outline.visible = highlighted;
}

/* Labels */
function createLabel( text ) {
  const element = document.createElement( 'div' );
  element.className = 'label';
  element.textContent = text;
  return new CSS2DObject( element );
}

function addCartonIDLabel(cartonMesh, carton_id, height) {
  const idLabel = createLabel(`${carton_id}`);
  idLabel.position.set(0, height, 0);
  cartonMesh.add( idLabel );
}

function addCartonDimensionLabels( cartonMesh, innerDims, width, height, depth ) {
  const [ xMm, yMm, zMm ] = innerDims;
  const offset = 1.5;

  const widthLabel = createLabel( `${ xMm } mm` );
  widthLabel.position.set( 0, -height / 2 - offset, 0 );
  cartonMesh.add( widthLabel );

  const heightLabel = createLabel( `${ zMm } mm` );
  heightLabel.position.set( -width / 2 - offset, 0, 0 );
  cartonMesh.add( heightLabel );

  const depthLabel = createLabel( `${ yMm } mm` );
  depthLabel.position.set( 0, 0, -depth / 2 - offset );
  cartonMesh.add( depthLabel );
}

/* Carton Mesh */
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
    opacity: 0.20,
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

  //addCartonDimensionLabels( cartonMesh, carton.inner_dims, width, height, depth );

  return cartonMesh;
}

/* Placement Mesh */
function createPlacementMesh( placement ) {
  const [ width, height, depth ] = jsonDimsToThree( placement.dims );
  const geometry = new THREE.BoxGeometry( width, height, depth );
  const color = nextPlacementColor();
  const material = new THREE.MeshStandardMaterial( { color } );
  const mesh = new THREE.Mesh( geometry, material );
  mesh.position.copy( jsonMinCornerToThreeCenter( placement.position, placement.dims ) );
  mesh.renderOrder = 1;

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry( geometry ),
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

/* Carton Group: Create a group for a single carton, including its carton mesh and placements. */
function createCartonGroup( carton, minCorner ) {
  const group = new THREE.Group();
  group.position.copy( minCorner );
  group.add( createCartonMesh( carton ) );

  for ( const placement of carton.placements ?? [] ) {
    group.add( createPlacementMesh( placement ) );
  }

  return group;
}

function updateCartonInfoUI( cartons, rejects ) {
  const panel = document.getElementById( 'carton-info' );
  if ( !panel ) {
    return;
  }

  const rejectItems = rejects.map( ( reject ) => {
    return `
      <li class="placement-info-item">
        <span class="placement-info-text">
          <span class="placement-info-ref">${ reject.item_ref }</span>
          <span class="placement-info-label">
            ${ reject.reason_code }
            </br>
            ${ reject.message }
          </span>
        </span>
      </li>
    `
  } ).join( '' );

  if ( cartons.length === 0 ) {
    panel.innerHTML = `
      <p class="carton-info-empty">No cartons in this solution.</p>
      </br>
      <span class="carton-info-heading"><strong>Rejected Items</strong></span>
      ${ rejects.length > 0 
        ? `<ul class="placement-info-list">${ rejectItems }</ul>`
        : '<p class="placement-info-empty">No Rejected Items</p>'
      }
    `;
    return;
  }

  let placementColorIndex = 0;

  let content = cartons.map( ( carton ) => {
    const [ x, y, z ] = carton.inner_dims;
    const placements = carton.placements ?? [];
    const placementItems = placements.map( ( placement ) => {
      const placementIndex = placementColorIndex++;
      const colorHex = colorToHex( placementColorAt( placementIndex ) );
      return `
        <li class="placement-info-item">
          <input
            type="checkbox"
            class="placement-highlight-toggle"
            data-placement-index="${ placementIndex }"
            aria-label="Highlight ${ placement.item_ref }"
          >
          <span class="placement-swatch" style="background-color: ${ colorHex }" aria-hidden="true"></span>
          <span class="placement-info-text">
            <span class="placement-info-ref">${ placement.item_ref }</span>
            <span class="placement-info-label">
              ${ placement.label }
              </br>Weight: ${ (placement.mass / 1000).toFixed(3) } kg
              </br> ${ placement.tags.length > 0
                ? `<ul class="placement-info-tags">${ placement.tags.map( ( tag ) => {
                  return `
                    <li>${ tag }</li>
                  `
                }) }</ul>`
                :  ''
              }
            </span>
          </span>
        </li>
      `;
    } ).join( '' );

    return `
      <details class="carton-info-entry">
        <summary class="carton-info-summary">
          <span class="carton-info-main">
            <span class="carton-info-heading">
              <span class="carton-info-id"><strong>${ carton.carton_id }</strong></span>
              ${ carton.sku }
            </span>
            <span class="carton-info-dims">
              ${ x } × ${ y } × ${ z } mm
              </br>
              Total Weight: ${ (carton.contents_mass / 1000).toFixed(3) } kg
            </span>
          </span>
          <span class="carton-expand-btn" aria-hidden="true">
            <span class="carton-expand-label">Expand</span>
            <span class="carton-collapse-label">Collapse</span>
          </span>
        </summary>
        ${ placements.length > 0 
          ? `<ul class="placement-info-list">${ placementItems }</ul>`
          : '<p class="placement-info-empty">No placements</p>' }
      </details>
    `;
  } ).join( '' );

  content += `
    </br>
    <span class="carton-info-heading"><strong>Rejected Items</strong></span>
    ${ rejects.length > 0 
      ? `<ul class="placement-info-list">${ rejectItems }</ul>`
      : '<p class="placement-info-empty">No Rejected Items</p>'
    }
  `;

  panel.innerHTML = content;
  bindCartonInfoHighlightEvents( panel );
}

/* Highlight Placement Item Event */
function bindCartonInfoHighlightEvents( panel ) {
  if ( panel.dataset.highlightBound === 'true' ) {
    return;
  }
  panel.dataset.highlightBound = 'true';
  panel.addEventListener( 'change', ( event ) => {
    const toggle = event.target;
    if ( !( toggle instanceof HTMLInputElement ) || !toggle.classList.contains( 'placement-highlight-toggle' ) ) {
      return;
    }
    setPlacementHighlighted( Number( toggle.dataset.placementIndex ), toggle.checked );
  } );
}

function frameCameraOnObject( object, cartons ) {
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
  controls.update();
}

function buildSceneFromData( data ) {
  placementColorSeed = 0;
  placementMeshes.length = 0;

  const cartons = data.cartons ?? [];
  const rejects = data.rejects ?? [];
  const layouts = computeCartonLayouts( cartons );
  const cartonsGroup = new THREE.Group();
  scene.add( cartonsGroup );

  cartons.forEach( ( carton, index ) => {
    cartonsGroup.add( createCartonGroup( carton, layouts[ index ] ) );
  } );

  updateCartonInfoUI( cartons, rejects );

  const cartonsBox = new THREE.Box3().setFromObject( cartonsGroup );
  updatePlatformFromBounds( cartonsBox );
  frameCameraOnObject( cartonsGroup, cartons );
}

const jsonFileName = canvas.dataset.json;
loadSceneData( jsonFileName )
  .then( buildSceneFromData )
  .catch( ( error ) => console.error( error ) );

window.addEventListener( 'resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
  labelRenderer.setSize( window.innerWidth, window.innerHeight );
} );

function animate( time ) {
  controls.update();
  renderer.render( scene, camera );
  labelRenderer.render( scene, camera );
}
