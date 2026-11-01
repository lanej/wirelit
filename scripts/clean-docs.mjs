import { rm } from 'node:fs/promises';
// The build owns this directory. Do not leave old routes in the search index.
await rm(new URL('../examples/site/dist/', import.meta.url), { recursive: true, force: true });
await rm(new URL('../examples/site/.astro/', import.meta.url), { recursive: true, force: true });
