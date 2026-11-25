#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import * as p from '@clack/prompts';
import { offerBootstrap } from '../src/next-step.js';
import { askAll } from '../src/questions.js';
import { renderAll } from '../src/render/index.js';
import { writeFile } from '../src/writer.js';

const CONFIG_FILE = '.md-claude.json';
const CONFIG_VERSION = 2;

const HELP = `
md-claude: generates CLAUDE.md and .claude/settings.json for a Spring Boot / Angular project

Usage: md-claude [options]

Options:
  -y, --skip-prompts   Regenerate from ${CONFIG_FILE} without asking questions
  -f, --force          Overwrite existing files without asking
      --dry-run        Print the result without writing anything
  -h, --help           Show this help

Answers are saved in ${CONFIG_FILE} (commit it): running the command again
offers them as defaults. In CLAUDE.md files, everything below the
"<!-- md-claude:manual ..." line is kept when regenerating.
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
    if (err.code !== 'ENOENT') throw new Error(`Cannot read ${CONFIG_FILE}: ${err.message}`);
  }

  p.intro(' md-claude · CLAUDE.md for Spring Boot / Angular ');

  let answers;
  if (args['skip-prompts']) {
    if (!previous) {
      p.cancel(`--skip-prompts requires an existing ${CONFIG_FILE}.`);
      process.exit(1);
    }
    if (previous.version !== CONFIG_VERSION) {
      p.cancel(`${CONFIG_FILE} comes from an older version: run again without --skip-prompts to complete the answers.`);
      process.exit(1);
    }
    answers = previous.answers;
    p.log.info(`Regenerating from ${CONFIG_FILE}.`);
  } else {
    if (previous) p.log.info(`${CONFIG_FILE} found: previous answers are offered as defaults.`);
    answers = await askAll(previous?.answers ?? {});
  }

  const files = renderAll(answers);

  if (args['dry-run']) {
    for (const f of files) {
      const body = f.kind === 'settings' ? JSON.stringify({ permissions: f.permissions }, null, 2) : f.content;
      console.log(`\n===== ${f.path} =====\n${body}`);
    }
    p.outro('Dry run: no file written.');
    return;
  }

  const report = [];
  for (const f of files) report.push(`${f.path}: ${await writeFile(cwd, f, { force: args.force })}`);

  await fs.writeFile(configPath, `${JSON.stringify({ version: CONFIG_VERSION, answers }, null, 2)}\n`, 'utf8');
  report.push(`${CONFIG_FILE}: saved`);

  p.note(report.join('\n'), 'Files');
  p.log.info('Review the generated CLAUDE.md files and complete them below the "md-claude:manual" marker.');

  const launched = await offerBootstrap(cwd, answers, { interactive: !args['skip-prompts'] && process.stdin.isTTY });
  if (!launched) p.outro('Done.');
}

main().catch((err) => {
  p.log.error(err.message);
  process.exit(1);
});
