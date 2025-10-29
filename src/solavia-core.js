

import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Lazy Helia imports
let createHelia = null;
let unixfs = null;

// ---- Environment Detection ----
const __filename = typeof fileURLToPath === "function" ? fileURLToPath(import.meta.url) : "unknown";
const __dirname = path.dirname(__filename || ".");

function isBrowser() {
  return typeof window !== "undefined" && typeof window.document !== "undefined";
}

function isNode() {
  return !isBrowser() && typeof process !== "undefined" && process.versions?.node;
}

// ---- Safe Logger with Levels ----
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
class Logger {
  constructor(level = "info") {
    this.level = LOG_LEVELS[level] ?? LOG_LEVELS.info;
  }
  log(level, ...args) {
    if (LOG_LEVELS[level] <= this.level) {
      try { console[level](`[SolaVia:${level.toUpperCase()}]`, ...args); } catch (_) {}
    }
  }
  error(...args) { this.log("error", ...args); }
  warn(...args) { this.log("warn", ...args); }
  info(...args) { this.log("info", ...args); }
  debug(...args) { this.log("debug", ...args); }
}

// ---- Canonical JSON (RFC8785-like, cached) ----
const jsonCache = new WeakMap();
function canonicalJSON(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (jsonCache.has(value)) return jsonCache.get(value);

  let result;
  if (Array.isArray(value)) {
    result = "[" + value.map(canonicalJSON).join(",") + "]";
  } else {
    const keys = Object.keys(value).sort();
    result = "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalJSON(value[k])).join(",") + "}";
  }
  jsonCache.set(value, result);
  return result;
}

// ---- Global Deterministic Seed ----
const GLOBAL_SEED = crypto.createHash("sha256")
  .update((os.hostname?.() ?? "unknown-host") + (os.platform?.() ?? "browser") + (os.arch?.() ?? "wasm"))
  .digest("hex");

