/**
 * writeJsonFile Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, isAbsolute, delimiter, resolve } from 'path';
import { writeJsonFile, resolveOutputPath, allowedOutputDirs, OUTPUT_DIR_ENV } from '../../src/utils/fileOutput.js';

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

describe('output_path allow-list', () => {
  let dir: string;
  let outside: string;
  const savedEnv = process.env[OUTPUT_DIR_ENV];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ynab-mcp-allowed-'));
    outside = mkdtempSync(join(tmpdir(), 'ynab-mcp-outside-'));
    process.env[OUTPUT_DIR_ENV] = dir;
  });

  afterEach(() => {
    if (savedEnv === undefined) delete process.env[OUTPUT_DIR_ENV];
    else process.env[OUTPUT_DIR_ENV] = savedEnv;
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it('defaults to cwd and the OS temp dir when the env var is unset', () => {
    delete process.env[OUTPUT_DIR_ENV];
    expect(allowedOutputDirs()).toEqual([resolve(process.cwd()), resolve(tmpdir())]);
  });

  it('reads a path-delimited list from the env var', () => {
    process.env[OUTPUT_DIR_ENV] = `${dir}${delimiter}${outside}`;
    expect(allowedOutputDirs()).toEqual([dir, outside]);
    expect(resolveOutputPath(join(outside, 'ok.json'))).toBe(join(outside, 'ok.json'));
  });

  it('accepts paths inside the allowed directory, creating parents', () => {
    const target = join(dir, 'a', 'b', 'c.json');
    expect(resolveOutputPath(target)).toBe(target);
    expect(existsSync(join(dir, 'a', 'b'))).toBe(true);
  });

  it('rejects ../ traversal out of the allowed directory', () => {
    expect(() => resolveOutputPath(join(dir, '..', 'escape.json'))).toThrow(/outside the allowed output directories/);
    expect(() => writeJsonFile(join(dir, 'sub', '..', '..', 'escape.json'), {})).toThrow(/outside/);
  });

  it('rejects absolute paths elsewhere and a sibling with a shared prefix', () => {
    expect(() => resolveOutputPath(join(outside, 'x.json'))).toThrow(/outside/);
    expect(() => resolveOutputPath('/etc/passwd')).toThrow(/outside/);
    expect(() => resolveOutputPath(`${dir}-sibling/x.json`)).toThrow(/outside/);
  });

  it('rejects a symlinked parent that points outside', () => {
    symlinkSync(outside, join(dir, 'link'));
    expect(() => resolveOutputPath(join(dir, 'link', 'x.json'))).toThrow(/via symlink/);
    expect(existsSync(join(outside, 'x.json'))).toBe(false);
  });

  it('rejects an existing target that is a symlink', () => {
    writeFileSync(join(outside, 'victim.json'), '{}');
    symlinkSync(join(outside, 'victim.json'), join(dir, 'alias.json'));
    expect(() => writeJsonFile(join(dir, 'alias.json'), { pwned: true })).toThrow(/symlink/);
    expect(readFileSync(join(outside, 'victim.json'), 'utf-8')).toBe('{}');
  });

  it('names the allowed directories and the env var in the error', () => {
    mkdirSync(join(dir, 'keep'));
    expect(() => resolveOutputPath(join(outside, 'x.json'))).toThrow(new RegExp(`${OUTPUT_DIR_ENV}`));
  });
});
