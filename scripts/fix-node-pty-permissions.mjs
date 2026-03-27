import { chmodSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

if (process.platform !== 'darwin') {
  process.exit(0);
}

const require = createRequire(new URL('../packages/server/package.json', import.meta.url));

function isExecutableFile(path) {
  try {
    const stats = statSync(path);
    return stats.isFile() && (stats.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

try {
  const packageJsonPath = require.resolve('node-pty/package.json');
  const helperPath = join(dirname(packageJsonPath), 'prebuilds', `darwin-${process.arch}`, 'spawn-helper');

  if (!isExecutableFile(helperPath)) {
    chmodSync(helperPath, 0o755);
  }
} catch (error) {
  console.warn(
    `[postinstall] Unable to repair node-pty spawn-helper permissions: ${error instanceof Error ? error.message : String(error)}`,
  );
}
