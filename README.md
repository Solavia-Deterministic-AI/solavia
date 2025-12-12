



ETH  0xb48d096c1e7796ad60ed6dfa2ab37d39ee4d336d  
BTC  bc1qju9v4xag2ppmgvpr99xxg4rsndmuce59wvaa8a  



Thank you for helping me finish the job.

— J.C.

---

# ✅ Solavia v8 — Deterministic AI Runtime

### *Merkle Provenance · Snapshots · Cryptographic Signatures*

Solavia is a deterministic execution runtime for building verifiable AI or data transformation pipelines.

Every pipeline run produces:

* **Stage-level provenance**
* **SHA-256 hashing of input/output**
* **A Merkle tree of all outputs**
* **Optional cryptographic signature**

> Think: *AI execution that can be proven and verified like a blockchain transaction.*

---

## ✨ Features

| Feature                   | Description                            |
| ------------------------- | -------------------------------------- |
| ✅ Deterministic execution | Everything seeded and reproducible     |
| ✅ Stage provenance        | Every step logs its input/output hash  |
| ✅ Merkle tree             | Computes Merkle Root of pipeline       |
| ✅ Proof export            | JSON proof users can inspect or audit  |
| ✅ Digital signatures      | Sign proof using RSA/ECDSA private key |
| ✅ Verification            | Users can verify proof + signature     |
| ✅ Snapshots / rollback    | Save and restore execution state       |
| ✅ Zero dependencies CLI   | No external frameworks                 |

---

## 📦 Installation

> Requires **Node v18+**

```sh
npm install -g solavia
```

Or locally:

```sh
npm install solavia
```

---

## 🚀 Usage

### 1. Create a pipeline script

`pipeline.js`

```js
// examples/pipeline.example.js
import svCore from "../src/solavia-core.js"; // adjust path if needed
const { sha256Hex } = svCore;

export default async function pipeline(sv) {
  console.log("🚀 Starting Solavia example pipeline...");

  // Stage 1: generate deterministic data
  const input = { numbers: [1, 2, 3], seed: sv.config.SEED };
  const output = input.numbers.map(n => n * 2);
  sv.provenance.addStage("DoubleNumbers", input, output, sha256Hex(output));
  console.log("⚠\ninput:", input, "\noutput:", output);

  // Stage 2: compute summary
  const summary = {
    count: output.length,
    sum: output.reduce((a, b) => a + b, 0),
  };
  sv.provenance.addStage("Summarize", output, summary, sha256Hex(summary));
  console.log("⚠\ninput:", output, "\noutput:", summary);

  // Stage 3: pseudo model output
  const result = {
    avg: summary.sum / summary.count,
    seedUsed: sv.config.SEED,
  };
  sv.provenance.addStage("ModelResult", summary, result, sha256Hex(result));
  console.log("⚠\ninput:", summary, "\noutput:", result);

  console.log("✅ Pipeline finished.");
  console.log("🔗 Merkle Root:", sv.provenance.merkleRoot());
}

```

---

### 2. Run it

```sh
solavia run examples/pipeline.js
```

Example output:

```
jameschapman@solavia solavia-npm % solavia run examples/pipeline.js                                                                                                                         
                                                                                                                                                                                            
[SolaVia:INFO] SolaVia started
Info  Running pipeline: pipeline.js
Info  Seed: 1337
🚀 Starting Solavia example pipeline...
⚠
input: { numbers: [ 1, 2, 3 ], seed: 1337 } 
output: [ 2, 4, 6 ]
⚠
input: [ 2, 4, 6 ] 
output: { count: 3, sum: 12 }
⚠
input: { count: 3, sum: 12 } 
output: { avg: 4, seedUsed: 1337 }
✅ Pipeline finished.
🔗 Merkle Root: 10fee41b9017216dc26c288203884d3d9a359ebe5020c0f8722b7089ab11b503
Success Pipeline completed in 4ms
Success Merkle Root: 10fee41b9017216dc26c288203884d3d9a359ebe5020c0f8722b7089ab11b503
```

---

## 🧾 Generate a Merkle Proof

```sh
solavia run examples/pipeline.js --prove
```

Creates:

```
solavia-proof.json
```

Example:

```json
{
  "root": "10fee41b9017216dc26c288203884d3d9a359ebe5020c0f8722b7089ab11b503",
  "stages": [
    {
      "name": "DoubleNumbers",
      "inputHash": "f564638d2bdd6f84fbc34bb3f306ad214408e162ded3e36ad0a54116aa68a2ef",
      "outputHash": "5949a6c45fd2fb2baa3e4576d5255e8752a72cf66402c0e141600be6d402675e",
      "ts": 89464780832077
    },
    {
      "name": "Summarize",
      "inputHash": "5949a6c45fd2fb2baa3e4576d5255e8752a72cf66402c0e141600be6d402675e",
      "outputHash": "3e40387a2031a4bd2537450614c2e883d50fe117dbdd106e580d7a7deb640d8d",
      "ts": 89464780832077
    },
    {
      "name": "ModelResult",
      "inputHash": "3e40387a2031a4bd2537450614c2e883d50fe117dbdd106e580d7a7deb640d8d",
      "outputHash": "03e26f5c84a262a84702fea89456b4dc66a2e62ed9bc9b7835570bd39ab8861a",
      "ts": 89464780832077
    }
  ],
  "seed": 1337,
  "timestamp": "2025-10-29T19:04:33.591Z",
  "version": "8.0.0"
}
```

