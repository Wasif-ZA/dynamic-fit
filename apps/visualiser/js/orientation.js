import * as THREE from 'three';

/*
 * Every placement in the solution JSON carries an `orientation` code (0-5) but
 * the solver doesn't document, anywhere in this repo, which physical rotation
 * each code represents. So this is NOT a decoded "this way up" instruction —
 * it's a stable visual key: each code always points the same direction, so
 * two items sharing a code look identical, and all six codes are visually
 * distinct from one another. That's enough to make orientation visible in the
 * UI, which previously showed nothing. If your solver's encoding turns out to
 * be a specific axis-permutation convention, replace the six vectors below
 * with the real directions and everything downstream keeps working as-is.
 */
const ORIENTATION_DIRECTIONS = [
  new THREE.Vector3( 1, 0, 0 ),   // orientation 0
  new THREE.Vector3( -1, 0, 0 ),  // orientation 1
  new THREE.Vector3( 0, 1, 0 ),   // orientation 2
  new THREE.Vector3( 0, -1, 0 ),  // orientation 3
  new THREE.Vector3( 0, 0, 1 ),   // orientation 4
  new THREE.Vector3( 0, 0, -1 ),  // orientation 5
];

const ARROW_COLOR = 0xd7263d;
const SURFACE_GAP = 0.6; // cm clear of the box face, so the arrow doesn't z-fight with its edges
const MARKER_RENDER_ORDER = 25; // above everything, including the placement highlight outline (20)
const UP = new THREE.Vector3( 0, 1, 0 );

/* One shared, unlit, always-on-top material for every arrow — solid fill (not a thin
 * WebGL line, whose width can't reliably be made visible across browsers/GPUs), and
 * depthTest off so it renders in front of the box itself and any packed neighbour. */
const arrowMaterial = new THREE.MeshBasicMaterial( {
  color: ARROW_COLOR,
  depthTest: false,
  transparent: true,
  toneMapped: false,
} );

/* Half the box's extent along whichever single axis `direction` points down — the
 * ORIENTATION_DIRECTIONS above are always axis-aligned, so exactly one component
 * is non-zero. */
function halfExtentAlongDirection( direction, width, height, depth ) {
  if ( direction.x !== 0 ) return width / 2;
  if ( direction.y !== 0 ) return height / 2;
  return depth / 2;
}

/* Builds a solid 3D arrow (cylinder shaft + cone head) + text label, anchored just
 * outside the placement box's surface and pointing in the direction keyed to
 * `orientation`. Hidden by default; the caller toggles `.visible` on the group. */
export function createOrientationMarker( orientation, width, height, depth ) {
  const direction = ORIENTATION_DIRECTIONS[ orientation ] ?? ORIENTATION_DIRECTIONS[ 0 ];
  const surfaceOffset = halfExtentAlongDirection( direction, width, height, depth ) + SURFACE_GAP;

  // Scale off the box's own size so the arrow reads clearly at any zoom level,
  // but never shrinks to an unreadable sliver on very small items.
  const scale = Math.max( Math.min( width, height, depth ), 4 );
  const shaftLength = Math.min( scale * 0.5, 6 );
  const shaftRadius = Math.max( shaftLength * 0.1, 0.25 );
  const headLength = Math.max( shaftLength * 0.5, 1.2 );
  const headRadius = shaftRadius * 2.2;

  const group = new THREE.Group();
  group.position.copy( direction ).multiplyScalar( surfaceOffset );
  group.quaternion.setFromUnitVectors( UP, direction ); // local +Y (cylinder/cone default axis) -> direction

  const shaft = new THREE.Mesh( new THREE.CylinderGeometry( shaftRadius, shaftRadius, shaftLength, 10 ), arrowMaterial );
  shaft.position.y = shaftLength / 2;
  shaft.renderOrder = MARKER_RENDER_ORDER;
  group.add( shaft );

  const head = new THREE.Mesh( new THREE.ConeGeometry( headRadius, headLength, 10 ), arrowMaterial );
  head.position.y = shaftLength + headLength / 2;
  head.renderOrder = MARKER_RENDER_ORDER;
  group.add( head );

  group.visible = false;
  return group;
}