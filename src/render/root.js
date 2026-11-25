import { backendCommands, frontendCommands } from './commands.js';
import { CI, clusterSafetyRules } from './deploy.js';
import { splitList, where } from './util.js';

const LANG = { fr: 'français', en: 'anglais' };

function organisation(a) {
  const { parts, dirs, layout, deployWhere, related } = a.project;
  const repo = (name) => (name ? ` \`${name}\`` : '');
  const desc = {
    backend: 'API Spring Boot',
    frontend: 'application Angular',
    deploy: 'déploiement (images, manifests Kubernetes)',
  };
  return [
    {
      monorepo: '- **Monorepo** : backend Spring Boot et frontend Angular dans ce dépôt.',
      backend: '- Ce dépôt contient **uniquement le backend** Spring Boot.',
      frontend: '- Ce dépôt contient **uniquement le frontend** Angular.',
      infra: '- Dépôt **d’infra** : déploiement des applications, aucun code applicatif.',
    }[layout],
    ...parts
      .filter((p) => dirs[p] !== '.')
      .map((p) => `- \`${dirs[p]}/\` : ${desc[p]} (règles détaillées dans \`${dirs[p]}/CLAUDE.md\`).`),
    layout === 'backend' && `- Frontend : dépôt séparé${repo(related.frontend)}.`,
    layout === 'frontend' && `- Backend : dépôt séparé${repo(related.backend)}.`,
    layout === 'infra' && related.backend && `- Backend déployé : dépôt${repo(related.backend)}.`,
    layout === 'infra' && related.frontend && `- Frontend déployé : dépôt${repo(related.frontend)}.`,
    deployWhere === 'separate' &&
      `- Déploiement (manifests, charts, config d’environnement) : dépôt d’infra séparé${repo(related.infra)}. Ne pas créer de manifests Kubernetes ici ; signaler ce qui doit y être modifié.`,
    a.ops.ci !== 'none' && `- CI/CD : ${CI[a.ops.ci]}.`,
  ];
}

function commands(a) {
  const subs = [];
  if (a.backend) {
    const c = backendCommands(a.backend);
    subs.push({
      title: `Backend${where(a.project.dirs.backend)}`,
      lines: [
        `- Lancer : \`${c.run}\``,
        `- Tests : \`${c.test}\` (un seul test : \`${c.testOne}\`)`,
        `- Build complet + tests d’intégration : \`${c.verify}\``,
        c.format && `- Formatage / qualité : \`${c.format}\``,
      ],
    });
  }
  if (a.frontend) {
    const c = frontendCommands(a.frontend);
    subs.push({
      title: `Frontend${where(a.project.dirs.frontend)}`,
      lines: [
        `- Installer : \`${c.pm} install\``,
        `- Lancer : \`${c.start}\``,
        `- Tests : \`${c.test}\``,
        `- Build : \`${c.build}\``,
        c.lint && `- Lint : \`${c.lint}\``,
        c.e2e && `- E2E : \`${c.e2e}\``,
        c.api && `- Régénérer le client API : \`${c.api}\``,
      ],
    });
  }
  if (a.ops.compose) {
    subs.push({ title: 'Environnement local', lines: ['- Dépendances : `docker compose up -d` / `docker compose down`'] });
  }
  return subs;
}

function conventions(a) {
  const c = a.conventions;
  const ticket = c.ticketPrefix ? `${c.ticketPrefix}-123` : null;
  const branch = ticket ? `${ticket}-description-courte` : 'description-courte';
  const branching = {
    feature: `- Branches courtes depuis \`main\` : \`feature/${branch}\`, \`fix/${branch}\`. Merge via pull request.`,
    gitflow: `- Git Flow : \`develop\` comme branche d’intégration, \`feature/${branch}\`, \`release/x.y.z\`, \`hotfix/${branch}\`.`,
    trunk: '- Trunk-based : petits commits fréquents sur `main`, fonctionnalités incomplètes derrière un feature flag.',
  }[c.branching];
  return [
    `- Identifiants (classes, méthodes, variables) en ${LANG[c.codeLang]} ; commentaires et documentation en ${LANG[c.docLang]}.`,
    c.commitStyle === 'conventional'
      ? `- Commits au format Conventional Commits (\`feat:\`, \`fix:\`, \`refactor:\`, \`test:\`, \`chore:\`, \`docs:\`), message en ${LANG[c.commitLang]}${ticket ? `, référence du ticket en pied (\`Refs: ${ticket}\`)` : ''}.`
      : `- Messages de commit en ${LANG[c.commitLang]}, à l’impératif, une ligne de résumé de moins de 72 caractères${ticket ? `, avec la référence du ticket (\`${ticket}\`)` : ''}.`,
    branching,
    '- Commentaires : expliquer le *pourquoi*, pas le *quoi*. Pas de code commenté laissé en place.',
  ];
}

function workflow(a) {
  const checks = [a.backend && 'build et tests backend', a.frontend && 'tests et lint frontend'].filter(Boolean);
  return [
    checks.length && `- Une tâche n’est terminée que si ${checks.join(', ')} passent.`,
    '- Ne pas ajouter de dépendance (Maven/Gradle/npm) sans le signaler explicitement et justifier le choix.',
    '- Changements minimaux et ciblés : pas de refactoring opportuniste hors du périmètre demandé.',
  ];
}

export function rootDoc(a) {
  const forbidden = splitList(a.conventions.forbidden, ';').map((f) => `- ${f}`);
  return {
    title: a.project.name,
    intro: a.project.description || undefined,
    sections: [
      { title: 'Organisation', lines: organisation(a) },
      { title: 'Commandes', lines: [], subsections: commands(a) },
      { title: 'Conventions', lines: conventions(a) },
      { title: 'Façon de travailler', lines: workflow(a) },
      { title: 'Kubernetes : règles de sécurité', lines: clusterSafetyRules(a.ops) },
      { title: 'Interdits', lines: forbidden },
    ],
  };
}
