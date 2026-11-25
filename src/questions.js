import path from 'node:path';
import * as p from '@clack/prompts';
import { fetchVersions } from './versions.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ask(fn, opts) {
  const value = await fn(opts);
  if (p.isCancel(value)) {
    p.cancel('Generation cancelled.');
    process.exit(0);
  }
  return value;
}

const toOptions = (list) =>
  list.map((o) => (Array.isArray(o) ? { value: o[0], label: o[1], hint: o[2] } : o));

const text = (message, initialValue, extra = {}) =>
  ask(p.text, { message, initialValue: initialValue ?? '', ...extra });

const select = (message, list, initialValue) => {
  const values = toOptions(list).map((o) => o.value);
  return ask(p.select, {
    message,
    options: toOptions(list),
    initialValue: values.includes(initialValue) ? initialValue : values[0],
  });
};

const multi = (message, list, initialValues = [], required = false) => {
  const values = toOptions(list).map((o) => o.value);
  return ask(p.multiselect, {
    message,
    options: toOptions(list),
    initialValues: initialValues.filter((v) => values.includes(v)),
    required,
  });
};

const confirm = (message, initialValue = true) => ask(p.confirm, { message, initialValue });

const requiredValue = (v) => (v && v.trim() ? undefined : 'A value is required');

/** Picks from the fetched versions, with free input for existing projects. */
async function selectVersion(message, options, prevValue, defaultValue) {
  const known = options.some((o) => o.value === prevValue);
  const choice = await select(
    message,
    [...options, { value: '__other', label: 'Other version', hint: 'existing project, older version' }],
    prevValue && !known ? '__other' : (prevValue ?? defaultValue),
  );
  if (choice !== '__other') return choice;
  return text(`${message} (free input)`, known ? '' : prevValue, { validate: requiredValue });
}

const LANGS = [
  ['en', 'English'],
  ['fr', 'French'],
];

// ---------------------------------------------------------------------------
// Questionnaire sections
// ---------------------------------------------------------------------------

const PART_DIR = { backend: 'backend', frontend: 'frontend', deploy: 'deploy' };

