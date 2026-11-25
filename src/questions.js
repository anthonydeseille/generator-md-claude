import path from 'node:path';
import * as p from '@clack/prompts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ask(fn, opts) {
  const value = await fn(opts);
  if (p.isCancel(value)) {
    p.cancel('Génération annulée.');
    process.exit(0);
  }
  return value;
}

const toOptions = (list) => list.map(([value, label, hint]) => ({ value, label, hint }));

const text = (message, initialValue, extra = {}) =>
  ask(p.text, { message, initialValue: initialValue ?? '', ...extra });

const select = (message, list, initialValue) => {
  const values = list.map(([v]) => v);
  return ask(p.select, {
    message,
    options: toOptions(list),
    initialValue: values.includes(initialValue) ? initialValue : values[0],
  });
};

const multi = (message, list, initialValues = [], required = false) => {
  const values = list.map(([v]) => v);
  return ask(p.multiselect, {
    message,
    options: toOptions(list),
    initialValues: initialValues.filter((v) => values.includes(v)),
    required,
  });
};

const confirm = (message, initialValue = true) => ask(p.confirm, { message, initialValue });

const requiredValue = (v) => (v && v.trim() ? undefined : 'Valeur requise');

const LANGS = [
  ['fr', 'Français'],
  ['en', 'Anglais'],
];

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const PART_DIR = { backend: 'backend', frontend: 'frontend', deploy: 'deploy' };

async function askProject(prev) {
  p.log.step('Projet');
  const name = await text('Nom du projet', prev.name ?? path.basename(process.cwd()), {
    validate: requiredValue,
  });
  const description = await text('Description courte (une phrase)', prev.description, {
    placeholder: 'Application de gestion des commandes clients',
  });
  const layout = await select(
    'Organisation du code',
    [
      ['monorepo', 'Monorepo', 'front et back dans ce dépôt'],
      ['backend', 'Dépôts séparés : ce dépôt contient le backend'],
      ['frontend', 'Dépôts séparés : ce dépôt contient le frontend'],
      ['infra', 'Dépôt d’infra / déploiement seul'],
    ],
    prev.layout,
  );

  let deployWhere = 'here';
  if (layout !== 'infra') {
    deployWhere = await select(
      'Où se trouve le déploiement (images, manifests, Helm…) ?',
      [
        ['here', 'Dans ce dépôt'],
        ['separate', 'Dans un dépôt d’infra séparé'],
        ['none', 'Pas encore de déploiement'],
      ],
      prev.deployWhere,
    );
  }

  const parts = layout === 'monorepo' ? ['backend', 'frontend'] : layout === 'infra' ? [] : [layout];
  if (deployWhere === 'here') parts.push('deploy');

  const dirs = {};
  for (const part of parts) {
    const forcedRoot = layout === part || (layout === 'infra' && part === 'deploy');
    dirs[part] = forcedRoot
      ? '.'
      : await text(`Dossier ${part === 'deploy' ? 'du déploiement' : `du ${part}`} ("." = racine du dépôt)`, prev.dirs?.[part] ?? PART_DIR[part], {
          validate: requiredValue,
        });
  }

  const repo = (message, key) =>
    text(message, prev.related?.[key], { placeholder: 'nom ou URL, vide si inconnu' });
  const related = {};
  if (layout === 'backend') related.frontend = await repo('Dépôt du frontend qui consomme cette API', 'frontend');
  if (layout === 'frontend') related.backend = await repo('Dépôt du backend', 'backend');
  if (layout === 'infra') {
    related.backend = await repo('Dépôt du backend déployé', 'backend');
    related.frontend = await repo('Dépôt du frontend déployé', 'frontend');
  }
  if (deployWhere === 'separate') related.infra = await repo('Dépôt d’infra', 'infra');

  return { name, description, layout, deployWhere, parts, dirs, related };
}

async function askConventions(prev) {
  p.log.step('Conventions');
  return {
    codeLang: await select('Langue des identifiants (classes, variables…)', LANGS, prev.codeLang ?? 'en'),
    docLang: await select('Langue des commentaires et de la documentation', LANGS, prev.docLang ?? 'fr'),
    commitStyle: await select(
      'Format des messages de commit',
      [
        ['conventional', 'Conventional Commits', 'feat: …, fix: …, chore: …'],
        ['free', 'Libre'],
      ],
      prev.commitStyle,
    ),
    commitLang: await select('Langue des messages de commit', LANGS, prev.commitLang ?? 'fr'),
    branching: await select(
      'Stratégie de branches',
      [
        ['feature', 'Branches courtes depuis main', 'feature/…, fix/…'],
        ['gitflow', 'Git Flow', 'develop, release/…, hotfix/…'],
        ['trunk', 'Trunk-based', 'petits commits sur main, feature flags'],
      ],
      prev.branching,
    ),
    ticketPrefix: await text('Préfixe des tickets (vide si aucun)', prev.ticketPrefix, {
      placeholder: 'PROJ',
    }),
    forbidden: await text('Interdits spécifiques au projet (séparés par ";", vide si aucun)', prev.forbidden, {
      placeholder: 'Ne jamais toucher au module legacy/ ; pas de nouvelle dépendance sans validation',
    }),
  };
}

