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
