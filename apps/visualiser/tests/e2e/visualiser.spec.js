import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const FIXTURE_DIR = join( import.meta.dirname, '../../fixtures' );
const fixture = ( name ) => JSON.parse( readFileSync( join( FIXTURE_DIR, name ), 'utf8' ) );
const fixtureNames = readdirSync( FIXTURE_DIR ).filter( ( f ) => f.endsWith( '.json' ) ).sort();

const open = ( page, name ) => page.goto( name ? `/?solution=/fixtures/${ name }` : '/' );
const aside = ( page ) => page.getByRole( 'complementary', { name: 'Carton Information' } );
const sceneLabels = ( page ) => page.locator( 'div.label' );

// Answer requests for one path with a canned response. Matches on pathname only,
// so the page URL (which carries the path in ?solution=) is left alone.
const mockPath = ( page, path, response ) =>
  page.route( ( url ) => url.pathname === path, ( route ) => route.fulfill( response ) );

// Fail any test that hits an uncaught error in the page.
test.beforeEach( ( { page } ) => {
  page.on( 'pageerror', ( error ) => {
    throw error;
  } );
} );

test.describe( 'loading a solution (Req01, Req02)', () => {
  test( 'loads the default fixture from the canvas data-json attribute', async ( { page } ) => {
    await open( page );
    const data = fixture( '09_large_order.json' );
    await expect( aside( page ).locator( 'details.carton-info-entry' ) ).toHaveCount( data.cartons.length );
    await expect( page.locator( '#visualiser-canvas' ) ).toBeVisible();
  } );

  for ( const name of fixtureNames ) {
    test( `renders ${ name } in the scene and the legend`, async ( { page } ) => {
      const data = fixture( name );
      await open( page, name );

      // Every 3D label is a carton_id. Labels only exist for cartons in view,
      // so a long row (e.g. 20 cartons) shows a subset until you pan.
      const ids = data.cartons.map( ( c ) => c.carton_id );
      if ( ids.length > 0 ) {
        await expect( sceneLabels( page ).first() ).toBeAttached();
      }
      for ( const label of await sceneLabels( page ).allTextContents() ) {
        expect( ids ).toContain( label );
      }
      if ( ids.length <= 6 ) {
        await expect( sceneLabels( page ) ).toHaveText( ids );
      }

      // One legend row per placement and one per reject.
      const placements = data.cartons.reduce( ( n, c ) => n + c.placements.length, 0 );
      await expect( aside( page ).locator( '.carton-info-entry .placement-info-item' ) ).toHaveCount( placements );
      await expect( aside( page ).locator( 'section .placement-info-item' ) ).toHaveCount( data.rejects.length );
    } );
  }

  test( 'draws something on the WebGL canvas', async ( { page } ) => {
    await open( page, '01_single_item.json' );
    await expect( sceneLabels( page ) ).toHaveCount( 1 );
    const shot = await page.locator( '#visualiser-canvas' ).screenshot();
    expect( shot.byteLength ).toBeGreaterThan( 5_000 ); // a blank canvas compresses to almost nothing
  } );
} );

test.describe( 'camera controls (Req03)', () => {
  test( 'dragging on the canvas rotates the camera', async ( { page, isMobile } ) => {
    test.skip( isMobile, 'mouse drag is a desktop interaction' );
    await open( page, '01_single_item.json' );
    const label = sceneLabels( page ).first();
    await expect( label ).toBeVisible();
    const before = await label.evaluate( ( el ) => el.style.transform );

    const box = await page.locator( '#visualiser-canvas' ).boundingBox();
    const x = box.x + box.width * 0.7;
    const y = box.y + box.height * 0.5;
    await page.mouse.move( x, y );
    await page.mouse.down();
    await page.mouse.move( x + 150, y + 40, { steps: 10 } );
    await page.mouse.up();

    await expect.poll( () => label.evaluate( ( el ) => el.style.transform ) ).not.toBe( before );
  } );

  test( 'scrolling on the canvas zooms the camera', async ( { page, isMobile } ) => {
    test.skip( isMobile, 'mouse wheel is a desktop interaction' );
    await open( page, '01_single_item.json' );
    const label = sceneLabels( page ).first();
    await expect( label ).toBeVisible();
    const before = await label.evaluate( ( el ) => el.style.transform );

    const box = await page.locator( '#visualiser-canvas' ).boundingBox();
    await page.mouse.move( box.x + box.width * 0.7, box.y + box.height * 0.5 );
    await page.mouse.wheel( 0, -500 );

    await expect.poll( () => label.evaluate( ( el ) => el.style.transform ) ).not.toBe( before );
  } );
} );

