// Probe a single search term / exact name against the index.
// Usage: node scripts/probe-term.mjs <projectRoot> <term> [limit]
import { CodeGraph } from '../dist/index.js';

const [root, term, lim] = process.argv.slice(2);
const cg = await CodeGraph.open(root);
try {
  const rs = cg.searchNodes(term, { limit: Number(lim ?? 30) });
  console.log(`== searchNodes(${JSON.stringify(term)}) → ${rs.length}`);
  for (const r of rs) console.log(`  ${r.score.toFixed(1).padStart(6)} ${r.node.kind.padEnd(11)} ${r.node.name.padEnd(40)} ${r.node.filePath}:${r.node.startLine}`);
} finally {
  cg.close();
}
