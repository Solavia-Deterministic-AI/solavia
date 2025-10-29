import SolaviaCore from "../src/solavia-core.js";
const { sha256Hex } = SolaviaCore;

export default async function pipeline(sv) {
  // Stage 1: fetch joke
  const joke = await (async () => {
    const r = await fetch("https://api.chucknorris.io/jokes/random");
    const j = await r.json();
    return j.value;
  })();

  sv.provenance.addStage("fetch-joke", {}, joke, sha256Hex(joke));

  // Stage 2: embed
  const vector = await (sv.ai?.embed(joke) || joke.split("").map(c => c.charCodeAt(0) / 256));
  sv.provenance.addStage("embed", joke, vector, sha256Hex(vector));

  // Stage 3: rank
  const rank = vector.reduce((acc, n) => acc + n, 0);
  sv.provenance.addStage("rank", vector, rank, sha256Hex(rank));

  console.log("Pipeline finished. Merkle root:", sv.provenance.merkleRoot());
}
