import { existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, delimiter, dirname, join, resolve, sep } from 'path';

/** Env var: path-delimited list of directories `output_path` may write into. */
export const OUTPUT_DIR_ENV = 'YNAB_OUTPUT_DIR';

/**
 * Where a tool wrote its full result when the caller asked for `output_path`.
 */
export interface JsonFileWriteResult {
  /** Absolute path of the file that was written. */
  path: string;
  /** Size of the file in bytes. */
  bytes: number;
}

/**
 * Directories an `output_path` may resolve into, as absolute paths.
 *
 * `YNAB_OUTPUT_DIR` (one or more directories separated by the platform path
 * delimiter) wins when set. Otherwise the server's working directory and the
 * OS temp dir are allowed, which keeps local usage working without setup.
 * An unattended agent deployment should always pin this explicitly.
 */
export function allowedOutputDirs(): string[] {
  const raw = process.env[OUTPUT_DIR_ENV];
  const dirs = raw && raw.trim()
    ? raw.split(delimiter).map(d => d.trim()).filter(Boolean)
    : [process.cwd(), tmpdir()];
  return dirs.map(d => resolve(d));
}

function isInside(base: string, target: string): boolean {
  const prefix = base.endsWith(sep) ? base : base + sep;
  return target === base || target.startsWith(prefix);
}

function realOrSelf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function isAllowed(target: string, bases: string[]): boolean {
  return bases.some(base => isInside(base, target) || isInside(realOrSelf(base), target));
}

/**
 * Validate `outputPath` against {@link allowedOutputDirs} and create its parent
 * directory. Returns the absolute path.
 *
 * Rejects anything that resolves outside every allowed directory, including
 * `../` traversal, absolute paths elsewhere, a parent directory that is a
 * symlink pointing outside, and an existing target that is itself a symlink.
 * Tool arguments come from an LLM that reads untrusted transaction text, so
 * this is the one place file writes are fenced.
 */
export function resolveOutputPath(outputPath: string): string {
  const target = resolve(outputPath);
  const bases = allowedOutputDirs();
  const reject = (why: string): never => {
    throw new Error(
      `output_path ${why}: ${target}. Allowed: ${bases.join(', ')} (set ${OUTPUT_DIR_ENV} to change).`
    );
  };

  if (!isAllowed(target, bases)) reject('is outside the allowed output directories');

  mkdirSync(dirname(target), { recursive: true });

  // A symlinked parent (or target) could point anywhere; check the real location too.
  const realTarget = join(realOrSelf(dirname(target)), basename(target));
  if (!isAllowed(realTarget, bases)) reject('resolves (via symlink) outside the allowed output directories');
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) reject('is a symlink');

  return target;
}

/**
 * Serialize `data` as pretty-printed JSON to `outputPath` (validated by
 * {@link resolveOutputPath}), returning where it went and how big it is.
 *
 * Read tools use this to keep large responses (full-month category lists,
 * 90-day transaction snapshots) out of the MCP response stream, where clients
 * commonly truncate tool results, and hand back a short summary instead.
 */
export function writeJsonFile(outputPath: string, data: unknown): JsonFileWriteResult {
  const path = resolveOutputPath(outputPath);
  const text = JSON.stringify(data, null, 2);
  writeFileSync(path, text, 'utf-8');
  return { path, bytes: Buffer.byteLength(text, 'utf-8') };
}
