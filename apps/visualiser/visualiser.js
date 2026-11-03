import {
  canvas,
  fitViewToObject,
  scene,
  startRenderLoop,
} from './js/scene.js';
import {buildCartonGroups,resetCartonBuildState,setCartonGroupVisible,setCartonInstructionStep,setOrientationMarkersVisible} from './js/cartons.js';
import { initCartonInfo, renderCartonInfoError, updateCartonInfoUI } from './js/cartonInfo.js';
import { loadSceneData, solutionSource } from './js/solution.js';
import { initPortalActions } from './js/portalActions.js';

startRenderLoop();

/** Carton Groups vs Single Carton */
let cartonGroups = [];
let cartonsGroup = null;
let loadedCartons = [];
let loadedRejects = [];
let focusedCartonIndex = null;
let loadedOrderId = null;
let orientationVisible = false;
let packingStep = 0;

// Create the LEGO-style packing controls
const packingControls = document.createElement('section');

packingControls.id = 'packing-steps';
packingControls.hidden = true;

packingControls.setAttribute(
  'aria-label',
  'Step-by-step packing instructions'
);

packingControls.innerHTML = `
  <div class="packing-progress-row">
    <label for="packing-progress" id="packing-progress-label">
      Completed
    </label>
    <progress id="packing-progress" value="1" max="1"></progress>
  </div>

  <div class="packing-step-nav">
    <button type="button" data-step-action="previous">
      &#8592; Previous
    </button>

    <span id="packing-step-name" aria-live="polite">
      Completed
    </span>

    <button type="button" data-step-action="next">
      Next &#8594;
    </button>

    <button type="button" data-step-action="exit">
      Exit
    </button>
  </div>
`;

document.body.appendChild(packingControls);

const progress = packingControls.querySelector('#packing-progress');
const progressLabel = packingControls.querySelector('#packing-progress-label');
const stepName = packingControls.querySelector('#packing-step-name');

// Focus is hidden when the solution has one box, so that box is the packing target.
function packingCartonIndex() {
  if (focusedCartonIndex !== null) {
    return focusedCartonIndex;
  }

  if (loadedCartons.length === 1) {
    return 0;
  }

  return null;
}

function updatePackingStep() {
  const cartonIndex = packingCartonIndex();
  const active = cartonIndex !== null;

  packingControls.hidden = !active;

  // Exit returns to every box. With one box there is no other view, so the steps stay up.
  packingControls.querySelector('[data-step-action="exit"]').hidden = loadedCartons.length < 2;

  if (!active) return;

  const carton = loadedCartons[cartonIndex];
  const total = carton.placements?.length ?? 0;

  packingStep = Math.min(packingStep, total);

  setCartonInstructionStep(
    cartonGroups[cartonIndex],
    packingStep
  );

  const completed = packingStep === 0;

  const name = completed
    ? 'Completed'
    : `Step ${packingStep} of ${total}`;

  progressLabel.textContent = name;

  stepName.textContent = completed
    ? 'All items'
    : carton.placements[packingStep - 1].item_ref;

  progress.max = Math.max(total, 1);
  progress.value = completed ? progress.max : packingStep;

  const disabled = total === 0;

  packingControls.querySelector(
    '[data-step-action="previous"]'
  ).disabled = disabled;

  packingControls.querySelector(
    '[data-step-action="next"]'
  ).disabled = disabled;
}
// Handle Previous, Next and Exit buttons
packingControls.addEventListener('click', (event) => {
  const button = event.target.closest('[data-step-action]');
  const cartonIndex = packingCartonIndex();

  if (!button || cartonIndex === null) return;

  const action = button.dataset.stepAction;

  if (action === 'exit') {
    if (loadedCartons.length > 1) {
      showAllCartons();
    }
    return;
  }

  const total =
    loadedCartons[cartonIndex].placements?.length ?? 0;

  if (total === 0) return;

  const cycle = total + 1;

  if (action === 'next') {
    packingStep = (packingStep + 1) % cycle;
  } else if (action === 'previous') {
    packingStep = (packingStep - 1 + cycle) % cycle;
  }

  updatePackingStep();
});

function visibleCartonObject() {
  // Show all cartons grouped
  if ( focusedCartonIndex === null ) {
    return cartonsGroup;
  }

  // one carton selected
  return cartonGroups[ focusedCartonIndex ];
}

function visibleCartons() {
  if ( focusedCartonIndex === null ) {
    return loadedCartons;
  }
  return [ loadedCartons[ focusedCartonIndex ] ];
}

function refreshCartonView() {
  cartonGroups.forEach( ( group, index ) => {
    setCartonGroupVisible( group, focusedCartonIndex === null || index === focusedCartonIndex );
  } );

  // Show the packing bars before framing so the camera can sit above them.
  updatePackingStep();

  const object = visibleCartonObject();
  if ( object ) {
    fitViewToObject( object, visibleCartons() );
  }

  updateCartonInfoUI( loadedCartons, loadedRejects, focusedCartonIndex, orientationVisible );
}

function viewCarton( cartonIndex ) {
  packingStep = 0;
  focusedCartonIndex = cartonIndex;
  refreshCartonView();
}

function showAllCartons() {
  packingStep = 0;
  focusedCartonIndex = null;

  cartonGroups.forEach( ( group ) => {
    setCartonInstructionStep( group, 0 );
  } );

  refreshCartonView();
}

function toggleOrientation( visible ) {
  orientationVisible = visible;
  setOrientationMarkersVisible( visible );
}

initCartonInfo( {
  onViewCarton: viewCarton,
  onShowAll: showAllCartons,
  onToggleOrientation: toggleOrientation,
} );

const portalActions = initPortalActions( {
  canvas,
  getOrderId: () => loadedOrderId,
} );

function buildSceneFromData( data ) {
  resetCartonBuildState();
  focusedCartonIndex = null;
  packingStep = 0;

  if ( cartonsGroup ) {
    scene.remove( cartonsGroup );
  }

  /** Scene Data */
  loadedCartons = data.cartons ?? [];
  loadedRejects = data.rejects ?? [];
  loadedOrderId = data.order_id ?? null;

  const built = buildCartonGroups( loadedCartons );
  cartonsGroup = built.cartonsGroup;
  cartonGroups = built.cartonGroups;
  scene.add( cartonsGroup );
  setOrientationMarkersVisible( orientationVisible );

  refreshCartonView();
}

const jsonFileName = solutionSource( canvas );
loadSceneData( jsonFileName )
  .then( buildSceneFromData )
  .catch( ( error ) => {
    console.error( error );
    renderCartonInfoError( error );
    portalActions?.setEnabled( false );
  } );
