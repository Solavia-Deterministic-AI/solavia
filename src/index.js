// src/index.js
// Main Solavia entrypoint – re-exports key modules

import * as core from '../solavia-core.js';
import * as cli from './cli.js';
import * as provenance from './provenance.js';

/**
 * Initialize Solavia runtime.
 * This calls `core.init()` under the hood.
 */
export async function init(config = {}) {
  return await core.init(config);
}

/**
 * Access to Merkle + hash utilities directly.
 */
export const sha256Hex = core.sha256Hex;
export const merkleRootHex = core.merkleRootHex;

/**
 * Provenance module: manages stage tracking and Merkle lineage.
 */
export const Provenance = provenance.Provenance;

/**
 * CLI helper export (optional for programmatic access)
 */
export const CLI = cli.CLI;

// Default export combines everything for convenience
export default {
  init,
  sha256Hex,
  merkleRootHex,
  Provenance,
  CLI,
};
