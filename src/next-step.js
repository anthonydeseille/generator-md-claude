import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';

// Files whose presence means a part has already been scaffolded.
const MARKERS = {
  backend: ['pom.xml', 'build.gradle.kts', 'build.gradle'],
  frontend: ['angular.json'],
  deploy: ['Chart.yaml', 'kustomization.yaml', 'helm', 'charts', 'k8s'],
};

const isWindows = process.platform === 'win32';

/** Parts that still need /bootstrap (no build file / manifest found in their directory). */
export function partsToBootstrap(cwd, answers) {
  const { parts, dirs } = answers.project;
  return parts.filter((part) => !MARKERS[part].some((file) => existsSync(path.join(cwd, dirs[part], file))));
}

function claudeAvailable() {
  const res = spawnSync('claude', ['--version'], { stdio: 'ignore', shell: isWindows });
  return !res.error && res.status === 0;
}

/**
 * End of the run: offer to open Claude Code with /bootstrap already typed.
 * Returns true if Claude Code was launched (the caller must then stop).
 */
export async function offerBootstrap(cwd, answers, { interactive }) {
  if (answers.output.bootstrap === false) return false;
  const pending = partsToBootstrap(cwd, answers);
  if (!pending.length) return false;

  const hint = `Next step: run \`claude\` in this directory, then type /bootstrap (to scaffold: ${pending.join(', ')}).`;

  if (!interactive || !claudeAvailable()) {
    p.log.info(hint);
    return false;
  }

  const launch = await p.confirm({
    message: `The project is not scaffolded yet (${pending.join(', ')}). Launch Claude Code with /bootstrap now?`,
    initialValue: true,
  });
  if (p.isCancel(launch) || !launch) {
    p.log.info(hint);
    return false;
  }

  p.outro('Opening Claude Code with /bootstrap…');
  const child = spawn('claude', ['/bootstrap'], { cwd, stdio: 'inherit', shell: isWindows });
  await new Promise((resolve) => {
    child.on('exit', (code) => {
      process.exitCode = code ?? 0;
      resolve();
    });
    child.on('error', (err) => {
      p.log.error(`Could not launch Claude Code: ${err.message}`);
      p.log.info(hint);
      resolve();
    });
  });
  return true;
}
