import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const FIXTURE_DIR = join( import.meta.dirname, '../../fixtures' );

export const fixtureNames = readdirSync( FIXTURE_DIR ).filter( ( f ) => f.endsWith( '.json' ) ).sort();

export function loadFixture( name ) {
  return JSON.parse( readFileSync( join( FIXTURE_DIR, name ), 'utf8' ) );
}
