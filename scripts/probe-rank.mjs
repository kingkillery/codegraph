// Dump findRelevantContext's rarity weights and final ranked candidates for a query.
// Usage: node scripts/probe-rank.mjs <projectRoot> "<query>"
import { CodeGraph } from '../dist/index.js';
import { setLogger } from '../dist/errors.js';

const [root, query] = process.argv.slice(2);
setLogger({
  debug: (msg, ctx) => {
    if (msg === 'Term rarity weights') {
      console.log('WEIGHTS:', Object.entries(ctx.weights).map(([k, v]) => `${k}=${v.toFixed(2)}`).join('  '));
    } else if (msg === 'Ranked search candidates') {
      console.log('RANKED:');
      for (const c of ctx.candidates) console.log(`  ${String(c.score).padStart(7)} ${c.kind.padEnd(10)} ${c.name.padEnd(34)} ${c.file}`);
    }
  },
  info: () => {}, warn: () => {}, error: () => {},
});
const cg = await CodeGraph.open(root);
try {
  await cg.findRelevantContext(query, { searchLimit: 8, traversalDepth: 3, maxNodes: 200, minScore: 0.2 });
} finally {
  cg.close();
}
