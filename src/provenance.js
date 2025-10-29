// src/provenance.js
// Provenance tracker for Solavia – manages stages, hashes, and Merkle lineage.

import crypto from 'crypto';
import { sha256Hex, merkleRootHex } from '../solavia-core.js';

export class Provenance {
  constructor() {
    this.stages = [];
  }

  /**
   * Add a new stage with input/output data and name.
   */
  addStage(name, input, output) {
    const inputHash = sha256Hex(JSON.stringify(input));
    const outputHash = sha256Hex(JSON.stringify(output));

    const stage = {
      name,
      inputHash,
      outputHash,
      ts: Date.now(),
    };
    this.stages.push(stage);
    return stage;
  }

  /**
   * Return a snapshot of all recorded stages.
   */
  getStages() {
    return this.stages;
  }

  /**
   * Compute current Merkle root of all output hashes.
   */
  merkleRoot() {
    const leaves = this.stages.map(s => s.outputHash);
    return merkleRootHex(leaves);
  }

  /**
   * Sign the current Merkle root with a private key (PEM).
   */
  async sign(privateKeyPem) {
    const root = this.merkleRoot();
    const signer = crypto.createSign('SHA256');
    signer.update(root);
    const signature = signer.sign(privateKeyPem, 'hex');
    return { root, signature, stages: this.stages };
  }

  /**
   * Verify a signature using a public key (PEM).
   */
  async verifySignature(publicKeyPem, signatureHex) {
    const root = this.merkleRoot();
    const verifier = crypto.createVerify('SHA256');
    verifier.update(root);
    return verifier.verify(publicKeyPem, signatureHex, 'hex');
  }

  /**
   * Reset provenance history.
   */
  reset() {
    this.stages = [];
  }
}