test.describe( 'legend (Req04, Req05)', () => {
  test( 'shows carton details and expands to show its contents', async ( { page } ) => {
    await open( page, '03_multi_carton.json' );
    const first = aside( page ).locator( 'details.carton-info-entry' ).first();
    await expect( first ).toContainText( 'c1' );
    await expect( first ).not.toHaveAttribute( 'open' );

    await first.getByRole( 'button', { name: 'Contents of box c1' } ).click();
    await expect( first ).toHaveAttribute( 'open' );
    await expect( first.locator( '.placement-info-item' ).first() ).toBeVisible();
    await expect( first.getByRole( 'button', { name: 'Contents of box c1' } ) ).toHaveAttribute( 'aria-expanded', 'true' );
  } );

  test( 'lists rejected items after the cartons', async ( { page } ) => {
    const data = fixture( '06_partial_rejects.json' );
    await open( page, '06_partial_rejects.json' );
    const rejects = aside( page ).getByRole( 'region', { name: 'Rejected Items' } );
    for ( const reject of data.rejects ) {
      await expect( rejects ).toContainText( reject.item_ref );
      await expect( rejects ).toContainText( reject.reason_code );
    }
  } );

  test( 'shows the empty state when every item was rejected', async ( { page } ) => {
    await open( page, '07_all_rejects.json' );
    await expect( aside( page ) ).toContainText( 'No cartons in this solution.' );
    await expect( sceneLabels( page ) ).toHaveCount( 0 );
  } );

  test( 'can be scrolled when the list is long', async ( { page } ) => {
    await open( page, '11_bulk_250.json' );
    const panel = aside( page );
    await panel.locator( 'details.carton-info-entry' ).first().getByRole( 'button', { name: /^Contents of box/ } ).click();
    const { scrollHeight, clientHeight } = await panel.evaluate( ( el ) => ( { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight } ) );
    expect( scrollHeight ).toBeGreaterThan( clientHeight );
    await panel.evaluate( ( el ) => { el.scrollTop = 200; } );
    expect( await panel.evaluate( ( el ) => el.scrollTop ) ).toBeGreaterThan( 0 );
  } );

  test( 'ticking a highlight checkbox keeps it ticked', async ( { page } ) => {
    await open( page, '01_single_item.json' );
    await aside( page ).getByRole( 'button', { name: 'Contents of box c1' } ).click();
    const toggle = aside( page ).getByRole( 'checkbox', { name: 'Highlight SKU-1183' } );
    await toggle.check();
    await expect( toggle ).toBeChecked();
  } );
} );