// ---- Seeded RNG (SHA-256 chaining) ----
class SeededRNG {
  constructor(seed) {
    this.state = crypto.createHash("sha256").update(String(seed)).digest();
  }
  nextBytes(n) {
    const out = Buffer.alloc(n);
    for (let i = 0; i < n; i++) {
      this.state = crypto.createHash("sha256").update(this.state).digest();
      out[i] = this.state[0];
    }
    return out;
  }
  nextInt(max) {
    if (max <= 0) return 0;
    const v = this.nextBytes(4).readUInt32BE(0);
    return v % max;
  }
  uuid() {
    const b = this.nextBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = b.toString("hex");
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
}
const GLOBAL_RNG = new SeededRNG(GLOBAL_SEED);

// ---- Deterministic Timestamp (seconds) ----
function deterministicTimestamp(seed = GLOBAL_SEED, offset = 0) {
  const base = parseInt(crypto.createHash("sha256").update(String(seed)).digest("hex").slice(0, 12), 16);
  return base + Math.floor(offset);
}

// ---- Hashing & Merkle ----
function sha256Hex(data) {
  const input = typeof data === "object" ? canonicalJSON(data) : String(data);
  return crypto.createHash("sha256").update(input).digest("hex");
}

function merkleRootHex(hexLeaves) {
  if (!Array.isArray(hexLeaves) || hexLeaves.length === 0) return null;
  let nodes = hexLeaves.map(h => Buffer.from(h, "hex"));
  while (nodes.length > 1) {
    const next = [];
    for (let i = 0; i < nodes.length; i += 2) {
      const left = nodes[i];
      const right = nodes[i + 1] || left;
      next.push(crypto.createHash("sha256").update(Buffer.concat([left, right])).digest());
    }
    nodes = next;
  }
  return nodes[0].toString("hex");
}

// ---- xoshiro-style PRNG ----
class PRNG {
  constructor(seed = GLOBAL_RNG.nextInt(0xffffffff)) {
    this.state = new Uint32Array(4);
    let s = seed >>> 0;
    for (let i = 0; i < 4; i++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      this.state[i] = s >>> 0;
    }
  }
  rotl(x, k) { return ((x << k) | (x >>> (32 - k))) >>> 0; }
  next() {
    const s = this.state;
    const r = (this.rotl(s[1] * 5, 7) * 9) >>> 0;
    const t = s[1] << 9;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t; s[3] = this.rotl(s[3], 11);
    return r >>> 0;
  }
  nextFloat() { return this.next() / 0xffffffff; }
  nextInt(max) { return Math.floor(this.nextFloat() * max); }
}

// ---- Filesystem Helpers (Node-only) ----
async function ensureDirAsync(p) {
  if (!isNode()) return;
  await fs.promises.mkdir(p, { recursive: true }).catch(() => {});
}
function ensureDirSync(p) {
  if (!isNode()) return;
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// ---- Persistent Deterministic ID Factory ----
class DeterministicIdFactory {
  constructor(storage, prefix = "sv") {
    this.prefix = prefix;
    this.storage = storage;
    this.counter = this.loadCounter();
  }
  loadCounter() {
    try {
      const raw = this.storage.getItem?.(`${this.prefix}:counter`) || this.storage[`${this.prefix}:counter`];
      return raw ? parseInt(raw, 36) : 0;
    } catch { return 0; }
  }
  saveCounter() {
    const key = `${this.prefix}:counter`;
    try {
      if (this.storage.setItem) this.storage.setItem(key, (this.counter).toString(36));
      else this.storage[key] = (this.counter).toString(36);
    } catch {}
  }
  generate(suffix = "") {
    const id = `${this.prefix}-${GLOBAL_RNG.uuid()}-${(this.counter++).toString(36)}${suffix}`;
    this.saveCounter();
    return id;
  }
}

// ---- Storage Adapter (Helia ↔ localStorage ↔ in-memory) ----
class StorageAdapter {
  constructor({ helia = null, localPrefix = "solavia:" } = {}) {
    this.helia = helia;
    this.localPrefix = localPrefix;
    this._localStore = {};
    this._nodeLocal = typeof localStorage !== "undefined" ? localStorage : null;
  }

  async hasHelia() { return !!this.helia; }

  async saveObject(obj) {
    const json = canonicalJSON(obj);
    if (this.helia) {
      try {
        if (!createHelia) {
          const heliaPkg = await import("helia");
          createHelia = heliaPkg.createHelia || heliaPkg.default?.createHelia;
          unixfs = (await import("@helia/unixfs")).unixfs;
        }
        const result = await this.helia.add(new TextEncoder().encode(json));
        return (result?.cid || result)?.toString();
      } catch (e) {
        // fall through
      }
    }

    const key = this.localPrefix + crypto.createHash("sha256").update(json).digest("hex").slice(0, 12);
    try {
      if (this._nodeLocal) this._nodeLocal.setItem(key, json);
      else this._localStore[key] = json;
      return key;
    } catch {
      this._localStore[key] = json;
      return key;
    }
  }

  async loadObject(cidOrKey) {
    if (!cidOrKey) return null;
    if (this.helia && cidOrKey.length >= 46) {
      try {
        const iterable = this.helia.cat(cidOrKey);
        const decoder = new TextDecoder();
        let out = "";
        for await (const chunk of iterable) out += decoder.decode(chunk, { stream: true });
        return JSON.parse(out);
      } catch {}
    }
    if (this._nodeLocal?.getItem(cidOrKey)) {
      return JSON.parse(this._nodeLocal.getItem(cidOrKey));
    }
    return this._localStore[cidOrKey] ? JSON.parse(this._localStore[cidOrKey]) : null;
  }

  async saveList(key, list) {
    return this.saveObject({ type: key, payload: list, ts: deterministicTimestamp() });
  }
  async loadList(key) {
    const knownKey = this.localPrefix + key;
    if (this._nodeLocal?.getItem(knownKey)) {
      return JSON.parse(this._nodeLocal.getItem(knownKey)).payload || [];
    }
    return [];
  }
}

// ---- Agent Core ----
class Agent {
  constructor({ name = "Agent", specialty = "general", seed } = {}) {
    this.name = name;
    this.specialty = specialty;
    this.rng = new PRNG(seed ?? GLOBAL_RNG.nextInt(0xffffffff));
    this.id = null; // set by manager
    this.status = "idle";
  }

  /** @param {string} prompt @param {string} context @param {number} pass @param {object} opts */
  async ask(prompt, context = "", pass = 1, opts = {}) {
    const allowExternal = opts.allowExternal ?? true;
    const model = opts.model || process.env.OLLAMA_MODEL || "llama3.1:70b";
    const seedAdj = (opts.seed || 1337) + pass + this.rng.nextInt(1000);

    if (allowExternal && isNode()) {
      try {
        const child = spawn("ollama", ["run", model], { stdio: ["pipe", "pipe", "inherit"] });
        let out = "";
        child.stdout.on("data", d => { out += d.toString(); });
        const input = `${prompt}\nContext:${context}\nSeed:${seedAdj}\n`;
        child.stdin.write(input);
        child.stdin.end();
        const code = await new Promise(res => child.on("close", res));
        if (code === 0) return out.trim();
      } catch {}
    }

    const choice = this.rng.nextInt(1000);
    return `[[deterministic:${this.name}:${choice}]] ${prompt.slice(0, 120)}`;
  }
}

// ---- Agent Manager (persistence, IDs) ----
class AgentManager {
  constructor(storage, idFactory) {
    this.storage = storage;
    this.idFactory = idFactory;
    this.agents = [];
  }
  create({ name, specialty, seed }) {
    const agent = new Agent({ name, specialty, seed });
    agent.id = this.idFactory.generate(`-${name.toLowerCase().replace(/\s+/g, "-")}`);
    this.agents.push(agent);
    return agent;
  }
  list() { return [...this.agents]; }
  findByName(name) { return this.agents.find(a => a.name === name); }
  async save() { await this.storage.saveList("agents", this.agents); }
  async load() {
    const list = await this.storage.loadList("agents");
    this.agents = list.map(a => Object.assign(new Agent(), a));
    return this.agents;
  }
}

// ---- Auto-Saver ----
class AutoSaver {
  constructor(storage, intervalMs = 30000, logger) {
    this.storage = storage;
    this.intervalMs = intervalMs;
    this.logger = logger;
    this.handle = null;
  }
  start(saveFn) {
    if (this.handle) return;
    this.handle = setInterval(async () => {
      try { await saveFn(); this.logger.debug("Auto-save completed"); }
      catch (e) { this.logger.error("Auto-save failed:", e); }
    }, this.intervalMs);
  }
  stop() {
    if (this.handle) clearInterval(this.handle);
    this.handle = null;
  }
}

// ---- Provenance Tracker (Merkle + Signing) ----
class ProvenanceTracker {
  constructor() {
    this.stages = [];
  }

  record(name, input, output, outputHash) {
    this.stages.push({
      name,
      input,
      output,
      outputHash,
      ts: deterministicTimestamp()
    });
  }

  getStages() {
    return [...this.stages];
  }

  merkleRoot() {
    const hashes = this.stages.map(s => s.outputHash);
    return merkleRootHex(hashes);
  }

  async sign(signerKey) {
    if (!isNode() || !signerKey)
      return { error: "Signing not available" };

    const root = this.merkleRoot();
    const signer = crypto.createSign("SHA256");
    signer.update(root);
    const sig = signer.sign(signerKey, "hex");

    return {
      merkleRoot: root,
      signature: sig,
      canonical: canonicalJSON(this.stages)
    };
  }
}

ProvenanceTracker.prototype.addStage = function (name, input, output, outputHash) {
  if (outputHash === undefined) {
    console.warn("⚠️ [ProvenanceTracker] Missing outputHash for stage:", name);
    console.warn("input:", input);
    console.warn("output:", output);
  }
  return this.record(name, input, output, outputHash);
};



// ---- Memory Store ----
class MemoryStore {
  constructor() { this.store = {}; }
  set(k, v) { this.store[k] = v; }
  get(k) { return this.store[k]; }
  keys() { return Object.keys(this.store); }
  clear() { this.store = {}; }
}

// ---- Snapshot Manager ----
class SnapshotManager {
  constructor(memory, storage) {
    this.memory = memory;
    this.storage = storage;
  }
  create(name = "snap") {
    const data = canonicalJSON(this.memory.store);
    return { id: crypto.createHash("sha256").update(data).digest("hex").slice(0, 12), name, data, ts: deterministicTimestamp() };
  }
  async save(name) {
    const snap = this.create(name);
    snap.cid = await this.storage.saveObject({ type: "snapshot", payload: snap });
    return snap;
  }
  load(snap) {
    if (!snap?.data) throw new Error("Invalid snapshot");
    this.memory.store = JSON.parse(snap.data);
  }
}

// ---- UI Helper (Browser) ----
class SVUI {
  constructor({ logElement } = {}) {
    this.logEl = logElement || (isBrowser() ? document.getElementById("sv-log") : null);
  }
  log(level, msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    if (this.logEl) {
      const p = document.createElement("div");
      p.textContent = line;
      p.className = `log-${level}`;
      this.logEl.appendChild(p);
    }
  }
  displayAgents(agents) {
    if (!isBrowser()) return;
    const tbody = document.querySelector("#pipeline-agentTable tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    for (const a of agents) {
      const row = document.createElement("tr");
      row.innerHTML = `<td>${a.name}</td><td>${a.status}</td>`;
      tbody.appendChild(row);
    }
  }
}

// ---- Algorithm Registry ----
class Algorithm {
  constructor(name, fn) {
    this.name = name;
    this.fn = fn;
  }
  async execute(input) { return this.fn(input); }
}

// ---- Pipeline ----
class Pipeline {
  constructor() { this.steps = []; }
  register(name, fn) {
    const id = crypto.createHash("sha256").update(name).digest("hex").slice(0, 8);
    this.steps.push({ id, name, fn });
    return id;
  }
  async execute(input) {
    let result = input;
    for (const step of this.steps) {
      result = await step.fn(result);
    }
    return result;
  }
}

// ---- SolaVia Core (refactored) ----
class SolaVia {
  constructor(config = {}) {
    this.config = {
      MODEL: process.env.OLLAMA_MODEL || "llama3.1:70b",
      SEED: parseInt(process.env.SEED || "1337", 10),
      PASSES: parseInt(process.env.PASSES || "2", 10),
      OUTPUT_DIR: path.resolve(process.cwd(), "artifacts"),
      LOG_LEVEL: process.env.LOG_LEVEL || "info",
      AUTO_SAVE_INTERVAL_MS: 30000,
      ...config
    };

    ensureDirSync(this.config.OUTPUT_DIR);

    this.logger = new Logger(this.config.LOG_LEVEL);
    this.rng = new PRNG(this.config.SEED);
    this.memory = new MemoryStore();
    this.storage = new StorageAdapter();
    this.idFactory = new DeterministicIdFactory(this.storage._nodeLocal || this.storage._localStore);
    this.agents = new AgentManager(this.storage, this.idFactory);
    this.pipeline = new Pipeline();
    this.provenance = new ProvenanceTracker();
    this.snapshot = new SnapshotManager(this.memory, this.storage);
    this.ui = new SVUI();
    this.autoSaver = new AutoSaver(this.storage, this.config.AUTO_SAVE_INTERVAL_MS, this.logger);
    this.algorithms = [];
  }

  async initHelia() {
    if (!isNode()) return false;
    try {
      if (!createHelia) {
        const heliaPkg = await import("helia");
        createHelia = heliaPkg.createHelia || heliaPkg.default?.createHelia;
        unixfs = (await import("@helia/unixfs")).unixfs;
      }
      const node = await createHelia();
      const fsys = unixfs(node);
      this.storage = new StorageAdapter({
        helia: {
          add: async (bytes) => {
            const { cid } = await fsys.addFile({ path: "/artifact", content: bytes });
            return cid;
          },
          cat: async function*(cid) { for await (const c of node.cat(cid)) yield c; }
        }
      });
      this.idFactory = new DeterministicIdFactory(this.storage._nodeLocal || this.storage._localStore);
      this.logger.info("Helia initialized");
      return true;
    } catch (e) {
      this.logger.warn("Helia failed:", e.message);
      return false;
    }
  }

  registerAlgorithm(name, fn) {
    const algo = new Algorithm(name, fn);
    this.algorithms.push(algo);
    return algo;
  }

  async runAll(input = {}) {
    const results = [];
    for (const algo of this.algorithms) {
      try {
        const out = await algo.execute(input);
        results.push({ name: algo.name, output: out });
        this.logger.info(`Algo ${algo.name} done`);
      } catch (e) {
        results.push({ name: algo.name, error: e.message });
        this.logger.error(`Algo ${algo.name} failed:`, e);
      }
    }
    return results;
  }

  async start({ useHelia = false, autoStart = true } = {}) {
    if (useHelia) await this.initHelia();
    await this.agents.load();
    this.ui.displayAgents(this.agents.list());
    this.autoSaver.start(async () => {
      await this.agents.save();
      await this.storage.saveList("algorithms", this.algorithms.map(a => ({ name: a.name })));
    });
    this.logger.info("SolaVia started");
    return this;
  }

  stop() {
    this.autoSaver.stop();
    this.logger.info("SolaVia stopped");
  }
}
// At end of solavia-core.js
export default {
  GLOBAL_SEED,
  GLOBAL_RNG,
  canonicalJSON,
  sha256Hex,
  merkleRootHex,
  PRNG,
  SeededRNG,
  deterministicTimestamp,
  SolaVia,
  Agent,
  Pipeline,
  MemoryStore,
  SnapshotManager,
  StorageAdapter,
  SVUI,
  Algorithm,
  Logger,
  init: async (opts = {}) => {
    const sv = new SolaVia(opts);
    await sv.start(opts);
    return sv;
  }
};