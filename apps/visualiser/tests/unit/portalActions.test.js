import { beforeEach, describe, expect, it, vi } from 'vitest';

// Same markup as index.html.
const PAGE = `
  <div id="portal-actions" aria-label="Order actions">
    <button id="cancel-button" type="button">Cancel</button>
    <button id="done-button" type="button">Done</button>
  </div>
  <div id="confirm-dialog" class="confirm-overlay" hidden>
    <div class="confirm-box" role="alertdialog">
      <h2 id="confirm-title"></h2>
      <p id="confirm-message"></p>
      <button id="confirm-back" type="button">Go Back</button>
      <button id="confirm-proceed" type="button"></button>
    </div>
  </div>
  <canvas id="visualiser-canvas" data-portal-url="/portal"></canvas>
`;

let actions;
const $ = ( id ) => document.getElementById( id );
const dialog = () => $( 'confirm-dialog' );

beforeEach( async () => {
  document.body.innerHTML = PAGE;
  vi.resetModules();
  const { initPortalActions } = await import( '../../js/portalActions.js' );
  actions = initPortalActions( { canvas: $( 'visualiser-canvas' ), getOrderId: () => 'FIX-03' } );
} );

describe( 'Done / Cancel confirmation (Req08)', () => {
  it( 'keeps the dialog hidden until a button is pressed', () => {
    expect( dialog().hidden ).toBe( true );
  } );

  it( 'asks to confirm Done', () => {
    $( 'done-button' ).click();
    expect( dialog().hidden ).toBe( false );
    expect( $( 'confirm-title' ).textContent ).toBe( 'Mark packing as done?' );
    expect( $( 'confirm-proceed' ).textContent ).toBe( 'Yes, done' );
    expect( document.activeElement ).toBe( $( 'confirm-proceed' ) );
  } );

  it( 'asks to confirm Cancel', () => {
    $( 'cancel-button' ).click();
    expect( $( 'confirm-title' ).textContent ).toBe( 'Cancel this order?' );
    expect( $( 'confirm-proceed' ).textContent ).toBe( 'Yes, cancel' );
  } );

  it( 'closes on Go Back and returns focus to the button pressed', () => {
    $( 'done-button' ).focus();
    $( 'done-button' ).click();
    $( 'confirm-back' ).click();
    expect( dialog().hidden ).toBe( true );
    expect( document.activeElement ).toBe( $( 'done-button' ) );
  } );

  it( 'closes on Escape', () => {
    $( 'cancel-button' ).click();
    dialog().dispatchEvent( new KeyboardEvent( 'keydown', { key: 'Escape', bubbles: true } ) );
    expect( dialog().hidden ).toBe( true );
  } );

  it( 'closes when clicking outside the box but not inside it', () => {
    $( 'done-button' ).click();
    $( 'confirm-title' ).click();
    expect( dialog().hidden ).toBe( false );
    dialog().click();
    expect( dialog().hidden ).toBe( true );
  } );

  it( 'can disable both buttons and closes an open dialog', () => {
    $( 'done-button' ).click();
    actions.setEnabled( false );
    expect( $( 'done-button' ).disabled ).toBe( true );
    expect( $( 'cancel-button' ).disabled ).toBe( true );
    expect( dialog().hidden ).toBe( true );
    actions.setEnabled( true );
    expect( $( 'done-button' ).disabled ).toBe( false );
  } );

  it( 'does nothing if the page is missing its buttons', async () => {
    document.body.innerHTML = '<canvas id="visualiser-canvas"></canvas>';
    vi.resetModules();
    const { initPortalActions } = await import( '../../js/portalActions.js' );
    expect( initPortalActions( { canvas: $( 'visualiser-canvas' ), getOrderId: () => null } ) ).toBeUndefined();
  } );
} );