---

## 🔐 Signing Proofs (Private Key)

### Generate RSA keypair:

```sh
openssl genpkey -algorithm RSA -out key.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -pubout -in key.pem -out pub.pem
```

### Run pipeline, export proof, sign it:

```sh
jameschapman@solavia solavia-npm % solavia run examples/pipeline.js --prove --sign=key.pem --signature=signature.json                                                                       
```

Created files:

```
solavia-proof.json
signature.json
```

Signature JSON:

```json
{
  "merkleRoot": "10fee41b9017216dc26c288203884d3d9a359ebe5020c0f8722b7089ab11b503",
  "signature": "82ebb99a0ea7214964ef2a019a25e2ac992e539b335cf48fa4a08c7759c521abfab4303f5ec9abedaea9befc2b940d0d074ef624c42b25a9f7aa8bc8b56a31013ba9f87c37fa8087ddea2fb25cfe68b576355043d24d675120a468aca8309a3394993740c2b46198ae9cab0b5bfd147597f5ba9d88ea741bd6003f6bd431ac515ef4e1516698558d6d5a68d4372eebc76bd0eae9aee051bb00fc709da1a8c6dbde9946aca8932f3623e9bb307f2c2965bbf40842038d675dfb43d11f0fb555f124f8986780e07c70f29aeb840f8a5e5a4a1a23dcf7073027c07bb9d9d591f915686cdfe078e0c4b062430b80e829256f998f4090259fda2ab8dcfb973ad30340",
  "canonical": "[{\"input\":{\"numbers\":[1,2,3],\"seed\":1337},\"name\":\"DoubleNumbers\",\"output\":[2,4,6],\"outputHash\":\"5949a6c45fd2fb2baa3e4576d5255e8752a72cf66402c0e141600be6d402675e\",\"ts\":89464780832077},{\"input\":[2,4,6],\"name\":\"Summarize\",\"output\":{\"count\":3,\"sum\":12},\"outputHash\":\"3e40387a2031a4bd2537450614c2e883d50fe117dbdd106e580d7a7deb640d8d\",\"ts\":89464780832077},{\"input\":{\"count\":3,\"sum\":12},\"name\":\"ModelResult\",\"output\":{\"avg\":4,\"seedUsed\":1337},\"outputHash\":\"03e26f5c84a262a84702fea89456b4dc66a2e62ed9bc9b7835570bd39ab8861a\",\"ts\":89464780832077}]"
}
```

---

## ✅ Verify Proof + Signature

```sh
jameschapman@solavia solavia-npm % solavia verify solavia-proof.json  signature.json --pubkey pub.pem                                                                                       
```

Output:

```
Success Merkle proof valid
```

---

## 💾 Snapshots / Rollback

Save current runtime state:

```sh
solavia snapshot "checkpoint-a"
```

Rollback to a previous snapshot via CID:

```sh
solavia rollback bafy...xyz
```

---

## 🧠 Advanced Example (AI + API request)

Example: pipeline with API fetch + embedding hashing.

`agent-pipeline.js`:

```js
export default async function (sv) {
  sv.stage("fetch-joke", async () => {
    const r = await fetch("https://api.chucknorris.io/jokes/random");
    const joke = await r.json();
    return joke.value;
  });

  sv.stage("embed", async (joke) => {
    const vector = await sv.ai.embed(joke); // uses Solavia's deterministic embedding
    return vector;
  });

  sv.stage("rank", async (vector) => {
    return vector.reduce((acc, n) => acc + n, 0);
  });
}
```

Run:

```sh
solavia run src/agent-pipeline.js --seed=1337 --prove --sign=key.pem --signature=signature.json
```

```sh
solavia run src/agent-pipeline.js --seed=1337 --prove --sign=key.pem --signature=signature.json  
```
Output:

```sh                                                                                                                                                                                    [SolaVia:INFO] SolaVia started
Info  Running pipeline: agent-pipeline.js
Info  Seed: 1337
Pipeline finished. Merkle root: 9dd1dbd8f194496192137cb15fed74511f49346175f3f31c0704eb37d1482b20
Success Pipeline completed in 455ms
Success Merkle Root: 9dd1dbd8f194496192137cb15fed74511f49346175f3f31c0704eb37d1482b20
Success Proof exported: solavia-proof.json
Success Signed proof: signature.json

```

---

## 🧩 CLI Reference

```
solavia <command> [options]

Commands:
  run <file.js>       Run a pipeline script
  verify [proof]      Verify Merkle proof + signature
  snapshot [name]     Create a named snapshot
  rollback <cid>      Restore a snapshot
  help                Show help

Options:
  --seed=1337         Deterministic seed
  --prove=file.json   Export Merkle proof
  --sign=key.pem      Sign proof with private key
  --signature=file    Output file for signature JSON
  --pubkey=file       Public key for verification
```

---

## 🧠 Why Merkle Proofs?

Because they create **tamper evidence**.

Even if someone modifies *one stage output*, the Merkle root changes — and verification fails.

---

## 🏁 License

Solavia Runtime — Open Source (Non‑Commercial)
✅ Free for personal, academic, research
❌ Commercial use requires paid license
© 2025 James Chapman llc.
EMAIL='iconoclastdao@gmail.com'

