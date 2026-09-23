// Ad-hoc probe: dump the per-term search channel and the merged findRelevantContext
// roots for a query, so ranking failures can be diagnosed without the CLI's rendering.
// Usage: node scripts/probe-explore.mjs <projectRoot> "<query>"
import { CodeGraph } from '../dist/index.js';
import { extractSearchTerms } from '../dist/search/query-utils.js';

const [root, query] = process.argv.slice(2);
const cg = await CodeGraph.open(root);
try {
  const terms = extractSearchTerms(query);
  console.log('TERMS:', terms.join(' | '));
  const kinds = ['file', 'module', 'class', 'struct', 'union', 'interface', 'trait', 'protocol',
    'function', 'method', 'property', 'field', 'variable', 'constant',
    'enum', 'enum_member', 'type_alias', 'namespace', 'export', 'route', 'component'];
  for (const term of terms) {
    const rs = cg.searchNodes(term, { limit: 16, kinds });
    console.log(`\n== ${term} (${rs.length})`);
    for (const r of rs.slice(0, 6)) {
      console.log(`  ${r.score.toFixed(1).padStart(6)} ${r.node.kind.padEnd(10)} ${r.node.name.padEnd(36)} ${r.node.filePath}`);
    }
  }
  const sg = await cg.findRelevantContext(query, { searchLimit: 8, traversalDepth: 3, maxNodes: 200, minScore: 0.2 });
  console.log(`\n== ROOTS (${sg.roots.length}) / nodes ${sg.nodes.size}`);
  for (const id of sg.roots) {
    const n = sg.nodes.get(id);
    if (n) console.log(`  ${n.kind.padEnd(10)} ${n.name.padEnd(36)} ${n.filePath}`);
  }
  const files = new Map();
  for (const n of sg.nodes.values()) files.set(n.filePath, (files.get(n.filePath) ?? 0) + 1);
  console.log(`\n== SUBGRAPH FILES (${files.size})`);
  for (const [f, c] of [...files].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${String(c).padStart(3)} ${f}`);
} finally {
  cg.close();
}
