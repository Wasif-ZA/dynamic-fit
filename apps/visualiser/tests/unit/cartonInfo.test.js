import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadFixture } from './fixtures.js';

// cartonInfo.js looks up #carton-info when it is first imported, so each test
// builds the page first and then imports a fresh copy of the modules.
let ui;
let cartons;
let panel;
let handlers;

async function setup() {
  document.body.innerHTML = '<aside id="carton-info" aria-label="Carton Information"></aside>';
  vi.resetModules();
  cartons = await import( '../../js/cartons.js' );
  ui = await import( '../../js/cartonInfo.js' );
  panel = document.getElementById( 'carton-info' );
  handlers = { onViewCarton: vi.fn(), onShowAll: vi.fn(), onToggleOrientation: vi.fn() };
  ui.initCartonInfo( handlers );
}

function render( data, focused = null ) {
  cartons.resetCartonBuildState();
  cartons.buildCartonGroups( data.cartons );
  ui.updateCartonInfoUI( data.cartons, data.rejects, focused );
}

const text = () => panel.textContent.replace( /\s+/g, ' ' );

beforeEach( setup );

describe( 'carton legend (Req04)', () => {
  it( 'shows each carton id, SKU, inner dimensions and total weight', () => {
    render( loadFixture( '01_single_item.json' ) );
    expect( text() ).toContain( 'c1' );
    expect( text() ).toContain( 'BOX-S' );
    expect( text() ).toContain( '220 × 160 × 120 mm' );
    expect( text() ).toContain( 'Total Weight: 0.640 kg' );
  } );

  it( 'lists each placement with its ref, label, weight and tags', () => {
    render( loadFixture( '01_single_item.json' ) );
    const items = panel.querySelectorAll( '.carton-info-entry .placement-info-item' );
    expect( items ).toHaveLength( 1 );
    const item = items[ 0 ].textContent.replace( /\s+/g, ' ' );
    expect( item ).toContain( 'SKU-1183' );
    expect( item ).toContain( 'Wireless Headphones' );
    expect( item ).toContain( 'Weight: 0.640 kg' );
    expect( items[ 0 ].querySelector( '.placement-info-tags' ).textContent ).toContain( 'fragile' );
  } );

  it( 'renders one entry per carton and one row per placement', () => {
    const data = loadFixture( '03_multi_carton.json' );
    render( data );
    const entries = panel.querySelectorAll( 'details.carton-info-entry' );
    expect( entries ).toHaveLength( data.cartons.length );
    entries.forEach( ( entry, i ) => {
      expect( entry.querySelectorAll( '.placement-info-item' ) ).toHaveLength( data.cartons[ i ].placements.length );
    } );
  } );

  it( 'gives swatches of the same item_ref the same colour as the 3D mesh (Req07)', () => {
    const data = loadFixture( '09_large_order.json' );
    render( data );
    const byRef = new Map();
    const rows = [ ...panel.querySelectorAll( '.carton-info-entry .placement-info-item' ) ];
    rows.forEach( ( row ) => {
      const ref = row.querySelector( '.placement-info-ref' ).textContent;
      const colour = row.querySelector( '.placement-swatch' ).style.backgroundColor;
      if ( byRef.has( ref ) ) {
        expect( colour ).toBe( byRef.get( ref ) );
      }
      byRef.set( ref, colour );
    } );
    expect( new Set( byRef.values() ).size ).toBe( byRef.size );
  } );

  it( 'shows "No placements" for an empty carton', () => {
    render( { cartons: [ { carton_id: 'c1', sku: 'S', inner_dims: [ 1, 1, 1 ], contents_mass: 0, placements: [] } ], rejects: [] } );
    expect( text() ).toContain( 'No placements' );
  } );

  it( 'gives every highlight checkbox an accessible label', () => {
    render( loadFixture( '03_multi_carton.json' ) );
    panel.querySelectorAll( '.placement-highlight-toggle' ).forEach( ( box ) => {
      expect( box.getAttribute( 'aria-label' ) ).toMatch( /^Highlight / );
    } );
  } );
} );

