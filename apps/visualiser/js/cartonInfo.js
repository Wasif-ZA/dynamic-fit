import { colorForItemRef, colorToHex, isPlacementHighlighted, setPlacementHighlighted } from './cartons.js';

const panel = document.getElementById( 'carton-info' );

let onViewCarton = () => {};
let onShowAll = () => {};
let savedListScrollTop = 0;
const savedOpenCartonIndexes = new Set();

function saveListUiState() {
  if ( !panel ) {
    return;
  }

  savedListScrollTop = panel.scrollTop;
  savedOpenCartonIndexes.clear();
  panel.querySelectorAll( 'details.carton-info-entry[open]' ).forEach( ( entry ) => {
    savedOpenCartonIndexes.add( Number( entry.dataset.cartonIndex ) );
  } );
}

function restoreListScroll() {
  if ( !panel ) {
    return;
  }

  const top = savedListScrollTop;
  requestAnimationFrame( () => {
    panel.scrollTop = top;
  } );
}

export function initCartonInfo( handlers ) {
  onViewCarton = handlers.onViewCarton;
  onShowAll = handlers.onShowAll;
  bindCartonInfoEvents();
}

function placementStartIndex( cartons, cartonIndex ) {
  let start = 0;
  for ( let i = 0; i < cartonIndex; i++ ) {
    start += cartons[ i ].placements?.length ?? 0;
  }
  return start;
}

function rejectItemsHtml( rejects ) {
  return rejects.map( ( reject ) => {
    return `
      <li class="placement-info-item">
        <div class="placement-info-text">
          <p class="placement-info-ref">${ reject.item_ref }</p>
          <div class="placement-info-label">
            <p>${ reject.reason_code }</p>
            <p>${ reject.message }</p>
          </div>
        </div>
      </li>
    `;
  } ).join( '' );
}

function rejectsSectionHtml( rejects ) {
  return `
    <section aria-labelledby="rejected-items-heading">
      <h2 id="rejected-items-heading" class="carton-info-heading"><strong>Rejected Items</strong></h2>
      ${ rejects.length > 0
        ? `<ul class="placement-info-list">${ rejectItemsHtml( rejects ) }</ul>`
        : '<p class="placement-info-empty">No Rejected Items</p>'
      }
    </section>
  `;
}

function placementItemsHtml( placements, startIndex ) {
  return placements.map( ( placement, offset ) => {
    const placementIndex = startIndex + offset;
    const colorHex = colorToHex( colorForItemRef( placement.item_ref ) );
    const checked = isPlacementHighlighted( placementIndex ) ? 'checked' : '';
    return `
      <li class="placement-info-item">
        <input
          type="checkbox"
          class="placement-highlight-toggle"
          data-placement-index="${ placementIndex }"
          ${ checked }
          aria-label="Highlight ${ placement.item_ref }"
        >
        <span class="placement-swatch" style="background-color: ${ colorHex }" aria-hidden="true"></span>
        <div class="placement-info-text">
          <p class="placement-info-ref">${ placement.item_ref }</p>
          <div class="placement-info-label">
            <p>${ placement.label }</p>
            <p>Weight: ${ ( placement.mass / 1000 ).toFixed( 3 ) } kg</p>
            ${ placement.tags.length > 0
              ? `<ul class="placement-info-tags">${ placement.tags.map( ( tag ) => {
                return `
                  <li>${ tag }</li>
                `;
              } ).join( '' ) }</ul>`
              : ''
            }
          </div>
        </div>
      </li>
    `;
  } ).join( '' );
}

function cartonHeadingHtml( carton ) {
  const [ x, y, z ] = carton.inner_dims;
  return `
    <hgroup class="carton-info-main">
      <h2 class="carton-info-heading">
        <strong class="carton-info-id">${ carton.carton_id }</strong>
        ${ carton.sku }
      </h2>
      <p class="carton-info-dims">
        ${ x } × ${ y } × ${ z } mm
        <br>
        Total Weight: ${ ( carton.contents_mass / 1000 ).toFixed( 3 ) } kg
      </p>
    </hgroup>
  `;
}

function cartonContentsHtml( placements, startIndex ) {
  return placements.length > 0
    ? `<ul class="placement-info-list">${ placementItemsHtml( placements, startIndex ) }</ul>`
    : '<p class="placement-info-empty">No placements</p>';
}