test.describe( 'focus on one carton (Req09)', () => {
  test( 'Focus shows one carton, Back shows them all again', async ( { page } ) => {
    await open( page, '03_multi_carton.json' );
    await aside( page ).getByRole( 'button', { name: 'Focus on box c2' } ).click();

    await expect( aside( page ).getByRole( 'button', { name: 'Back to all cartons' } ) ).toBeVisible();
    await expect( aside( page ).locator( '.carton-info-entry' ) ).toHaveCount( 1 );
    await expect( aside( page ).locator( '.carton-info-entry' ) ).toContainText( 'c2' );
    await expect( sceneLabels( page ).filter( { visible: true } ) ).toHaveText( [ 'c2' ] );

    await aside( page ).getByRole( 'button', { name: 'Back to all cartons' } ).click();
    await expect( aside( page ).locator( 'details.carton-info-entry' ) ).toHaveCount( 2 );
    await expect( sceneLabels( page ).filter( { visible: true } ) ).toHaveText( [ 'c1', 'c2' ] );
  } );

  test( 'focusing the last carton of a long row brings it into view', async ( { page } ) => {
    const data = fixture( '11_bulk_250.json' );
    const last = data.cartons.at( -1 ).carton_id;
    await open( page, '11_bulk_250.json' );
    await aside( page ).getByRole( 'button', { name: `Focus on box ${ last }` } ).click();
    await expect( sceneLabels( page ).filter( { visible: true } ) ).toHaveText( [ last ] );
  } );

  test( 'does not offer Focus when there is only one carton', async ( { page } ) => {
    await open( page, '01_single_item.json' );
    await expect( aside( page ).locator( 'details.carton-info-entry' ) ).toHaveCount( 1 );
    await expect( aside( page ).getByRole( 'button', { name: /^Focus on box/ } ) ).toHaveCount( 0 );
  } );
} );

test.describe( 'LEGO packing steps (Req10)', () => {
  const steps = ( page ) => page.getByRole( 'region', { name: 'Step-by-step packing instructions' } );
  const progressLabel = ( page ) => page.locator( '#packing-progress-label' );
  const stepName = ( page ) => page.locator( '#packing-step-name' );
  const progressValue = ( page ) => page.locator( '#packing-progress' ).evaluate( ( el ) => [ el.value, el.max ] );

  async function focusCarton( page, name, cartonId ) {
    await open( page, name );
    await aside( page ).getByRole( 'button', { name: `Focus on box ${ cartonId }` } ).click();
    await expect( steps( page ) ).toBeVisible();
  }

  test( 'are hidden until a carton is focused', async ( { page } ) => {
    await open( page, '03_multi_carton.json' );
    await expect( aside( page ).locator( 'details.carton-info-entry' ) ).toHaveCount( 2 );
    await expect( steps( page ) ).toBeHidden();
  } );

  test( 'are shown for a solution with one carton', async ( { page } ) => {
    const placements = fixture( '01_single_item.json' ).cartons[ 0 ].placements;
    await open( page, '01_single_item.json' );
    await expect( aside( page ).getByRole( 'button', { name: /^Focus on box/ } ) ).toHaveCount( 0 );
    await expect( steps( page ) ).toBeVisible();
    await expect( steps( page ).getByRole( 'button', { name: 'Exit' } ) ).toHaveCount( 0 );
    await expect( progressLabel( page ) ).toHaveText( 'Completed' );
    await expect( stepName( page ) ).toHaveText( 'All items' );

    await steps( page ).getByRole( 'button', { name: /Next/ } ).click();
    await expect( progressLabel( page ) ).toHaveText( `Step 1 of ${ placements.length }` );
    await expect( stepName( page ) ).toHaveText( placements[ 0 ].item_ref );
  } );

  test( 'start on the completed view with a full progress bar', async ( { page } ) => {
    await focusCarton( page, '03_multi_carton.json', 'c1' );
    await expect( progressLabel( page ) ).toHaveText( 'Completed' );
    await expect( stepName( page ) ).toHaveText( 'All items' );
    const total = fixture( '03_multi_carton.json' ).cartons[ 0 ].placements.length;
    expect( await progressValue( page ) ).toEqual( [ total, total ] );
  } );

  test( 'Next steps through every item in packing order, then back to completed', async ( { page } ) => {
    const placements = fixture( '03_multi_carton.json' ).cartons[ 0 ].placements;
    await focusCarton( page, '03_multi_carton.json', 'c1' );
    const next = steps( page ).getByRole( 'button', { name: /Next/ } );

    for ( let i = 0; i < placements.length; i++ ) {
      await next.click();
      await expect( progressLabel( page ) ).toHaveText( `Step ${ i + 1 } of ${ placements.length }` );
      await expect( stepName( page ) ).toHaveText( placements[ i ].item_ref );
      expect( await progressValue( page ) ).toEqual( [ i + 1, placements.length ] );
    }

    await next.click();
    await expect( progressLabel( page ) ).toHaveText( 'Completed' );
  } );

  test( 'Previous from the completed view wraps to the last item', async ( { page } ) => {
    const placements = fixture( '03_multi_carton.json' ).cartons[ 1 ].placements;
    await focusCarton( page, '03_multi_carton.json', 'c2' );
    await steps( page ).getByRole( 'button', { name: /Previous/ } ).click();
    await expect( progressLabel( page ) ).toHaveText( `Step ${ placements.length } of ${ placements.length }` );
    await expect( stepName( page ) ).toHaveText( placements.at( -1 ).item_ref );
  } );

  test( 'Exit returns to all cartons and hides the steps', async ( { page } ) => {
    await focusCarton( page, '03_multi_carton.json', 'c1' );
    await steps( page ).getByRole( 'button', { name: /Next/ } ).click();
    await steps( page ).getByRole( 'button', { name: 'Exit' } ).click();
    await expect( steps( page ) ).toBeHidden();
    await expect( aside( page ).locator( 'details.carton-info-entry' ) ).toHaveCount( 2 );
    await expect( sceneLabels( page ).filter( { visible: true } ) ).toHaveText( [ 'c1', 'c2' ] );
  } );

  test( 'the sidebar Back button also hides the steps', async ( { page } ) => {
    await focusCarton( page, '03_multi_carton.json', 'c1' );
    await aside( page ).getByRole( 'button', { name: 'Back to all cartons' } ).click();
    await expect( steps( page ) ).toBeHidden();
  } );

  test( 'restart from the completed view when another carton is focused', async ( { page } ) => {
    await focusCarton( page, '03_multi_carton.json', 'c1' );
    await steps( page ).getByRole( 'button', { name: /Next/ } ).click();
    await steps( page ).getByRole( 'button', { name: 'Exit' } ).click();
    await aside( page ).getByRole( 'button', { name: 'Focus on box c2' } ).click();
    await expect( progressLabel( page ) ).toHaveText( 'Completed' );
  } );

  test( 'stay on screen', async ( { page } ) => {
    await focusCarton( page, '09_large_order.json', 'c1' );
    const box = await steps( page ).boundingBox();
    const viewport = page.viewportSize();
    expect( box.x ).toBeGreaterThanOrEqual( 0 );
    expect( box.y ).toBeGreaterThanOrEqual( 0 );
    expect( box.x + box.width ).toBeLessThanOrEqual( viewport.width );
    expect( box.y + box.height ).toBeLessThanOrEqual( viewport.height );
  } );
} );

