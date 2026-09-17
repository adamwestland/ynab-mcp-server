import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

/**
 * Where a tool wrote its full JSON result when the caller asked for `output_path`.
 */
export interface JsonFileWriteResult {
  /** Absolute path of the file that was written. */
  path: string;
  /** Size of the file in bytes. */
  bytes: number;
}

/**
 * Serialize `data` as pretty-printed JSON to `outputPath`, creating parent
 * directories as needed. Relative paths resolve against the server's cwd, so
 * callers should pass absolute paths; the absolute path is returned either way.
 *
 * Read tools use this to keep large responses (full-month category lists,
 * 90-day transaction snapshots) out of the MCP response stream, where clients
 * commonly truncate tool results, and hand back a short summary instead.
 */
export function writeJsonFile(outputPath: string, data: unknown): JsonFileWriteResult {
  const path = resolve(outputPath);
  mkdirSync(dirname(path), { recursive: true });
  const text = JSON.stringify(data, null, 2);
  writeFileSync(path, text, 'utf-8');
  return { path, bytes: Buffer.byteLength(text, 'utf-8') };
}