async function askProject(prev) {
  p.log.step('Project');
  const name = await text('Project name', prev.name ?? path.basename(process.cwd()), {
    validate: requiredValue,
  });
  const description = await text('Short description (one sentence)', prev.description, {
    placeholder: 'Customer order management application',
  });
  const layout = await select(
    'Code organisation',
    [
      ['monorepo', 'Monorepo', 'frontend and backend in this repository'],
      ['backend', 'Separate repositories: this one holds the backend'],
      ['frontend', 'Separate repositories: this one holds the frontend'],
      ['infra', 'Infrastructure / deployment repository only'],
    ],
    prev.layout,
  );

  let deployWhere = 'here';
  if (layout !== 'infra') {
    deployWhere = await select(
      'Where does deployment live (images, manifests, Helm…)?',
      [
        ['here', 'In this repository'],
        ['separate', 'In a separate infrastructure repository'],
        ['none', 'No deployment yet'],
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
      : await text(`${part === 'deploy' ? 'Deployment' : part[0].toUpperCase() + part.slice(1)} directory ("." = repository root)`, prev.dirs?.[part] ?? PART_DIR[part], {
          validate: requiredValue,
        });
  }

  const repo = (message, key) => text(message, prev.related?.[key], { placeholder: 'name or URL, empty if unknown' });
  const related = {};
  if (layout === 'backend') related.frontend = await repo('Frontend repository consuming this API', 'frontend');
  if (layout === 'frontend') related.backend = await repo('Backend repository', 'backend');
  if (layout === 'infra') {
    related.backend = await repo('Deployed backend repository', 'backend');
    related.frontend = await repo('Deployed frontend repository', 'frontend');
  }
  if (deployWhere === 'separate') related.infra = await repo('Infrastructure repository', 'infra');

  return { name, description, layout, deployWhere, parts, dirs, related };
}

async function askConventions(prev) {
  p.log.step('Conventions');
  return {
    codeLang: await select('Language for identifiers (classes, variables…)', LANGS, prev.codeLang ?? 'en'),
    docLang: await select('Language for comments and documentation', LANGS, prev.docLang ?? 'en'),
    commitStyle: await select(
      'Commit message format',
      [
        ['conventional', 'Conventional Commits', 'feat: …, fix: …, chore: …'],
        ['free', 'Free-form'],
      ],
      prev.commitStyle,
    ),
    commitLang: await select('Language for commit messages', LANGS, prev.commitLang ?? 'en'),
    branching: await select(
      'Branching strategy',
      [
        ['feature', 'Short-lived branches from main', 'feature/…, fix/…'],
        ['gitflow', 'Git Flow', 'develop, release/…, hotfix/…'],
        ['trunk', 'Trunk-based', 'small commits on main, feature flags'],
      ],
      prev.branching,
    ),
    ticketPrefix: await text('Ticket prefix (empty if none)', prev.ticketPrefix, {
      placeholder: 'PROJ',
    }),
    forbidden: await text('Project-specific rules / forbidden actions (separated by ";", empty if none)', prev.forbidden, {
      placeholder: 'Never touch the legacy/ module; no new dependency without approval',
    }),
  };
}

async function askBackend(prev, project, versions) {
  p.log.step('Spring Boot backend');
  const build = await select(
    'Build tool',
    [
      ['maven', 'Maven'],
      ['gradle', 'Gradle (Kotlin DSL)'],
    ],
    prev.build,
  );
  const springBoot = await selectVersion('Spring Boot version', versions.boot, prev.springBoot, versions.bootDefault);
  const java = await selectVersion('Java version', versions.java, prev.java, versions.javaDefault);
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const basePackage = await text('Base package', prev.basePackage ?? `com.example.${slug || 'app'}`, {
    validate: requiredValue,
  });
  const architecture = await select(
    'Architecture',
    [
      ['layered', 'Layered', 'web → service → repository'],
      ['feature', 'Package by feature', 'one package per business domain'],
      ['hexagonal', 'Hexagonal', 'domain / application / infrastructure'],
    ],
    prev.architecture,
  );
  const database = await select(
    'Database',
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
    'Data access',
    [
      ['jpa', 'Spring Data JPA (Hibernate)'],
      ['jdbc', 'Spring Data JDBC / JdbcClient'],
      ['jooq', 'jOOQ'],
    ],
    prev.persistence,
  );
  const migration = await select(
    'Schema migration tool',
    [
      ['flyway', 'Flyway'],
      ['liquibase', 'Liquibase'],
      ['none', 'None'],
    ],
    prev.migration,
  );

  let liquibaseFormat;
  let migrationNaming;
  if (migration === 'liquibase') {
    liquibaseFormat = await select(
      'Liquibase changelog format',
      [
        ['yaml', 'YAML'],
        ['xml', 'XML'],
        ['sql', 'Formatted SQL', '--liquibase formatted sql'],
      ],
      prev.liquibaseFormat,
    );
  }
  if (migration !== 'none') {
    migrationNaming = await select(
      'Migration naming',
      [
        ['timestamp', 'Timestamp', 'avoids number clashes between branches'],
        ['sequence', 'Sequential number', '1, 2, 3…'],
      ],
      prev.migrationNaming,
    );
  }

  const libs = await multi(
    'Libraries',
    [
      ['lombok', 'Lombok'],
      ['mapstruct', 'MapStruct'],
      ['springdoc', 'springdoc-openapi', 'Swagger UI + OpenAPI spec'],
      ['security', 'Spring Security'],
      ['testcontainers', 'Testcontainers'],
      ['archunit', 'ArchUnit', 'architecture rule tests'],
    ],
    prev.libs ?? ['mapstruct', 'springdoc', 'security', 'testcontainers'],
  );
  const formatter = await select(
    'Formatting / code quality',
    [
      ['spotless', 'Spotless'],
      ['checkstyle', 'Checkstyle'],
      ['none', 'None'],
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

async function askFrontend(prev, backend, project, versions) {
  p.log.step('Angular frontend');
  const angular = versions.angular.length
    ? await selectVersion('Angular version', versions.angular, prev.angular, versions.angularDefault)
    : await text('Angular major version', prev.angular ?? '', { validate: requiredValue });
  const packageManager = await select(
    'Package manager',
    [
      ['npm', 'npm'],
      ['pnpm', 'pnpm'],
      ['yarn', 'yarn'],
    ],
    prev.packageManager,
  );
  const state = await select(
    'State management',
    [
      ['signals', 'Signals + services', 'no library'],
      ['signalstore', 'NgRx SignalStore'],
      ['ngrx', 'NgRx Store', 'actions / reducers / effects'],
    ],
    prev.state,
  );
  const ui = await multi(
    'UI libraries',
    [
      ['material', 'Angular Material'],
      ['primeng', 'PrimeNG'],
      ['tailwind', 'Tailwind CSS'],
    ],
    prev.ui ?? ['material'],
  );
  const unitTests = await select(
    'Unit tests',
    [
      ['vitest', 'Vitest'],
      ['jest', 'Jest'],
      ['karma', 'Karma + Jasmine'],
    ],
    prev.unitTests,
  );
  const e2e = await select(
    'End-to-end tests',
    [
      ['playwright', 'Playwright'],
      ['cypress', 'Cypress'],
      ['none', 'None'],
    ],
    prev.e2e,
  );

  // Generated client: possible when the monorepo backend publishes an OpenAPI spec,
  // or when the backend lives in another repository (unknown, so we ask).
  let apiClient = 'manual';
  let apiDir;
  let apiScript;
  let apiSpec;
  const canGenerate = backend ? backend.libs.includes('springdoc') : project.layout === 'frontend';
  if (canGenerate) {
    apiClient = await select(
      'HTTP client for the backend',
      [
        ['generated', 'Generated from the backend OpenAPI spec', 'openapi-generator, orval…'],
        ['manual', 'Hand-written'],
      ],
      prev.apiClient ?? 'generated',
    );
    if (apiClient === 'generated') {
      if (!backend) {
        apiSpec = await text('OpenAPI spec source', prev.apiSpec ?? 'http://localhost:8080/v3/api-docs', {
          validate: requiredValue,
        });
      }
      apiDir = await text('Generated client directory', prev.apiDir ?? 'src/app/api', { validate: requiredValue });
      apiScript = await text('npm script that generates it', prev.apiScript ?? 'generate:api', {
        validate: requiredValue,
      });
    }
  }
  const lint = await confirm('ESLint (angular-eslint) + Prettier?', prev.lint ?? true);

  return { angular, packageManager, state, ui, unitTests, e2e, apiClient, apiSpec, apiDir, apiScript, lint };
}

/** Operations: relevant to every repository (even without infra here, the app runs somewhere). */
async function askOps(prev, project, backend) {
  p.log.step('Environments and operations');
  const hasBackend = Boolean(backend);
  const hasDeploy = project.parts.includes('deploy');

  const compose = await confirm('docker compose for local development (database, Redis…)?', prev.compose ?? (hasBackend || hasDeploy));
  const ci = await select(
    'CI/CD',
    [
      ['github', 'GitHub Actions'],
      ['gitlab', 'GitLab CI'],
      ['jenkins', 'Jenkins'],
      ['azure', 'Azure DevOps'],
      ['none', 'None'],
    ],
    prev.ci,
  );
  const orchestrator = await select(
    'Where does the application run?',
    [
      ['kubernetes', 'Kubernetes'],
      ['openshift', 'OpenShift'],
      ['none', 'Elsewhere / not decided yet'],
    ],
    prev.orchestrator,
  );

  const k8s = {};
  if (orchestrator !== 'none') {
    k8s.nonProdContexts = await text(
      'Non-production kube context(s), read access for Claude (comma-separated)',
      prev.nonProdContexts ?? 'dev,staging',
      { validate: requiredValue },
    );
    k8s.prodContexts = await text(
      'Production kube context(s), forbidden to Claude (comma-separated)',
      prev.prodContexts ?? 'prod',
      { validate: requiredValue },
    );
    k8s.namespace = await text('Application namespace', prev.namespace ?? project.name.toLowerCase(), {
      validate: requiredValue,
    });
    k8s.gitops = await select(
      'GitOps',
      [
        ['argocd', 'Argo CD'],
        ['flux', 'Flux'],
        ['none', 'None', 'deployed by CI'],
      ],
      prev.gitops,
    );
  }

  let observability = [];
  if (hasBackend || hasDeploy) {
    observability = await multi(
      'Observability',
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
    ha = await confirm('High availability (several replicas)?', prev.ha ?? true);
  }
  if (ha && hasBackend) {
    haApp.sessions = await select(
      'User sessions',
      [
        ['stateless', 'Stateless', 'JWT / OAuth2'],
        ['redis', 'Spring Session + Redis'],
        ['sticky', 'Sticky sessions', 'not recommended'],
      ],
      prev.sessions,
    );
    haApp.scheduling = await select(
      'Scheduled tasks',
      [
        ['shedlock', 'ShedLock', 'distributed lock on @Scheduled'],
        ['quartz', 'Clustered Quartz'],
        ['none', 'No scheduled tasks'],
      ],
      prev.scheduling,
    );
    if (backend.migration !== 'none') {
      const tool = backend.migration === 'flyway' ? 'Flyway' : 'Liquibase';
      haApp.migrationRun = await select(
        `With several replicas, what runs the ${tool} database migrations on deployment?`,
        [
          ['job', 'A Kubernetes Job, once, before the rollout', 'recommended · Helm pre-upgrade hook / Argo CD PreSync'],
          ['init', 'An initContainer in each pod'],
          ['startup', 'The application itself on startup', 'Spring Boot default'],
        ],
        prev.migrationRun,
      );
    }
  }

  return { compose, ci, orchestrator, ...k8s, observability, ha, ...haApp };
}

/** Infrastructure: only when deployment lives in this repository. */
async function askDeploy(prev, project, backend, ops) {
  p.log.step('Deployment (in this repository)');
  const k8s = ops.orchestrator !== 'none';
  const result = {};

  if (project.layout !== 'infra') {
    result.container = await select(
      'Image build',
      [
        ['dockerfile', 'Multi-stage Dockerfile'],
        ...(backend
          ? [
              ['jib', 'Jib', 'no Dockerfile'],
              ['buildpacks', 'Buildpacks', 'spring-boot:build-image'],
            ]
          : []),
      ],
      prev.container,
    );
  }
  if (k8s) {
    result.packaging = await select(
      'Manifest packaging',
      [
        ['helm', 'Helm'],
        ['kustomize', 'Kustomize'],
        ['raw', 'Plain YAML manifests'],
      ],
      prev.packaging,
    );
    result.localCluster = await select(
      'Local cluster',
      [
        ['kind', 'kind'],
        ['k3d', 'k3d'],
        ['minikube', 'minikube'],
        ['none', 'None'],
      ],
      prev.localCluster,
    );
  }
  result.secrets = await select(
    'Secret management',
    [
      ['vault', 'HashiCorp Vault'],
      ['external-secrets', 'External Secrets Operator'],
      ['sealed', 'Sealed Secrets'],
      ['k8s', 'Native Kubernetes Secrets'],
      ['none', 'Not defined'],
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
    result.replicas = await text('Minimum number of replicas in production', prev.replicas ?? '2', {
      validate: (v) => (/^\d+$/.test(v ?? '') && Number(v) >= 2 ? undefined : 'An integer ≥ 2 is expected'),
    });
    result.hpa = await confirm('HorizontalPodAutoscaler?', prev.hpa ?? true);
    result.pdb = await confirm('PodDisruptionBudget?', prev.pdb ?? true);
    const postgresPossible = !backend || backend.database === 'postgresql';
    result.dbHa = await select(
      'Database high availability',
      [
        ['managed', 'Managed database', 'RDS, Cloud SQL, Azure…'],
        ...(postgresPossible
          ? [
              ['cnpg', 'CloudNativePG', 'PostgreSQL'],
              ['patroni', 'Patroni', 'PostgreSQL'],
            ]
          : []),
        ['none', 'Single instance'],
      ],
      prev.dbHa,
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function askAll(prev = {}) {
  const project = await askProject(prev.project ?? {});
  const conventions = await askConventions(prev.conventions ?? {});
  const has = (part) => project.parts.includes(part);

  let versions;
  if (has('backend') || has('frontend')) {
    const spin = p.spinner();
    spin.start('Fetching the latest versions (Spring Initializr, npm)');
    versions = await fetchVersions({ spring: has('backend'), angular: has('frontend') });
    spin.stop(versions.online ? 'Latest versions fetched' : 'Offline: using default version lists');
  }

  const backend = has('backend') ? await askBackend(prev.backend ?? {}, project, versions) : undefined;
  const frontend = has('frontend') ? await askFrontend(prev.frontend ?? {}, backend, project, versions) : undefined;
  const ops = await askOps(prev.ops ?? {}, project, backend);
  const deploy = has('deploy') ? await askDeploy(prev.deploy ?? {}, project, backend, ops) : undefined;

  p.log.step('Generated files');
  const output = {
    settings: await confirm('Generate .claude/settings.json (permissions and guardrails)?', prev.output?.settings ?? true),
    bootstrap: project.parts.length
      ? await confirm('Generate the /bootstrap command (scaffolding via Spring Initializr / Angular CLI)?', prev.output?.bootstrap ?? true)
      : false,
  };

  return { project, conventions, backend, frontend, ops, deploy, output };
}