describe( 'rejected items (Req05)', () => {
  it( 'lists rejects with their code and message after the cartons', () => {
    const data = loadFixture( '06_partial_rejects.json' );
    render( data );
    const section = panel.querySelector( 'section[aria-labelledby="rejected-items-heading"]' );
    expect( section ).not.toBeNull();
    const rows = section.querySelectorAll( '.placement-info-item' );
    expect( rows ).toHaveLength( data.rejects.length );
    data.rejects.forEach( ( reject, i ) => {
      expect( rows[ i ].textContent ).toContain( reject.item_ref );
      expect( rows[ i ].textContent ).toContain( reject.reason_code );
      expect( rows[ i ].textContent ).toContain( reject.message );
    } );

    const lastCarton = [ ...panel.querySelectorAll( '.carton-info-entry' ) ].at( -1 );
    expect( lastCarton.compareDocumentPosition( section ) & Node.DOCUMENT_POSITION_FOLLOWING ).toBeTruthy();
  } );

  it( 'says "No Rejected Items" when there are none', () => {
    render( loadFixture( '01_single_item.json' ) );
    expect( text() ).toContain( 'No Rejected Items' );
  } );

  it( 'shows only rejects when nothing could be packed', () => {
    const data = loadFixture( '07_all_rejects.json' );
    render( data );
    expect( text() ).toContain( 'No cartons in this solution.' );
    expect( panel.querySelectorAll( 'section .placement-info-item' ) ).toHaveLength( data.rejects.length );
  } );
} );

describe( 'focusing a single carton (Req09)', () => {
  it( 'shows a Focus button per carton only when there are 2+ cartons', () => {
    render( loadFixture( '01_single_item.json' ) );
    expect( panel.querySelectorAll( '.carton-isolate-btn' ) ).toHaveLength( 0 );

    const multi = loadFixture( '03_multi_carton.json' );
    render( multi );
    expect( panel.querySelectorAll( '.carton-isolate-btn' ) ).toHaveLength( multi.cartons.length );
  } );

  it( 'calls onViewCarton with the carton index when Focus is clicked', () => {
    render( loadFixture( '03_multi_carton.json' ) );
    panel.querySelectorAll( '.carton-isolate-btn' )[ 1 ].click();
    expect( handlers.onViewCarton ).toHaveBeenCalledWith( 1 );
  } );

  it( 'renders only the focused carton, with a Back button and no Focus buttons', () => {
    const data = loadFixture( '03_multi_carton.json' );
    render( data, 1 );
    expect( panel.querySelector( '.carton-back-btn' ) ).not.toBeNull();
    expect( panel.querySelectorAll( '.carton-isolate-btn' ) ).toHaveLength( 0 );
    const entries = panel.querySelectorAll( '.carton-info-entry' );
    expect( entries ).toHaveLength( 1 );
    expect( entries[ 0 ].textContent ).toContain( data.cartons[ 1 ].carton_id );
  } );

  it( 'calls onShowAll when Back is clicked', () => {
    render( loadFixture( '03_multi_carton.json' ), 0 );
    panel.querySelector( '.carton-back-btn' ).click();
    expect( handlers.onShowAll ).toHaveBeenCalledOnce();
  } );

  it( 'remembers which cartons were expanded after Focus → Back', () => {
    const data = loadFixture( '03_multi_carton.json' );
    render( data );
    panel.querySelectorAll( 'details.carton-info-entry' )[ 0 ].open = true;
    panel.querySelectorAll( '.carton-isolate-btn' )[ 1 ].click();
    render( data, 1 );
    render( data, null );
    const entries = panel.querySelectorAll( 'details.carton-info-entry' );
    expect( entries[ 0 ].open ).toBe( true );
    expect( entries[ 1 ].open ).toBe( false );
  } );
} );

