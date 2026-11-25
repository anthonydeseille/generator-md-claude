import { backendCommands, frontendCommands } from './commands.js';
import { CI, clusterSafetyRules } from './deploy.js';
import { splitList, where } from './util.js';

const LANG = { fr: 'French', en: 'English' };

function organisation(a) {
  const { parts, dirs, layout, deployWhere, related } = a.project;
  const repo = (name) => (name ? ` \`${name}\`` : '');
  const desc = {
    backend: 'Spring Boot API',
    frontend: 'Angular application',
    deploy: 'deployment (images, Kubernetes manifests)',
  };
  return [
    {
      monorepo: '- **Monorepo**: Spring Boot backend and Angular frontend in this repository.',
      backend: '- This repository holds **only the Spring Boot backend**.',
      frontend: '- This repository holds **only the Angular frontend**.',
      infra: '- **Infrastructure** repository: application deployment, no application code.',
    }[layout],
    ...parts
      .filter((p) => dirs[p] !== '.')
      .map((p) => `- \`${dirs[p]}/\`: ${desc[p]} (detailed rules in \`${dirs[p]}/CLAUDE.md\`).`),
    layout === 'backend' && `- Frontend: separate repository${repo(related.frontend)}.`,
    layout === 'frontend' && `- Backend: separate repository${repo(related.backend)}.`,
    layout === 'infra' && related.backend && `- Deployed backend: repository${repo(related.backend)}.`,
    layout === 'infra' && related.frontend && `- Deployed frontend: repository${repo(related.frontend)}.`,
    deployWhere === 'separate' &&
      `- Deployment (manifests, charts, environment config): separate infrastructure repository${repo(related.infra)}. Do not create Kubernetes manifests here; point out what needs to change there.`,
    a.ops.ci !== 'none' && `- CI/CD: ${CI[a.ops.ci]}.`,
  ];
}

function commands(a) {
  const subs = [];
  if (a.backend) {
    const c = backendCommands(a.backend);
    subs.push({
      title: `Backend${where(a.project.dirs.backend)}`,
      lines: [
        `- Run: \`${c.run}\``,
        `- Tests: \`${c.test}\` (single test: \`${c.testOne}\`)`,
        `- Full build + integration tests: \`${c.verify}\``,
        c.format && `- Formatting / quality: \`${c.format}\``,
      ],
    });
  }
  if (a.frontend) {
    const c = frontendCommands(a.frontend);
    subs.push({
      title: `Frontend${where(a.project.dirs.frontend)}`,
      lines: [
        `- Install: \`${c.pm} install\``,
        `- Run: \`${c.start}\``,
        `- Tests: \`${c.test}\``,
        `- Build: \`${c.build}\``,
        c.lint && `- Lint: \`${c.lint}\``,
        c.e2e && `- E2E: \`${c.e2e}\``,
        c.api && `- Regenerate the API client: \`${c.api}\``,
      ],
    });
  }
  if (a.ops.compose) {
    subs.push({ title: 'Local environment', lines: ['- Dependencies: `docker compose up -d` / `docker compose down`'] });
  }
  return subs;
}

function conventions(a) {
  const c = a.conventions;
  const ticket = c.ticketPrefix ? `${c.ticketPrefix}-123` : null;
  const branch = ticket ? `${ticket}-short-description` : 'short-description';
  const branching = {
    feature: `- Short-lived branches from \`main\`: \`feature/${branch}\`, \`fix/${branch}\`. Merge through pull requests.`,
    gitflow: `- Git Flow: \`develop\` as the integration branch, \`feature/${branch}\`, \`release/x.y.z\`, \`hotfix/${branch}\`.`,
    trunk: '- Trunk-based: small, frequent commits on `main`; unfinished features behind a feature flag.',
  }[c.branching];
  return [
    `- Identifiers (classes, methods, variables) in ${LANG[c.codeLang]}; comments and documentation in ${LANG[c.docLang]}.`,
    c.commitStyle === 'conventional'
      ? `- Commits follow Conventional Commits (\`feat:\`, \`fix:\`, \`refactor:\`, \`test:\`, \`chore:\`, \`docs:\`), messages in ${LANG[c.commitLang]}${ticket ? `, ticket reference in the footer (\`Refs: ${ticket}\`)` : ''}.`
      : `- Commit messages in ${LANG[c.commitLang]}, imperative mood, summary line under 72 characters${ticket ? `, with the ticket reference (\`${ticket}\`)` : ''}.`,
    branching,
    '- Comments explain the *why*, not the *what*. No commented-out code left behind.',
  ];
}

function workflow(a) {
  const checks = [a.backend && 'backend build and tests', a.frontend && 'frontend tests and lint'].filter(Boolean);
  return [
    checks.length && `- A task is only done when ${checks.join(' and ')} pass.`,
    '- Do not add a dependency (Maven/Gradle/npm) without saying so explicitly and justifying it.',
    '- Minimal, focused changes: no opportunistic refactoring outside the requested scope.',
  ];
}

export function rootDoc(a) {
  const forbidden = splitList(a.conventions.forbidden, ';').map((f) => `- ${f}`);
  return {
    title: a.project.name,
    intro: a.project.description || undefined,
    sections: [
      { title: 'Organisation', lines: organisation(a) },
      { title: 'Commands', lines: [], subsections: commands(a) },
      { title: 'Conventions', lines: conventions(a) },
      { title: 'Way of working', lines: workflow(a) },
      { title: 'Kubernetes safety rules', lines: clusterSafetyRules(a.ops) },
      { title: 'Forbidden', lines: forbidden },
    ],
  };
}
