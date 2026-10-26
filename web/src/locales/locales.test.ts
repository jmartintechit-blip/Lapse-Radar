import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { es } from './es';

// Every error text the server can send must have a Spanish version, or Spanish users would see English.
describe('server messages in Spanish', () => {
  const dir = new URL('../../../server/', import.meta.url);
  const sources = readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => readFileSync(new URL(f, dir), 'utf8'));
  const found = new Set<string>();
  for (const source of sources) {
    for (const m of source.matchAll(/fail\(\s*res,\s*\d+,\s*'[a-z_]+',\s*'([^']+)'/g))
      found.add(m[1]!);
    for (const m of source.matchAll(/message: '([^']+)'/g)) found.add(m[1]!);
  }

  it('finds the messages (guards the regular expressions above)', () => {
    expect(found.size).toBeGreaterThan(20);
  });
  it('has a translation for each one', () => {
    const missing = [...found].filter((message) => !es.serverMessages[message]);
    expect(missing).toEqual([]);
  });
  it('has no translation left over for a message the server no longer sends', () => {
    const extra = Object.keys(es.serverMessages).filter((message) => !found.has(message));
    expect(extra).toEqual([]);
  });
});