async function askBackend(prev, project) {
  p.log.step('Backend Spring Boot');
  const build = await select(
    'Outil de build',
    [
      ['maven', 'Maven'],
      ['gradle', 'Gradle (Kotlin DSL)'],
    ],
    prev.build,
  );
  const java = await select(
    'Version de Java',
    [
      ['25', 'Java 25 (LTS)'],
      ['21', 'Java 21 (LTS)'],
      ['17', 'Java 17 (LTS)'],
    ],
    prev.java ?? '21',
  );
  const springBoot = await select(
    'Version de Spring Boot',
    [
      ['4', 'Spring Boot 4.x'],
      ['3', 'Spring Boot 3.x'],
    ],
    prev.springBoot,
  );
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const basePackage = await text('Package racine', prev.basePackage ?? `com.example.${slug || 'app'}`, {
    validate: requiredValue,
  });
  const architecture = await select(
    'Architecture',
    [
      ['layered', 'En couches', 'web → service → repository'],
      ['feature', 'Par fonctionnalité', 'un package par domaine métier'],
      ['hexagonal', 'Hexagonale', 'domain / application / infrastructure'],
    ],
    prev.architecture,
  );
  const database = await select(
    'Base de données',
    [
      ['postgresql', 'PostgreSQL'],
      ['mysql', 'MySQL'],
      ['mariadb', 'MariaDB'],
      ['oracle', 'Oracle'],
      ['sqlserver', 'SQL Server'],
    ],
    prev.database,
  );
  const persistence = await select(
    'Accès aux données',
    [
      ['jpa', 'Spring Data JPA (Hibernate)'],
      ['jdbc', 'Spring Data JDBC / JdbcClient'],
      ['jooq', 'jOOQ'],
    ],
    prev.persistence,
  );
  const migration = await select(
    'Outil de migration de schéma',
    [
      ['flyway', 'Flyway'],
      ['liquibase', 'Liquibase'],
      ['none', 'Aucun'],
    ],
    prev.migration,
  );

  let liquibaseFormat;
  let migrationNaming;
  if (migration === 'liquibase') {
    liquibaseFormat = await select(
      'Format des changelogs Liquibase',
      [
        ['yaml', 'YAML'],
        ['xml', 'XML'],
        ['sql', 'SQL formaté', '--liquibase formatted sql'],
      ],
      prev.liquibaseFormat,
    );
  }
  if (migration !== 'none') {
    migrationNaming = await select(
      'Nommage des migrations',
      [
        ['timestamp', 'Horodatage', 'évite les conflits de numéros entre branches'],
        ['sequence', 'Numéro séquentiel', '1, 2, 3…'],
      ],
      prev.migrationNaming,
    );
  }

  const libs = await multi(
    'Bibliothèques utilisées',
    [
      ['lombok', 'Lombok'],
      ['mapstruct', 'MapStruct'],
      ['springdoc', 'springdoc-openapi', 'Swagger UI + spec OpenAPI'],
      ['security', 'Spring Security'],
      ['testcontainers', 'Testcontainers'],
      ['archunit', 'ArchUnit', 'tests des règles d’architecture'],
    ],
    prev.libs ?? ['mapstruct', 'springdoc', 'security', 'testcontainers'],
  );
  const formatter = await select(
    'Formatage / qualité du code',
    [
      ['spotless', 'Spotless'],
      ['checkstyle', 'Checkstyle'],
      ['none', 'Aucun'],
    ],
    prev.formatter,
  );

  return {
    build,
    java,
    springBoot,
    basePackage,
    architecture,
    database,
    persistence,
    migration,
    liquibaseFormat,
    migrationNaming,
    libs,
    formatter,
  };
}

