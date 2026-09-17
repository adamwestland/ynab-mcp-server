/**
 * writeJsonFile Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, isAbsolute } from 'path';
import { writeJsonFile } from '../../src/utils/fileOutput.js';

describe('writeJsonFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ynab-mcp-fileoutput-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes pretty JSON and reports the absolute path and byte size', () => {
    const target = join(dir, 'out.json');
    const data = { a: 1, b: ['x', 'y'] };

    const result = writeJsonFile(target, data);

    expect(isAbsolute(result.path)).toBe(true);
    expect(result.path).toBe(target);
    const text = readFileSync(target, 'utf-8');
    expect(JSON.parse(text)).toEqual(data);
    expect(text).toBe(JSON.stringify(data, null, 2));
    expect(result.bytes).toBe(Buffer.byteLength(text, 'utf-8'));
  });

  it('creates missing parent directories', () => {
    const target = join(dir, 'nested', 'deeper', 'out.json');
    expect(existsSync(join(dir, 'nested'))).toBe(false);

    writeJsonFile(target, { ok: true });

    expect(JSON.parse(readFileSync(target, 'utf-8'))).toEqual({ ok: true });
  });

  it('overwrites an existing file', () => {
    const target = join(dir, 'out.json');
    writeJsonFile(target, { version: 1 });
    writeJsonFile(target, { version: 2 });

    expect(JSON.parse(readFileSync(target, 'utf-8'))).toEqual({ version: 2 });
  });
});