test.describe( 'Done / Cancel back to the Portal (Req08)', () => {
  const dialog = ( page ) => page.getByRole( 'alertdialog' );
  const button = ( page, name ) => page.getByRole( 'button', { name, exact: true } );
  // The Portal adds ?portal= for finalised orders; without it Done and Cancel are hidden.
  const openForPortal = ( page, name ) => page.goto( `/?solution=/fixtures/${ name }&portal=/portal` );

  // Stand-in Portal so the redirect lands on a real page.
  const stubPortal = ( page, path = '/portal' ) =>
    mockPath( page, path, { status: 200, contentType: 'text/html', body: '<h1>Portal</h1>' } );

  async function confirm( page, which ) {
    await expect( aside( page ).locator( '.carton-info-entry' ).first() ).toBeVisible();
    await button( page, which ).click();
    await expect( dialog( page ) ).toBeVisible();
    await dialog( page ).getByRole( 'button', { name: which === 'Done' ? 'Yes, done' : 'Yes, cancel' } ).click();
  }

  test( 'hides Done and Cancel when the Portal does not ask for them', async ( { page } ) => {
    await open( page, '03_multi_carton.json' );
    await expect( aside( page ).locator( '.carton-info-entry' ).first() ).toBeVisible();
    await expect( button( page, 'Done' ) ).toBeHidden();
    await expect( button( page, 'Cancel' ) ).toBeHidden();
  } );

  test( 'shows Done and Cancel once a solution loads', async ( { page } ) => {
    await openForPortal( page, '03_multi_carton.json' );
    await expect( button( page, 'Done' ) ).toBeEnabled();
    await expect( button( page, 'Cancel' ) ).toBeEnabled();
  } );

  test( 'Done asks for confirmation, then returns OrderID and complete=true', async ( { page } ) => {
    await stubPortal( page );
    await openForPortal( page, '03_multi_carton.json' );
    await confirm( page, 'Done' );
    await page.waitForURL( '**/portal?*' );
    const url = new URL( page.url() );
    expect( url.searchParams.get( 'OrderID' ) ).toBe( fixture( '03_multi_carton.json' ).order_id );
    expect( url.searchParams.get( 'complete' ) ).toBe( 'true' );
  } );

  test( 'Cancel asks for confirmation, then returns OrderID and complete=false', async ( { page } ) => {
    await stubPortal( page );
    await openForPortal( page, '06_partial_rejects.json' );
    await confirm( page, 'Cancel' );
    await page.waitForURL( '**/portal?*' );
    const url = new URL( page.url() );
    expect( url.searchParams.get( 'OrderID' ) ).toBe( fixture( '06_partial_rejects.json' ).order_id );
    expect( url.searchParams.get( 'complete' ) ).toBe( 'false' );
  } );

  test( 'Go Back and Escape close the dialog without leaving the page', async ( { page } ) => {
    await openForPortal( page, '03_multi_carton.json' );
    await button( page, 'Done' ).click();
    await dialog( page ).getByRole( 'button', { name: 'Go Back' } ).click();
    await expect( dialog( page ) ).toBeHidden();

    await button( page, 'Cancel' ).click();
    await page.keyboard.press( 'Escape' );
    await expect( dialog( page ) ).toBeHidden();
    expect( new URL( page.url() ).pathname ).toBe( '/' );
  } );

  test( 'uses an allowed ?portal= address', async ( { page } ) => {
    await stubPortal( page, '/custom-portal' );
    await page.goto( '/?solution=/fixtures/01_single_item.json&portal=/custom-portal' );
    await confirm( page, 'Done' );
    await page.waitForURL( '**/custom-portal?*' );
  } );

  test( 'ignores an off-site ?portal= address and uses the default', async ( { page } ) => {
    await stubPortal( page );
    await page.goto( '/?solution=/fixtures/01_single_item.json&portal=https://evil.example.com/steal' );
    await confirm( page, 'Done' );
    await page.waitForURL( '**/portal?*' );
    expect( new URL( page.url() ).hostname ).toBe( 'localhost' );
  } );

  test( 'disables Done and Cancel when the solution fails to load', async ( { page } ) => {
    await mockPath( page, '/fixtures/does_not_exist.json', { status: 404, body: 'Not Found' } );
    await openForPortal( page, 'does_not_exist.json' );
    await expect( aside( page ) ).toContainText( 'Error: File Not Found' );
    await expect( button( page, 'Done' ) ).toBeDisabled();
    await expect( button( page, 'Cancel' ) ).toBeDisabled();
  } );

  test( 'do not cover the sidebar or the packing steps', async ( { page } ) => {
    await openForPortal( page, '03_multi_carton.json' );
    await aside( page ).getByRole( 'button', { name: 'Focus on box c1' } ).click();
    const actions = await page.locator( '#portal-actions' ).boundingBox();
    // Compare against the visible cards; #packing-steps itself is a large transparent wrapper.
    for ( const selector of [ '#carton-info', '.packing-progress-row', '.packing-step-nav' ] ) {
      const other = await page.locator( selector ).boundingBox();
      const overlap = !( actions.x + actions.width <= other.x || other.x + other.width <= actions.x ||
        actions.y + actions.height <= other.y || other.y + other.height <= actions.y );
      expect( overlap, `#portal-actions overlaps ${ selector }` ).toBe( false );
    }
  } );
} );