async function askFrontend(prev, backend, project) {
  p.log.step('Frontend Angular');
  const angular = await text("Version majeure d'Angular", prev.angular ?? '21', { validate: requiredValue });
  const packageManager = await select(
    'Gestionnaire de paquets',
    [
      ['npm', 'npm'],
      ['pnpm', 'pnpm'],
      ['yarn', 'yarn'],
    ],
    prev.packageManager,
  );
  const state = await select(
    "Gestion de l'état",
    [
      ['signals', 'Signals + services', 'sans bibliothèque'],
      ['signalstore', 'NgRx SignalStore'],
      ['ngrx', 'NgRx Store', 'actions / reducers / effects'],
    ],
    prev.state,
  );
  const ui = await multi(
    'Bibliothèques UI',
    [
      ['material', 'Angular Material'],
      ['primeng', 'PrimeNG'],
      ['tailwind', 'Tailwind CSS'],
    ],
    prev.ui ?? ['material'],
  );
  const unitTests = await select(
    'Tests unitaires',
    [
      ['vitest', 'Vitest'],
      ['jest', 'Jest'],
      ['karma', 'Karma + Jasmine'],
    ],
    prev.unitTests,
  );
  const e2e = await select(
    'Tests end-to-end',
    [
      ['playwright', 'Playwright'],
      ['cypress', 'Cypress'],
      ['none', 'Aucun'],
    ],
    prev.e2e,
  );

  // Client généré : possible si le backend du monorepo publie une spec OpenAPI,
  // ou si le backend est dans un autre dépôt (on ne sait pas, on demande).
  let apiClient = 'manual';
  let apiDir;
  let apiScript;
  let apiSpec;
  const canGenerate = backend ? backend.libs.includes('springdoc') : project.layout === 'frontend';
  if (canGenerate) {
    apiClient = await select(
      'Client HTTP vers le backend',
      [
        ['generated', "Généré depuis la spec OpenAPI du backend", 'openapi-generator, orval…'],
        ['manual', 'Écrit à la main'],
      ],
      prev.apiClient ?? 'generated',
    );
    if (apiClient === 'generated') {
      if (!backend) {
        apiSpec = await text('Source de la spec OpenAPI', prev.apiSpec ?? 'http://localhost:8080/v3/api-docs', {
          validate: requiredValue,
        });
      }
      apiDir = await text('Dossier du client généré', prev.apiDir ?? 'src/app/api', { validate: requiredValue });
      apiScript = await text('Script npm de génération', prev.apiScript ?? 'generate:api', {
        validate: requiredValue,
      });
    }
  }
  const lint = await confirm('ESLint (angular-eslint) + Prettier ?', prev.lint ?? true);

  return { angular, packageManager, state, ui, unitTests, e2e, apiClient, apiSpec, apiDir, apiScript, lint };
}

/** Exploitation : utile à tous les dépôts (même sans infra ici, l'app tourne quelque part). */
async function askOps(prev, project, backend) {
  p.log.step('Environnements et exploitation');
  const hasBackend = Boolean(backend);
  const hasDeploy = project.parts.includes('deploy');

  const compose = await confirm('docker compose pour le dev local (BDD, Redis…) ?', prev.compose ?? (hasBackend || hasDeploy));
  const ci = await select(
    'CI/CD',
    [
      ['github', 'GitHub Actions'],
      ['gitlab', 'GitLab CI'],
      ['jenkins', 'Jenkins'],
      ['azure', 'Azure DevOps'],
      ['none', 'Aucune'],
    ],
    prev.ci,
  );
  const orchestrator = await select(
    'Où tourne l’application ?',
    [
      ['kubernetes', 'Kubernetes'],
      ['openshift', 'OpenShift'],
      ['none', 'Ailleurs / pas encore défini'],
    ],
    prev.orchestrator,
  );

  const k8s = {};
  if (orchestrator !== 'none') {
    k8s.nonProdContexts = await text(
      'Contexte(s) kube hors production, en lecture pour Claude (séparés par des virgules)',
      prev.nonProdContexts ?? 'dev,staging',
      { validate: requiredValue },
    );
    k8s.prodContexts = await text(
      'Contexte(s) kube de production, interdits à Claude (séparés par des virgules)',
      prev.prodContexts ?? 'prod',
      { validate: requiredValue },
    );
    k8s.namespace = await text('Namespace applicatif', prev.namespace ?? project.name.toLowerCase(), {
      validate: requiredValue,
    });
    k8s.gitops = await select(
      'GitOps',
      [
        ['argocd', 'Argo CD'],
        ['flux', 'Flux'],
        ['none', 'Aucun', 'déploiement par la CI'],
      ],
      prev.gitops,
    );
  }

  let observability = [];
  if (hasBackend || hasDeploy) {
    observability = await multi(
      'Observabilité',
      [
        ['prometheus', 'Prometheus / Micrometer'],
        ['grafana', 'Grafana'],
        ['loki', 'Loki'],
        ['elk', 'ELK / OpenSearch'],
        ['otel', 'OpenTelemetry (traces)'],
      ],
      prev.observability ?? ['prometheus', 'grafana'],
    );
  }

  let ha = false;
  const haApp = {};
  if (orchestrator !== 'none' && (hasBackend || hasDeploy)) {
    ha = await confirm('Haute disponibilité (plusieurs replicas) ?', prev.ha ?? true);
  }
  if (ha && hasBackend) {
    haApp.sessions = await select(
      'Sessions utilisateur',
      [
        ['stateless', 'Sans état', 'JWT / OAuth2'],
        ['redis', 'Spring Session + Redis'],
        ['sticky', 'Sticky sessions', 'déconseillé'],
      ],
      prev.sessions,
    );
    haApp.scheduling = await select(
      'Tâches planifiées',
      [
        ['shedlock', 'ShedLock', 'verrou distribué sur @Scheduled'],
        ['quartz', 'Quartz en cluster'],
        ['none', 'Aucune tâche planifiée'],
      ],
      prev.scheduling,
    );
    if (backend.migration !== 'none') {
      haApp.migrationRun = await select(
        'Exécution des migrations en déploiement',
        [
          ['job', 'Job dédié', 'hook Helm pre-upgrade / Argo CD PreSync'],
          ['init', 'initContainer'],
          ['startup', "Au démarrage de l'application"],
        ],
        prev.migrationRun,
      );
    }
  }

  return { compose, ci, orchestrator, ...k8s, observability, ha, ...haApp };
}

