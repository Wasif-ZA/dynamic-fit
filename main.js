import * as THREE from 'three';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
//import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* Scene */
const scene = new THREE.Scene();
scene.background = new THREE.Color( 0xe8eef5 );

/* Camera */
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
camera.position.set( 4, 3, 5 );
camera.lookAt( 0, 0, 0 );

/* Renderer */
const canvas = document.querySelector( 'canvas' );
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

//const loader = new GLTFLoader();

/* Lighting */
const ambientLight = new THREE.AmbientLight( 0xffffff, 0.6 );
scene.add( ambientLight );

const directionalLight = new THREE.DirectionalLight( 0xffffff, 1.2 );
directionalLight.position.set( 5, 8, 4 );
scene.add( directionalLight );

/* Platform */
const platformGeometry = new THREE.PlaneGeometry( 12, 12 );
const platformMaterial = new THREE.MeshStandardMaterial( { color: 0xb8c2cc } );
const platform = new THREE.Mesh( platformGeometry, platformMaterial );
platform.rotation.x = -Math.PI / 2;
scene.add( platform );

// Example Cube
const geometry = new THREE.BoxGeometry( 1, 1, 1 );
const material = new THREE.MeshStandardMaterial( { color: 0x00ff00 } );
const cube = new THREE.Mesh( geometry, material );
cube.position.y = 0.5;
scene.add( cube );

controls.target.set( 0, 0.5, 0 ); // Set the target for the camera to look at (cube's position)

function animate( time ) {

  controls.update();
  renderer.render( scene, camera );

}
