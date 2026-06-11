import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const packDir = await mkdtemp(join(tmpdir(), 'reflection-pack-'));
const consumerDir = await mkdtemp(join(tmpdir(), 'reflection-consumer-'));

await run('pnpm', ['pack', '--pack-destination', packDir], { cwd: repoRoot });

const tarballs = (await readdir(packDir)).filter((file) => file.endsWith('.tgz'));
if (tarballs.length !== 1) {
  throw new Error(`Expected exactly one package tarball in ${packDir}, found ${tarballs.length}.`);
}

const tarballPath = join(packDir, tarballs[0]);
await writeFile(join(consumerDir, 'package.json'), JSON.stringify({ name: 'reflection-consumer-smoke', private: true, type: 'module' }, null, 2));
await run('pnpm', ['add', '-D', tarballPath], { cwd: consumerDir });
await run('node', [
  '--input-type=module',
  '-e',
  "import { defineReflection } from 'reflection-check'; const config = defineReflection({ project: 'consumer-smoke', contracts: { browser: { baseUrl: 'http://127.0.0.1:5173', routes: [] } } }); if (config.project !== 'consumer-smoke') throw new Error('bad config export');"
], { cwd: consumerDir });
await run('pnpm', ['exec', 'reflection', 'doctor'], { cwd: consumerDir });
await run('pnpm', ['exec', 'reflection-check', 'doctor'], { cwd: consumerDir });
await run('pnpm', ['exec', 'reflection', 'init', '--dry-run', '--preset', 'vite-react'], { cwd: consumerDir });

console.log(`Package install smoke passed for ${packageJson.name}@${packageJson.version}`);
console.log(`Tarball: ${tarballPath}`);
console.log(`Consumer: ${consumerDir}`);

async function run(command, args, options) {
  try {
    const result = await execFileAsync(command, args, {
      ...options,
      env: process.env,
      maxBuffer: 10 * 1024 * 1024
    });

    if (result.stdout.trim()) {
      console.log(result.stdout.trim());
    }
    if (result.stderr.trim()) {
      console.error(result.stderr.trim());
    }
  } catch (error) {
    if (error.stdout) {
      console.log(String(error.stdout).trim());
    }
    if (error.stderr) {
      console.error(String(error.stderr).trim());
    }
    throw error;
  }
}
