import fs from 'node:fs/promises';
import path from 'node:path';
import * as p from '@clack/prompts';
import { mergeSettings } from './render/settings.js';
import { MANUAL_MARKER } from './render/util.js';

async function readIfExists(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** Conserve la partie manuelle (après le marqueur) d'un fichier déjà généré. */
function withManualPart(generated, existing) {
  const idx = existing.indexOf(MANUAL_MARKER);
  if (idx === -1) return null;
  const lineEnd = existing.indexOf('\n', idx);
  const tail = lineEnd === -1 ? '' : existing.slice(lineEnd + 1);
  return generated + tail;
}

async function resolveConflict(rel, { force }) {
  if (force) return 'overwrite';
  const choice = await p.select({
    message: `${rel} existe déjà et n'a pas été généré par cet outil. Que faire ?`,
    options: [
      { value: 'new', label: `Écrire à côté (${rel}.new)`, hint: 'comparer et fusionner à la main' },
      { value: 'overwrite', label: 'Écraser' },
      { value: 'skip', label: 'Ne pas toucher' },
    ],
  });
  if (p.isCancel(choice)) return 'skip';
  return choice;
}

/** Écrit un fichier, retourne un statut lisible. */
export async function writeFile(cwd, file, opts) {
  const abs = path.join(cwd, file.path);
  const existing = await readIfExists(abs);
  let content;

  if (file.kind === 'settings') {
    let base = {};
    if (existing) {
      try {
        base = JSON.parse(existing);
      } catch {
        p.log.warn(`${file.path} n'est pas du JSON valide : laissé tel quel.`);
        return 'ignoré';
      }
    }
    content = `${JSON.stringify(mergeSettings(base, file.permissions), null, 2)}\n`;
  } else {
    content = file.content;
    if (existing) content = withManualPart(file.content, existing) ?? content;
  }

  if (existing === content) return 'inchangé';

  let target = abs;
  let status = existing ? (file.kind === 'settings' ? 'fusionné' : 'mis à jour') : 'créé';

  // Fichier existant écrit à la main (pas de marqueur) : on demande.
  if (existing && file.kind === 'markdown' && !existing.includes(MANUAL_MARKER)) {
    const choice = await resolveConflict(file.path, opts);
    if (choice === 'skip') return 'ignoré';
    if (choice === 'new') {
      target = `${abs}.new`;
      status = `écrit dans ${file.path}.new`;
    } else {
      status = 'écrasé';
    }
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
  return status;
}
