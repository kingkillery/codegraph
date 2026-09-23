// How many definitions share each exact (case-insensitive) name?
// Usage: node scripts/probe-defs.mjs <projectRoot> word1 word2 ...
import { CodeGraph } from '../dist/index.js';

const [root, ...words] = process.argv.slice(2);
const cg = await CodeGraph.open(root);
try {
  for (const w of words) {
    const all = cg.getNodesByName(w);
    const seedable = all.filter((n) => ['method', 'function', 'component', 'constructor', 'variable', 'constant'].includes(n.kind));
    const files = new Set(all.map((n) => n.filePath));
    console.log(`${w.padEnd(14)} defs=${String(all.length).padStart(4)} seedable=${String(seedable.length).padStart(4)} files=${String(files.size).padStart(4)}`);
  }
} finally {
  cg.close();
}
