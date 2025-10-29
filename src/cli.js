import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import crypto from 'crypto';

// Import from core
import pkg from './solavia-core.js';
const { init, sha256Hex: coreSha256Hex, merkleRootHex: coreMerkleRootHex } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- CLI Parser (lightweight, no deps) ----
class CLI {
  constructor() {
    this.args = process.argv.slice(2);
    this.cmd = this.args[0] || 'help';
    this.flags = {};
    this.params = [];
    this.parse();
  }
  parse() {
    for (let i = 1; i < this.args.length; i++) {
      const arg = this.args[i];
      if (arg.startsWith('--')) {
        const [key, val] = arg.slice(2).split('=');
        this.flags[key] = val ?? true;
      } else if (arg.startsWith('-')) {
        this.flags[arg.slice(1)] = true;
      } else {
        this.params.push(arg);
      }
    }
  }
  get(key, def) { return this.flags[key] ?? def; }
  has(key) { return !!this.flags[key]; }
}
const cli = new CLI();

// ---- Logger (CLI mode) ----
const log = {
  info: (...m) => console.log('Info ', ...m),
  success: (...m) => console.log('Success', ...m),
  error: (...m) => { console.error('Error', ...m); process.exit(1); },
  warn: (...m) => console.log('Warning ', ...m),
};

// ---- Commands ----
const COMMANDS = {
  async run() {
    const file = cli.params[0];
    if (!file) log.error('Usage: solavia run <pipeline.js>');

    const absPath = path.resolve(file);
    if (!fs.existsSync(absPath)) log.error(`File not found: ${absPath}`);

    const sv = await init({
      SEED: parseInt(cli.get('seed') || '1337'),
      autoStart: false,
    });

    const userModule = await import(absPath);
    const pipelineFn = userModule.default || userModule;
    if (typeof pipelineFn !== 'function')
      log.error('Pipeline must export a function: (sv) => {...}');

    log.info(`Running pipeline: ${path.basename(file)}`);
    log.info(`Seed: ${sv.config.SEED}`);

    const start = Date.now();
    await pipelineFn(sv);
    const duration = Date.now() - start;

    const root = sv.provenance.merkleRoot();
    log.success(`Pipeline completed in ${duration}ms`);
    log.success(`Merkle Root: ${root}`);

    if (cli.has('prove') || cli.has('sign')) {
      const proof = {
        root,
        stages: sv.provenance.getStages().map(s => ({
          name: s.name,
          inputHash: coreSha256Hex(s.input),
          outputHash: s.outputHash,
          ts: s.ts,
        })),
        seed: sv.config.SEED,
        timestamp: new Date().toISOString(),
        version: '8.0.0',
      };

      // Coerce boolean flags to default filenames
      const proveFlag = cli.get('prove');
      const proofFile = (proveFlag === true ? 'solavia-proof.json' : proveFlag);
      fs.writeFileSync(proofFile, JSON.stringify(proof, null, 2));
      log.success(`Proof exported: ${proofFile}`);
    }

    if (cli.has('sign')) {
      const signFlag = cli.get('sign');
      const keyPath = (signFlag === true ? 'key.pem' : signFlag);
      if (!fs.existsSync(keyPath)) log.error(`Key not found: ${keyPath}`);
      const privateKey = fs.readFileSync(keyPath, 'utf8');
      const signed = await sv.provenance.sign(privateKey);

      const sigFlag = cli.get('signature');
      const sigFile = (sigFlag === true ? 'solavia-signature.json' : sigFlag);
      fs.writeFileSync(sigFile, JSON.stringify(signed, null, 2));
      log.success(`Signed proof: ${sigFile}`);
    }

    process.exit(0);
  },

  async verify() {
    const proofFile = cli.params[0] || 'solavia-proof.json';
    const sigFileFlag = cli.get('signature');
    const sigFile = (sigFileFlag === true ? 'solavia-signature.json' : sigFileFlag);

    if (!fs.existsSync(proofFile)) log.error(`Proof not found: ${proofFile}`);

    const proof = JSON.parse(fs.readFileSync(proofFile, 'utf8'));
    const leaves = proof.stages.map(s => s.outputHash);
    const computedRoot = coreMerkleRootHex(leaves);

    if (computedRoot !== proof.root)
      log.error('Merkle root mismatch. Proof tampered.');

    if (sigFile) {
      if (!fs.existsSync(sigFile)) log.error(`Signature not found: ${sigFile}`);
      const sig = JSON.parse(fs.readFileSync(sigFile, 'utf8'));
      const publicKey = cli.get('pubkey');
      if (!publicKey) log.error('--pubkey required for verification');

      const verify = crypto.createVerify('SHA256');
      verify.update(proof.root);
      const valid = verify.verify(fs.readFileSync(publicKey, 'utf8'), sig.signature, 'hex');
      log[valid ? 'success' : 'error'](`Signature ${valid ? 'valid' : 'invalid'}`);
    } else {
      log.success('Merkle proof valid');
    }

    process.exit(0);
  },

  async snapshot() {
    const sv = await init({ autoStart: false });
    const name = cli.params[0] || `snap-${Date.now()}`;
    const snap = await sv.snapshot.save(name);
    log.success(`Snapshot saved: ${snap.cid || snap.id} (${name})`);
    process.exit(0);
  },

  async rollback() {
    const sv = await init({ autoStart: false });
    const cid = cli.params[0];
    if (!cid) log.error('Usage: solavia rollback <cid>');
    const obj = await sv.storage.loadObject(cid);
    if (!obj || obj.type !== 'snapshot') log.error('Not a snapshot');
    sv.snapshot.load(obj.payload);
    log.success(`Rolled back to snapshot: ${cid}`);
    process.exit(0);
  },

  help() {
    console.log(`
SOLAVIA v8 CLI — Deterministic AI Runtime

Usage:
  solavia <command> [options]

Commands:
  run <file.js>     Run a pipeline script
  verify [proof]    Verify Merkle proof + signature
  snapshot [name]   Create named snapshot
  rollback <cid>    Restore from snapshot
  help              Show this help

Run Options:
  --seed=1337       Set deterministic seed
  --prove=file.json Export Merkle proof
  --sign=key.pem    Sign proof with private key
  --signature=file  Output signature file
  --pubkey=file     Public key for verification
  --storage=ipfs    Use Helia/IPFS (default: local)

Examples:
  solavia run agents/vote.js --seed 42 --prove
  solavia verify proof.json --signature sig.json --pubkey pub.pem
  solavia snapshot "after-v1"
  solavia rollback bafy...xyz
`);
    process.exit(0);
  }
};

// ---- Main ----
(async () => {
  try {
    const cmd = COMMANDS[cli.cmd];
    if (!cmd) log.error(`Unknown command: ${cli.cmd}`);
    await cmd();
  } catch (err) {
    log.error('CLI Error:', err.message || err);
  }
})();
