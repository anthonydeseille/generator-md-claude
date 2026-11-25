import path from 'node:path';
import { backendDoc } from './backend.js';
import { bootstrapCommand } from './bootstrap.js';
import { deployDoc } from './deploy.js';
import { frontendDoc } from './frontend.js';
import { rootDoc } from './root.js';
import { buildPermissions } from './settings.js';
import { MANUAL_LINE, renderDoc } from './util.js';

const PART_DOCS = { backend: backendDoc, frontend: frontendDoc, deploy: deployDoc };

const finish = (lines) => `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n\n${MANUAL_LINE}\n`;

/**
 * Returns the list of files to write:
 * [{ path, kind: 'markdown', content } | { path, kind: 'settings', permissions }]
 */
export function renderAll(answers) {
  const { parts, dirs } = answers.project;
  const files = [];

  // Parts located at the repository root are merged into the root CLAUDE.md.
  const rootLines = renderDoc(rootDoc(answers), 1);
  for (const part of parts) {
    const doc = PART_DOCS[part](answers);
    if (dirs[part] === '.') {
      rootLines.push(...renderDoc(doc, 2));
    } else {
      files.push({ path: path.join(dirs[part], 'CLAUDE.md'), kind: 'markdown', content: finish(renderDoc(doc, 1)) });
    }
  }
  files.unshift({ path: 'CLAUDE.md', kind: 'markdown', content: finish(rootLines) });

  // /bootstrap command: only useful when there is something to scaffold.
  if (answers.output.bootstrap !== false && parts.length) {
    files.push({
      path: path.join('.claude', 'commands', 'bootstrap.md'),
      kind: 'markdown',
      content: finish(bootstrapCommand(answers).split('\n')),
    });
  }

  if (answers.output.settings) {
    files.push({ path: path.join('.claude', 'settings.json'), kind: 'settings', permissions: buildPermissions(answers) });
  }
  return files;
}
