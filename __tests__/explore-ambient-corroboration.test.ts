/**
 * codegraph_explore — the corroborating sibling in the NL-stopword guard must
 * itself be a SPECIFIC name.
 *
 * The named-symbol seeding lets a bare English word seed (and tier) a
 * definition only when another query token is also a symbol in that file
 * (see explore-nl-stopword-collision.test.ts). But any file large enough — a
 * session class, a generated protobuf, a platform `.d.ts` — declares a `task`,
 * a `model` and a `role`, so on "how subagent routing picks a model role from
 * the task difficulty" those three corroborated each other in a 15k-line
 * session file and it out-tiered the routing module that had scored 2×
 * higher. A name that is a symbol in more than a sliver of the index is
 * ambient vocabulary, not evidence.
 *
 * `CODEGRAPH_AMBIENT_NAME_FILES` raises the sliver out of reach, which this
 * suite uses to pin the pre-guard inversion as the control.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import CodeGraph from '../src/index';
import { ToolHandler } from '../src/mcp/tools';
import type { ExploreDiagnosticReport } from '../src/mcp/explore-diagnostics';

const QUERY = 'how subagent routing picks a model role from the task difficulty';
const ANSWER = 'src/orchestration/subagent-routing.ts';
const COLLISION = 'src/session/session.ts';
/** Files declaring `model`, `role` and `task` — past the guard's floor of 8. */
const AMBIENT_FILES = 12;

/** Paths explore rendered as full-body ``**`<path>`** —`` source sections, in order. */
function sourcedFiles(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\*\*`(.+?)`\*\* —/);
    if (m) out.push(m[1].trim().replace(/\\/g, '/'));
  }
  return out;
}

describe('codegraph_explore — ambient names do not corroborate a bare-word seed', () => {
  let testDir: string;
  let cg: CodeGraph;
  let handler: ToolHandler;

  beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codegraph-ambient-'));

    // The answer: the routing module the question is about.
    fs.mkdirSync(path.join(testDir, 'src', 'orchestration'), { recursive: true });
    fs.writeFileSync(path.join(testDir, ANSWER),
      `export interface RoutingRequest {\n` +
      `  difficulty: 'low' | 'medium' | 'high';\n` +
      `  explicitModel?: string;\n` +
      `}\n` +
      `export function resolveSubagentRouting(request: RoutingRequest): string {\n` +
      `  if (request.explicitModel) return request.explicitModel;\n` +
      `  if (request.difficulty === 'high') return 'slow';\n` +
      `  if (request.difficulty === 'low') return 'smol';\n` +
      `  return 'task';\n` +
      `}\n`);

    // The collision: a big class whose METHODS are the query's bare words.
    // Substantive bodies and an internal call mesh so nothing is a stub.
    fs.mkdirSync(path.join(testDir, 'src', 'session'), { recursive: true });
    const methods = ['task', 'model', 'role'];
    const body = methods.map((m) =>
      `  ${m}(): string {\n` +
      `    const value = this.state.get('${m}') ?? '';\n` +
      `    this.touch('${m}');\n` +
      `    return value;\n` +
      `  }\n`).join('');
    const filler = Array.from({ length: 30 }, (_, i) =>
      `  step${i}(): number {\n    this.touch('step${i}');\n    return ${i};\n  }\n`).join('');
    fs.writeFileSync(path.join(testDir, COLLISION),
      `export class Session {\n` +
      `  private state = new Map<string, string>();\n` +
      `  private touched: string[] = [];\n` +
      `  touch(key: string): void {\n    this.touched.push(key);\n  }\n` +
      body + filler +
      `}\n`);

    // Ambient vocabulary: the same names as symbols across many files.
    fs.mkdirSync(path.join(testDir, 'src', 'gen'), { recursive: true });
    for (let i = 0; i < AMBIENT_FILES; i++) {
      fs.writeFileSync(path.join(testDir, 'src', 'gen', `entity${i}.ts`),
        `export interface Entity${i} {\n  model: string;\n  role: string;\n  task: string;\n}\n`);
    }

    cg = CodeGraph.initSync(testDir, { config: { include: ['**/*.ts'], exclude: [] } });
    await cg.indexAll();
    handler = new ToolHandler(cg);
  }, 120_000);

  afterAll(() => {
    if (cg) cg.destroy();
    if (testDir && fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** One explore call; the rendered file order plus each file's diagnostic record. */
  async function explore(): Promise<{ files: string[]; named: (file: string) => boolean | undefined }> {
    const sidecar = path.join(testDir, `explore-diag-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
    vi.stubEnv('CODEGRAPH_EXPLORE_DEBUG', sidecar);
    const res = await handler.execute('codegraph_explore', { query: QUERY });
    expect(res.isError).toBeFalsy();
    const written = fs.readFileSync(sidecar, 'utf-8').trim().split('\n').filter(Boolean);
    const report = JSON.parse(written[written.length - 1]!) as ExploreDiagnosticReport;
    return {
      files: sourcedFiles(res.content[0]!.text),
      named: (file) => report.files.find((f) => f.path.replace(/\\/g, '/').endsWith(file))?.named,
    };
  }

  it('fixture shape — the bare words are symbols in more files than the guard\'s floor', () => {
    for (const name of ['model', 'role', 'task']) {
      expect(cg.countFilesDeclaringName(name), name).toBeGreaterThan(8);
    }
    expect(cg.countFilesDeclaringName('difficulty')).toBeLessThanOrEqual(8);
  });

  it('the session class earns no named tier from `task`/`model`/`role`, and the routing module renders', async () => {
    const { files, named } = await explore();
    expect(named(COLLISION)).toBe(false);
    expect(files.some((f) => f.endsWith(ANSWER))).toBe(true);
  });

  it('is the specificity requirement that does it — with the floor out of reach, the session class is tiered and renders first', async () => {
    vi.stubEnv('CODEGRAPH_AMBIENT_NAME_FILES', '1000');
    const { files, named } = await explore();
    expect(named(COLLISION)).toBe(true);
    expect(files[0]).toMatch(/session\.ts$/);
  });
});
