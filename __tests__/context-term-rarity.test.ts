/**
 * findRelevantContext — term-rarity weighting of the text channel.
 *
 * Each query term is searched and scored on its own, and a flat exact-name
 * bonus (+80) makes an exact hit on a ubiquitous word score the same as one
 * on a rare word. On a prose query the ONE discriminating term ("eager") then
 * lost every merged slot to its common neighbours ("system", "prompt", "set"):
 * the answer's symbols never reached the root list and explore rendered the
 * wrong files.
 *
 * The weight is the fraction of a term's match set the channel can see —
 * `min(1, max(50, sqrt(N)) / reach)` — so a term reaching a tractable
 * neighbourhood keeps full weight however small the index, while one
 * reaching hundreds of nodes is discounted. `CODEGRAPH_TERM_RARITY_SHARPNESS=0`
 * disables it, which this suite uses to pin both sides.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import CodeGraph from '../src/index';

const QUERY = 'how the eager setting shapes the system prompt';
const ANSWER = 'src/prompt/prompt-builder.ts';
const COLLISION = 'src/core/system.ts';
/** Enough `system*` symbols that the term's reach clears the 50-node free floor by a wide margin. */
const AMBIENT_FILES = 400;

describe('findRelevantContext — term rarity weighting', () => {
  let testDir: string;
  let cg: CodeGraph;

  beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codegraph-rarity-'));

    // The answer: the only file whose symbols carry the query's rare term.
    fs.mkdirSync(path.join(testDir, 'src', 'prompt'), { recursive: true });
    fs.writeFileSync(path.join(testDir, ANSWER),
      `export interface PromptOptions {\n` +
      `  eagerTasks: boolean;\n` +
      `  eagerTasksAlways: boolean;\n` +
      `}\n` +
      `export function buildPrompt(options: PromptOptions): string {\n` +
      `  const lines = ['You are an agent.'];\n` +
      `  if (options.eagerTasks) lines.push('Delegate early.');\n` +
      `  if (options.eagerTasksAlways) lines.push('Always delegate.');\n` +
      `  return lines.join('\\n');\n` +
      `}\n`);

    // The collision: an exact-name hit on a common query word, with a body.
    fs.mkdirSync(path.join(testDir, 'src', 'core'), { recursive: true });
    fs.writeFileSync(path.join(testDir, COLLISION),
      `export function system(): string {\n` +
      `  const parts = ['linux', 'x64'];\n` +
      `  return parts.join('-');\n` +
      `}\n`);

    // Ambient vocabulary: hundreds of `system*` symbols across the index.
    fs.mkdirSync(path.join(testDir, 'src', 'gen'), { recursive: true });
    for (let i = 0; i < AMBIENT_FILES; i++) {
      fs.writeFileSync(path.join(testDir, 'src', 'gen', `svc${i}.ts`),
        `export function system${i}Init(): number {\n  return ${i};\n}\n`);
    }

    cg = CodeGraph.initSync(testDir, { config: { include: ['**/*.ts'], exclude: [] } });
    await cg.indexAll();
  }, 120_000);

  afterAll(() => {
    if (cg) cg.destroy();
    if (testDir && fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** Rank (0-based) of the first root in `file`, or -1. */
  async function firstRootRank(file: string): Promise<number> {
    const sg = await cg.findRelevantContext(QUERY, { searchLimit: 8, traversalDepth: 1, maxNodes: 50, minScore: 0.2 });
    return sg.roots.findIndex((id) => sg.nodes.get(id)?.filePath === file);
  }

  it('fixture shape — the common term reaches far past the free floor, the rare one does not', () => {
    const systemReach = cg.searchNodes('system', { limit: 1000 }).length;
    const eagerReach = cg.searchNodes('eager', { limit: 1000 }).length;
    expect(systemReach).toBeGreaterThan(50);
    expect(eagerReach).toBeLessThanOrEqual(50);
  });

  it('ranks the rare term\'s file above the common-word exact match', async () => {
    const answer = await firstRootRank(ANSWER);
    const collision = await firstRootRank(COLLISION);
    expect(answer).toBeGreaterThanOrEqual(0);
    if (collision !== -1) expect(answer).toBeLessThan(collision);
  });

  it('is the weighting that does it — unweighted, the exact match on the common word wins', async () => {
    vi.stubEnv('CODEGRAPH_TERM_RARITY_SHARPNESS', '0');
    const answer = await firstRootRank(ANSWER);
    const collision = await firstRootRank(COLLISION);
    // Measured: the collision is root #1 and the answer file has no root at
    // all — its symbols never survive the merged slot cut. Accept either that
    // or a plain inversion, so the gate is "the common word wins", not one
    // exact shape of losing.
    expect(collision).toBe(0);
    expect(answer === -1 || collision < answer).toBe(true);
  });
});
