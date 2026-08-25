/**
 * Does a solution document carry every field the renderer actually reads?
 *
 * The field list is not written here. It is extracted from
 * `apps/visualiser/visualiser.js` at run time, so when Persephone reads a new
 * field the check picks it up without anyone remembering to update a list, and
 * when the solver stops emitting one the build fails instead of the legend
 * quietly rendering "undefined".
 *
 * The renderer itself cannot be imported: it touches `document` and `window` at
 * module scope and builds a WebGL context. This reads its source instead.
 *
 * Usage: node renderer_contract.mjs <solution.json>
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname( fileURLToPath( import.meta.url ) );
const rendererPath = join( here, '..', '..', 'apps', 'visualiser', 'visualiser.js' );
const source = readFileSync( rendererPath, 'utf8' );

/** Every `<object>.<field>` the renderer reads, for one variable name. */
function fieldsRead( variable ) {
  const found = new Set();
  const pattern = new RegExp( `\\b${ variable }\\.([a-z_][a-z0-9_]*)`, 'gi' );
  let match;
  while ( ( match = pattern.exec( source ) ) !== null ) {
    found.add( match[ 1 ] );
  }
  return found;
}

// Names the renderer uses for itself, not fields of the solution document.
const NOT_DOCUMENT_FIELDS = new Set( [
  'map', 'filter', 'forEach', 'length', 'join', 'push', 'toFixed', 'reduce', 'sort',
  'add', 'position', 'geometry', 'material', 'userData', 'visible', 'rotation',
  'renderOrder', 'dataset', 'innerHTML', 'className', 'textContent', 'style',
  'getHSL', 'setHSL', 'getHexString', 'copy', 'set', 'isEmpty', 'getSize',
  'getCenter', 'min', 'max', 'dispose', 'x', 'y', 'z', 'checked', 'classList',
  'target', 'addEventListener', 'appendChild', 'domElement', 'update', 'render',
  'aspect', 'updateProjectionMatrix', 'setSize', 'setAnimationLoop', 'touches',
  'enableRotate', 'background', 'json', 'ok', 'status', 'then', 'catch',
] );

function documentFields( variable ) {
  return [ ...fieldsRead( variable ) ].filter( ( f ) => !NOT_DOCUMENT_FIELDS.has( f ) );
}

const documentPath = process.argv[ 2 ];
assert.ok( documentPath, 'usage: node renderer_contract.mjs <solution.json>' );
const doc = JSON.parse( readFileSync( documentPath, 'utf8' ) );

const cartonFields = documentFields( 'carton' );
const placementFields = documentFields( 'placement' );
const rejectFields = documentFields( 'reject' );

assert.ok( cartonFields.length > 0, 'extracted no carton fields; the regex has gone stale' );
assert.ok( placementFields.length > 0, 'extracted no placement fields; the regex has gone stale' );

console.log( 'renderer reads carton   :', cartonFields.sort().join( ', ' ) );
console.log( 'renderer reads placement:', placementFields.sort().join( ', ' ) );
console.log( 'renderer reads reject   :', rejectFields.sort().join( ', ' ) );

assert.ok( Array.isArray( doc.cartons ), 'document has no cartons array' );
assert.ok( Array.isArray( doc.rejects ), 'document has no rejects array' );

for ( const carton of doc.cartons ) {
  for ( const field of cartonFields ) {
    assert.ok( field in carton, `carton ${ carton.carton_id } is missing "${ field }"` );
  }
  for ( const placement of carton.placements ) {
    for ( const field of placementFields ) {
      assert.ok(
        field in placement,
        `placement ${ placement.placement_id } is missing "${ field }"`,
      );
    }
    // The renderer indexes all three of each, and multiplies by MM_TO_CM.
    assert.equal( placement.position.length, 3 );
    assert.equal( placement.dims.length, 3 );
    assert.ok( placement.position.every( Number.isFinite ) );
    assert.ok( placement.dims.every( Number.isFinite ) );
    // placement.tags.length is read without a guard.
    assert.ok( Array.isArray( placement.tags ), 'tags must be an array' );
    // placement.mass is divided by 1000 for the legend.
    assert.equal( typeof placement.mass, 'number' );
  }
  assert.equal( carton.inner_dims.length, 3 );
}

for ( const reject of doc.rejects ) {
  for ( const field of rejectFields ) {
    assert.ok( field in reject, `reject ${ reject.item_ref } is missing "${ field }"` );
  }
}

console.log( `\nOK: ${ doc.cartons.length } carton(s), ${ doc.rejects.length } reject(s) satisfy the renderer` );
