import path from 'node:path';
import { backendDoc } from './backend.js';
import { deployDoc } from './deploy.js';
import { frontendDoc } from './frontend.js';
import { rootDoc } from './root.js';
import { buildPermissions } from './settings.js';
import { MANUAL_LINE, renderDoc } from './util.js';

const PART_DOCS = { backend: backendDoc, frontend: frontendDoc, deploy: deployDoc };

const finish = (lines) => `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n\n${MANUAL_LINE}\n`;

/**
 * Retourne la liste des fichiers à écrire :
 * [{ path, kind: 'markdown', content } | { path, kind: 'settings', permissions }]
 */
export function renderAll(answers) {
  const { parts, dirs } = answers.project;
  const files = [];

  // Les parties dont le dossier est la racine sont fusionnées dans le CLAUDE.md racine.
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

  if (answers.output.settings) {
    files.push({ path: path.join('.claude', 'settings.json'), kind: 'settings', permissions: buildPermissions(answers) });
  }
  return files;
}
