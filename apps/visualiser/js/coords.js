import * as THREE from 'three';

export const MM_TO_CM = 0.1; // JSON lengths are in millimetres; scene units are centimetres

export function jsonPositionToThree( [ x, y, z ] ) {
  // Solver JSON is Z-up; Three.js is Y-up → (x, z, y)
  return new THREE.Vector3( x * MM_TO_CM, z * MM_TO_CM, y * MM_TO_CM );
}

export function jsonDimsToThree( [ x, y, z ] ) {
  // BoxGeometry(width, height, depth) with Y-up → (x, z, y)
  return [ x * MM_TO_CM, z * MM_TO_CM, y * MM_TO_CM ];
}

export function jsonMinCornerToThreeCenter( minCorner, dims ) {
  const [ width, height, depth ] = jsonDimsToThree( dims );
  const min = jsonPositionToThree( minCorner );
  return new THREE.Vector3(
    min.x + width / 2,
    min.y + height / 2,
    min.z + depth / 2,
  );
}