test.describe( 'orientation arrows', () => {
  const toggle = ( page ) => aside( page ).getByRole( 'checkbox', { name: 'Show item orientation arrows' } );
  // The arrows are drawn in WebGL, so compare pictures of the 3D scene. The sidebar and
  // buttons are masked out so the checkbox's own tick and focus ring don't count as a change.
  const canvasShot = ( page ) => page.locator( '#visualiser-canvas' ).screenshot( {
    mask: [ aside( page ), page.locator( '#portal-actions' ), page.locator( 'h1' ) ],
  } );

  test( 'appear when the checkbox is ticked and go when unticked', async ( { page } ) => {
    await open( page, '01_single_item.json' );
    await expect( sceneLabels( page ) ).toHaveCount( 1 );
    await expect( toggle( page ) ).not.toBeChecked();
    const without = await canvasShot( page );

    await toggle( page ).check();
    await expect.poll( async () => ( await canvasShot( page ) ).equals( without ) ).toBe( false );

    await toggle( page ).uncheck();
    await expect.poll( async () => ( await canvasShot( page ) ).equals( without ) ).toBe( true );
  } );

  test( 'stay ticked after focusing a carton and going back', async ( { page } ) => {
    await open( page, '03_multi_carton.json' );
    await toggle( page ).check();
    await aside( page ).getByRole( 'button', { name: 'Focus on box c2' } ).click();
    await expect( toggle( page ) ).toBeChecked();
    await aside( page ).getByRole( 'button', { name: 'Back to all cartons' } ).click();
    await expect( toggle( page ) ).toBeChecked();
  } );
} );