/** Infra : uniquement si le déploiement est dans ce dépôt. */
async function askDeploy(prev, project, backend, ops) {
  p.log.step('Déploiement (dans ce dépôt)');
  const k8s = ops.orchestrator !== 'none';
  const result = {};

  if (project.layout !== 'infra') {
    result.container = await select(
      'Construction des images',
      [
        ['dockerfile', 'Dockerfile multi-stage'],
        ...(backend
          ? [
              ['jib', 'Jib', 'sans Dockerfile'],
              ['buildpacks', 'Buildpacks', 'spring-boot:build-image'],
            ]
          : []),
      ],
      prev.container,
    );
  }
  if (k8s) {
    result.packaging = await select(
      'Packaging des manifests',
      [
        ['helm', 'Helm'],
        ['kustomize', 'Kustomize'],
        ['raw', 'Manifests YAML bruts'],
      ],
      prev.packaging,
    );
    result.localCluster = await select(
      'Cluster local',
      [
        ['kind', 'kind'],
        ['k3d', 'k3d'],
        ['minikube', 'minikube'],
        ['none', 'Aucun'],
      ],
      prev.localCluster,
    );
  }
  result.secrets = await select(
    'Gestion des secrets',
    [
      ['vault', 'HashiCorp Vault'],
      ['external-secrets', 'External Secrets Operator'],
      ['sealed', 'Sealed Secrets'],
      ['k8s', 'Secrets Kubernetes natifs'],
      ['none', 'Non défini'],
    ],
    prev.secrets,
  );
  result.iac = await multi(
    'Infrastructure as Code',
    [
      ['terraform', 'Terraform'],
      ['opentofu', 'OpenTofu'],
      ['ansible', 'Ansible'],
    ],
    prev.iac ?? [],
  );

  if (ops.ha) {
    result.replicas = await text('Nombre minimal de replicas en production', prev.replicas ?? '2', {
      validate: (v) => (/^\d+$/.test(v ?? '') && Number(v) >= 2 ? undefined : 'Entier ≥ 2 attendu'),
    });
    result.hpa = await confirm('HorizontalPodAutoscaler ?', prev.hpa ?? true);
    result.pdb = await confirm('PodDisruptionBudget ?', prev.pdb ?? true);
    const postgresPossible = !backend || backend.database === 'postgresql';
    result.dbHa = await select(
      'Haute disponibilité de la base',
      [
        ['managed', 'Base managée', 'RDS, Cloud SQL, Azure…'],
        ...(postgresPossible
          ? [
              ['cnpg', 'CloudNativePG', 'PostgreSQL'],
              ['patroni', 'Patroni', 'PostgreSQL'],
            ]
          : []),
        ['none', 'Instance unique'],
      ],
      prev.dbHa,
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// Entrée
// ---------------------------------------------------------------------------

export async function askAll(prev = {}) {
  const project = await askProject(prev.project ?? {});
  const conventions = await askConventions(prev.conventions ?? {});
  const has = (part) => project.parts.includes(part);
  const backend = has('backend') ? await askBackend(prev.backend ?? {}, project) : undefined;
  const frontend = has('frontend') ? await askFrontend(prev.frontend ?? {}, backend, project) : undefined;
  const ops = await askOps(prev.ops ?? {}, project, backend);
  const deploy = has('deploy') ? await askDeploy(prev.deploy ?? {}, project, backend, ops) : undefined;

  p.log.step('Fichiers générés');
  const output = {
    settings: await confirm('Générer .claude/settings.json (permissions et garde-fous) ?', prev.output?.settings ?? true),
  };

  return { project, conventions, backend, frontend, ops, deploy, output };
}
