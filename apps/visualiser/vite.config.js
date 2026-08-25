import { defineConfig } from 'vite';

// Serve the fixtures from contract/ rather than keeping a copy here.
//
// Two copies of the fixtures is two sources of truth, and the solver repository
// had already written down why that is a problem: "a second copy of the fixtures
// is a second source of truth, and it silently goes stale". At the merge the two
// copies were still semantically identical and differed only in formatting, which
// is the moment to collapse them rather than after they disagree.
//
// publicDir contents are served from the site root, so contract/fixtures/x.json
// stays reachable at /fixtures/x.json and index.html did not change.
export default defineConfig( {
  publicDir: '../../contract',
} );