describe( 'contents toggle and highlighting', () => {
  it( 'expands and collapses a carton with the Contents button', () => {
    render( loadFixture( '03_multi_carton.json' ) );
    const entry = panel.querySelector( 'details.carton-info-entry' );
    const button = entry.querySelector( '.carton-expand-btn' );
    expect( entry.open ).toBe( false );
    button.click();
    expect( entry.open ).toBe( true );
    button.click();
    expect( entry.open ).toBe( false );
  } );

  it( 'highlights the matching 3D placement when its checkbox is ticked', () => {
    render( loadFixture( '03_multi_carton.json' ) );
    const box = panel.querySelectorAll( '.placement-highlight-toggle' )[ 2 ];
    const index = Number( box.dataset.placementIndex );
    box.checked = true;
    box.dispatchEvent( new Event( 'change', { bubbles: true } ) );
    expect( cartons.isPlacementHighlighted( index ) ).toBe( true );
    box.checked = false;
    box.dispatchEvent( new Event( 'change', { bubbles: true } ) );
    expect( cartons.isPlacementHighlighted( index ) ).toBe( false );
  } );

  it( 'numbers placement checkboxes across all cartons in order', () => {
    const data = loadFixture( '03_multi_carton.json' );
    render( data );
    const indexes = [ ...panel.querySelectorAll( '.placement-highlight-toggle' ) ].map( ( b ) => Number( b.dataset.placementIndex ) );
    const total = data.cartons.reduce( ( n, c ) => n + c.placements.length, 0 );
    expect( indexes ).toEqual( Array.from( { length: total }, ( _, i ) => i ) );
  } );

  it( 'keeps checkbox indexes global when a carton is focused', () => {
    const data = loadFixture( '03_multi_carton.json' );
    render( data, 1 );
    const first = Number( panel.querySelector( '.placement-highlight-toggle' ).dataset.placementIndex );
    expect( first ).toBe( data.cartons[ 0 ].placements.length );
  } );
} );

describe( 'orientation arrows checkbox', () => {
  const toggle = () => panel.querySelector( '#orientation-visibility-toggle' );

  it( 'is shown unticked by default', () => {
    render( loadFixture( '03_multi_carton.json' ) );
    expect( toggle() ).not.toBeNull();
    expect( toggle().checked ).toBe( false );
    expect( toggle().closest( 'label' ).textContent ).toContain( 'Show item orientation arrows' );
  } );

  it( 'stays ticked across re-renders when arrows are on', () => {
    const data = loadFixture( '03_multi_carton.json' );
    cartons.buildCartonGroups( data.cartons );
    ui.updateCartonInfoUI( data.cartons, data.rejects, 1, true );
    expect( toggle().checked ).toBe( true );
  } );

  it( 'calls onToggleOrientation when ticked and unticked', () => {
    render( loadFixture( '03_multi_carton.json' ) );
    toggle().checked = true;
    toggle().dispatchEvent( new Event( 'change', { bubbles: true } ) );
    expect( handlers.onToggleOrientation ).toHaveBeenLastCalledWith( true );
    toggle().checked = false;
    toggle().dispatchEvent( new Event( 'change', { bubbles: true } ) );
    expect( handlers.onToggleOrientation ).toHaveBeenLastCalledWith( false );
  } );

  it( 'does not toggle any item highlight', () => {
    render( loadFixture( '03_multi_carton.json' ) );
    toggle().checked = true;
    toggle().dispatchEvent( new Event( 'change', { bubbles: true } ) );
    expect( cartons.isPlacementHighlighted( 0 ) ).toBe( false );
  } );
} );

describe( 'error state (Req06)', () => {
  it( 'shows "File Not Found" for a 404', () => {
    ui.renderCartonInfoError( Object.assign( new Error( 'nope' ), { status: 404 } ) );
    expect( text() ).toContain( 'Error: File Not Found' );
    expect( text() ).toContain( 'Please return and try again' );
  } );

  it( 'shows "Failure to Load" for any other error', () => {
    ui.renderCartonInfoError( new SyntaxError( 'Unexpected token' ) );
    expect( text() ).toContain( 'Error: Failure to Load' );
  } );
} );

describe( 'without the panel element', () => {
  it( 'does nothing instead of throwing', async () => {
    document.body.innerHTML = '';
    vi.resetModules();
    const bare = await import( '../../js/cartonInfo.js' );
    expect( () => bare.initCartonInfo( { onViewCarton() {}, onShowAll() {} } ) ).not.toThrow();
    expect( () => bare.updateCartonInfoUI( [], [] ) ).not.toThrow();
    expect( () => bare.renderCartonInfoError( new Error() ) ).not.toThrow();
  } );
} );
