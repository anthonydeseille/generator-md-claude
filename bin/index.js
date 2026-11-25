#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import * as p from '@clack/prompts';
import { askAll } from '../src/questions.js';
import { renderAll } from '../src/render/index.js';
import { writeFile } from '../src/writer.js';

const CONFIG_FILE = '.md-claude.json';
const CONFIG_VERSION = 2;

const HELP = `
md-claude : génère CLAUDE.md et .claude/settings.json pour un projet Spring Boot / Angular

Usage : md-claude [options]

Options :
  -y, --skip-prompts   Régénère à partir de ${CONFIG_FILE} sans poser de questions
  -f, --force          Écrase les fichiers existants sans demander
      --dry-run        Affiche le résultat sans rien écrire
  -h, --help           Affiche cette aide

Les réponses sont enregistrées dans ${CONFIG_FILE} (à commiter) : relancer la commande
les propose par défaut. Dans les CLAUDE.md, tout ce qui suit la ligne
"<!-- md-claude:manual ..." est conservé lors des régénérations.
`;

async function main() {
  const { values: args } = parseArgs({
    options: {
      'skip-prompts': { type: 'boolean', short: 'y' },
      force: { type: 'boolean', short: 'f' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (args.help) {
    console.log(HELP);
    return;
  }

  const cwd = process.cwd();
  const configPath = path.join(cwd, CONFIG_FILE);
  let previous = null;
  try {
    previous = JSON.parse(await fs.readFile(configPath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`${CONFIG_FILE} illisible : ${err.message}`);
  }

  p.intro(' md-claude · CLAUDE.md pour Spring Boot / Angular ');

  let answers;
  if (args['skip-prompts']) {
    if (!previous) {
      p.cancel(`--skip-prompts nécessite un ${CONFIG_FILE} existant.`);
      process.exit(1);
    }
    if (previous.version !== CONFIG_VERSION) {
      p.cancel(`${CONFIG_FILE} vient d'une ancienne version : relancez sans --skip-prompts pour compléter les réponses.`);
      process.exit(1);
    }
    answers = previous.answers;
    p.log.info(`Régénération à partir de ${CONFIG_FILE}.`);
  } else {
    if (previous) p.log.info(`${CONFIG_FILE} trouvé : les réponses précédentes sont proposées par défaut.`);
    answers = await askAll(previous?.answers ?? {});
  }

  const files = renderAll(answers);

  if (args['dry-run']) {
    for (const f of files) {
      const body = f.kind === 'settings' ? JSON.stringify({ permissions: f.permissions }, null, 2) : f.content;
      console.log(`\n===== ${f.path} =====\n${body}`);
    }
    p.outro('Dry run : aucun fichier écrit.');
    return;
  }

  const report = [];
  for (const f of files) report.push(`${f.path} : ${await writeFile(cwd, f, { force: args.force })}`);

  await fs.writeFile(configPath, `${JSON.stringify({ version: CONFIG_VERSION, answers }, null, 2)}\n`, 'utf8');
  report.push(`${CONFIG_FILE} : enregistré`);

  p.note(report.join('\n'), 'Fichiers');
  p.outro('Terminé. Relisez les CLAUDE.md générés et complétez-les après le marqueur "md-claude:manual".');
}

main().catch((err) => {
  p.log.error(err.message);
  process.exit(1);
});