test.describe( 'error handling (Req06)', () => {
  test( 'shows "File Not Found" for a missing solution file', async ( { page } ) => {
    // Vite's dev server answers unknown paths with index.html, so stub a real 404
    // the way a static host or the Portal would send it.
    await mockPath( page, '/fixtures/does_not_exist.json', { status: 404, body: 'Not Found' } );
    await open( page, 'does_not_exist.json' );
    await expect( aside( page ) ).toContainText( 'Error: File Not Found' );
    await expect( sceneLabels( page ) ).toHaveCount( 0 );
  } );

  test( 'shows "Failure to Load" for malformed JSON', async ( { page } ) => {
    await mockPath( page, '/fixtures/broken.json', { status: 200, contentType: 'application/json', body: '{ "cartons": [ oops' } );
    await open( page, 'broken.json' );
    await expect( aside( page ) ).toContainText( 'Error: Failure to Load' );
  } );

  test( 'shows "Failure to Load" when the server errors', async ( { page } ) => {
    await mockPath( page, '/fixtures/server_error.json', { status: 500, body: 'boom' } );
    await open( page, 'server_error.json' );
    await expect( aside( page ) ).toContainText( 'Error: Failure to Load' );
  } );

  test( 'ignores an off-origin ?solution= URL and loads the default', async ( { page } ) => {
    const requests = [];
    page.on( 'request', ( r ) => requests.push( new URL( r.url() ).hostname ) );
    await page.goto( '/?solution=https://example.com/evil.json' );
    await expect( aside( page ).locator( 'details.carton-info-entry' ) ).toHaveCount( fixture( '09_large_order.json' ).cartons.length );
    expect( requests ).not.toContain( 'example.com' );
  } );
} );

test.describe( 'layout', () => {
  test( 'keeps the legend inside the viewport', async ( { page } ) => {
    await open( page, '09_large_order.json' );
    const box = await aside( page ).boundingBox();
    const viewport = page.viewportSize();
    expect( box.x ).toBeGreaterThanOrEqual( 0 );
    expect( box.y ).toBeGreaterThanOrEqual( 0 );
    expect( box.x + box.width ).toBeLessThanOrEqual( viewport.width );
    expect( box.y + box.height ).toBeLessThanOrEqual( viewport.height );
  } );

  test( 'docks the legend to the bottom on mobile', async ( { page, isMobile } ) => {
    test.skip( !isMobile, 'mobile layout only' );
    await open( page, '09_large_order.json' );
    const box = await aside( page ).boundingBox();
    const viewport = page.viewportSize();
    expect( box.width ).toBeGreaterThan( viewport.width * 0.9 );
    expect( box.y + box.height ).toBeGreaterThan( viewport.height * 0.9 );
  } );
} );
