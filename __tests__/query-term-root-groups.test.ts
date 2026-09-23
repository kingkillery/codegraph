/**
 * Root grouping of query terms for the co-occurrence re-rank in
 * findRelevantContext (context/index.ts, Step 5a).
 *
 * A symbol that matches several forms of one root word must count as matching
 * ONE query concept. The grouping used to be pure substring, which misses the
 * `+e` stem the `-ing`/`-er` rules emit: "setting" → "sette" is not a
 * substring of "setting", so it formed its own group and `setText` — which
 * matches "set", "sett" AND "sette" — was scored as a two-concept hit and
 * doubled on a query about settings, displacing the real answer once the
 * common-word noise around it was discounted.
 */
import { describe, it, expect } from 'vitest';
import { groupTermsByRoot, isSameRoot, extractSearchTerms } from '../src/search/query-utils';

describe('isSameRoot', () => {
  it('treats substrings as one root (existing stems)', () => {
    expect(isSameRoot('indexed', 'index')).toBe(true);
    expect(isSameRoot('eager', 'eage')).toBe(true);
    expect(isSameRoot('delegation', 'delegat')).toBe(true);
  });

  it('treats the +e stem as one root with its base', () => {
    expect(isSameRoot('setting', 'sette')).toBe(true);
    expect(isSameRoot('handling', 'handle')).toBe(true);
    expect(isSameRoot('builder', 'builde')).toBe(true);
  });

  it('keeps distinct short words apart', () => {
    expect(isSameRoot('role', 'roll')).toBe(false);
    expect(isSameRoot('block', 'blob')).toBe(false);
    expect(isSameRoot('test', 'text')).toBe(false);
    expect(isSameRoot('prompt', 'proxy')).toBe(false);
    expect(isSameRoot('set', 'sys')).toBe(false);
  });
});

describe('groupTermsByRoot', () => {
  it('collapses every stem of "setting" into a single group', () => {
    const terms = extractSearchTerms('how the setting is applied');
    // The stemmer must still emit the +e form, or this test guards nothing.
    expect(terms).toContain('sette');
    const groups = groupTermsByRoot(terms);
    const settingGroups = groups.filter((g) => g.some((t) => t.startsWith('set')));
    expect(settingGroups).toHaveLength(1);
    expect(settingGroups[0]).toEqual(expect.arrayContaining(['setting', 'sett', 'sette', 'set']));
  });

  it('keeps unrelated concepts in separate groups, longest term first', () => {
    const groups = groupTermsByRoot(['index', 'indexed', 'shard', 'search', 'searches']);
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g[0])).toEqual(['searches', 'indexed', 'shard']);
    expect(groups.find((g) => g[0] === 'indexed')).toEqual(['indexed', 'index']);
    expect(groups.find((g) => g[0] === 'searches')).toEqual(['searches', 'search']);
  });
});