function cartonEntryHtml( carton, cartonIndex, startIndex, { showIsolateButton, collapsible, open } ) {
  const placements = carton.placements ?? [];
  const isolateButton = showIsolateButton
    ? `<button type="button" class="carton-action-btn carton-isolate-btn" data-carton-index="${ cartonIndex }" aria-label="Focus on box ${ carton.carton_id }">Focus</button>`
    : '';

  if ( !collapsible ) {
    return `
      <article class="carton-info-entry carton-info-entry-isolated">
        <header class="carton-info-summary">
          ${ cartonHeadingHtml( carton ) }
        </header>
        ${ cartonContentsHtml( placements, startIndex ) }
      </article>
    `;
  }

  return `
    <details class="carton-info-entry" data-carton-index="${ cartonIndex }" ${ open ? 'open' : '' }>
      <summary class="carton-info-summary">
        ${ cartonHeadingHtml( carton ) }
        <span class="carton-entry-actions">
          ${ isolateButton }
          <button
            type="button"
            class="carton-action-btn carton-expand-btn"
            aria-expanded="${ open ? 'true' : 'false' }"
            aria-label="Contents of box ${ carton.carton_id }"
          >
            <span class="carton-expand-label">Contents</span>
            <span class="carton-collapse-label">Collapse</span>
          </button>
        </span>
      </summary>
      ${ cartonContentsHtml( placements, startIndex ) }
    </details>
  `;
}

export function updateCartonInfoUI( cartons, rejects, focusedCartonIndex = null ) {
  if ( !panel ) {
    return;
  }

  if ( cartons.length === 0 ) {
    panel.innerHTML = `
      <p class="carton-info-empty">No cartons in this solution.</p>
      <br>
      ${ rejectsSectionHtml( rejects ) }
    `;
    return;
  }

  const isolated = focusedCartonIndex !== null;
  const showIsolateButtons = cartons.length > 1 && !isolated;
  const cartonIndexes = isolated
    ? [ focusedCartonIndex ]
    : cartons.map( ( _, index ) => index );

  let content = '';
  if ( isolated ) {
    content += `
      <div class="carton-focus-bar">
        <button type="button" class="carton-action-btn carton-back-btn" aria-label="Back to all cartons">Back</button>
      </div>
    `;
  }

  content += cartonIndexes.map( ( cartonIndex ) => {
    return cartonEntryHtml(
      cartons[ cartonIndex ],
      cartonIndex,
      placementStartIndex( cartons, cartonIndex ),
      {
        showIsolateButton: showIsolateButtons,
        collapsible: !isolated,
        open: savedOpenCartonIndexes.has( cartonIndex ),
      },
    );
  } ).join( '' );

  content += `
    <br>
    ${ rejectsSectionHtml( rejects ) }
  `;

  panel.innerHTML = content;
}

export function renderCartonInfoError( error ) {
  if ( !panel ) {
    return;
  }

  panel.innerHTML = `
    <h2 class="carton-info-heading"><strong>Error: ${ error.status == 404 ? `File Not Found` : `Failure to Load` }</strong></h2>
    <p>Please return and try again</p>
  `;
}

function bindCartonInfoEvents() {
  if ( !panel || panel.dataset.eventsBound === 'true' ) {
    return;
  }
  panel.dataset.eventsBound = 'true';

  panel.addEventListener( 'pointerdown', ( event ) => {
    if ( event.target.closest( '.carton-isolate-btn, .carton-back-btn' ) ) {
      event.preventDefault();
      event.stopPropagation();
    }
  } );

  panel.addEventListener( 'toggle', ( event ) => {
    const entry = event.target;
    if ( !( entry instanceof HTMLDetailsElement ) ) {
      return;
    }
    entry.querySelector( '.carton-expand-btn' )?.setAttribute( 'aria-expanded', entry.open ? 'true' : 'false' );
  }, true );

  panel.addEventListener( 'click', ( event ) => {
    const expandButton = event.target.closest( '.carton-expand-btn' );
    if ( expandButton ) {
      event.preventDefault();
      const entry = expandButton.closest( 'details' );
      entry.open = !entry.open;
      return;
    }

    const isolateButton = event.target.closest( '.carton-isolate-btn' );
    if ( isolateButton ) {
      event.preventDefault();
      event.stopPropagation();
      saveListUiState();
      onViewCarton( Number( isolateButton.dataset.cartonIndex ) );
      panel.scrollTop = 0;
      requestAnimationFrame( () => {
        panel.scrollTop = 0;
      } );
      return;
    }

    const backButton = event.target.closest( '.carton-back-btn' );
    if ( backButton ) {
      event.preventDefault();
      event.stopPropagation();
      onShowAll();
      restoreListScroll();
    }
  } );

  panel.addEventListener( 'change', ( event ) => {
    const toggle = event.target;
    if ( !( toggle instanceof HTMLInputElement ) || !toggle.classList.contains( 'placement-highlight-toggle' ) ) {
      return;
    }
    setPlacementHighlighted( Number( toggle.dataset.placementIndex ), toggle.checked );
  } );
}
