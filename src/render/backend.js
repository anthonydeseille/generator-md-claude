const DB = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  oracle: 'Oracle',
  sqlserver: 'SQL Server',
};
const PERSISTENCE = { jpa: 'Spring Data JPA (Hibernate)', jdbc: 'Spring Data JDBC / JdbcClient', jooq: 'jOOQ' };
const LIBS = {
  lombok: 'Lombok',
  mapstruct: 'MapStruct',
  springdoc: 'springdoc-openapi',
  security: 'Spring Security',
  testcontainers: 'Testcontainers',
  archunit: 'ArchUnit',
};

function architecture(b) {
  const pkg = b.basePackage;
  const common = [
    `- Base package: \`${pkg}\`.`,
    b.libs.includes('archunit') && '- These rules are enforced by ArchUnit tests: never bypass or disable them.',
  ];
  switch (b.architecture) {
    case 'hexagonal':
      return [
        common[0],
        `- \`${pkg}.domain\`: pure business model, **no Spring or ${b.persistence === 'jpa' ? 'JPA' : 'persistence'} dependency**.`,
        `- \`${pkg}.application\`: use cases and inbound/outbound ports (interfaces).`,
        `- \`${pkg}.infrastructure\`: adapters (REST, persistence, messaging) implementing the ports.`,
        '- Dependencies always point towards `domain`, never the other way around.',
        common[1],
      ];
    case 'feature':
      return [
        common[0],
        `- One package per business domain (\`${pkg}.order\`, \`${pkg}.customer\`…), holding its controller, service, repository and DTOs.`,
        '- A domain never accesses another domain’s repository: it goes through that domain’s public service.',
        '- Cross-cutting code (config, security, error handling) lives in `common` / `config`.',
        common[1],
      ];
    default:
      return [
        common[0],
        '- Layers: `web` (controllers, DTOs) → `service` (business logic) → `repository`.',
        '- A controller never calls a repository directly.',
        common[1],
      ];
  }
}

function codeRules(b, a) {
  const jpa = b.persistence === 'jpa';
  const has = (l) => b.libs.includes(l);
  const generatedClient = a.frontend?.apiClient === 'generated';
  return [
    '- Constructor injection only (no `@Autowired` on fields).',
    `- DTOs are Java \`record\`s; ${jpa ? 'JPA ' : ''}entities are never exposed by the REST API.`,
    '- `@Transactional` on services, never on controllers.',
    '- Centralised error handling (`@RestControllerAdvice`), responses as `ProblemDetail` (RFC 9457).',
    '- Configuration in `application.yml` + profiles (`application-<profile>.yml`); no plain-text secret in the repository.',
    has('lombok') &&
      (jpa
        ? '- Lombok: `@Getter`, `@Setter`, `@Builder`, `@RequiredArgsConstructor` allowed; **no `@Data` or `@EqualsAndHashCode` on JPA entities**.'
        : '- Lombok allowed, but prefer `record`s whenever possible.'),
    has('mapstruct') &&
      '- Entity ↔ DTO conversions through MapStruct mappers (`componentModel = "spring"`), no manual mapping in services.',
    has('springdoc') &&
      `- Every endpoint is documented (\`@Operation\`, \`@ApiResponse\`)${generatedClient ? ': the OpenAPI spec is used to generate the Angular client, so every API change must be reflected in it' : ''}.`,
    has('security') && '- Spring Security: every endpoint is authenticated by default; each `permitAll()` must be justified.',
    jpa && '- `spring.jpa.open-in-view=false`; watch out for N+1 queries (`@EntityGraph` or `JOIN FETCH`).',
    jpa &&
      b.migration !== 'none' &&
      `- \`spring.jpa.hibernate.ddl-auto=validate\`: the schema is managed by ${b.migration === 'flyway' ? 'Flyway' : 'Liquibase'} only.`,
  ];
}

function migrations(b, a) {
  if (b.migration === 'none') return [];
  const ts = b.migrationNaming === 'timestamp';
  const d = a.ops ?? {};
  let lines;

  if (b.migration === 'flyway') {
    lines = [
      '- SQL scripts in `src/main/resources/db/migration/`.',
      ts
        ? '- Naming: `V<yyyyMMddHHmm>__<snake_case_description>.sql` (e.g. `V202611251430__create_order_table.sql`).'
        : '- Naming: `V<n>__<snake_case_description>.sql`; check the latest existing number before creating one.',
    ];
  } else {
    const ext = b.liquibaseFormat === 'xml' ? 'xml' : b.liquibaseFormat === 'sql' ? 'sql' : 'yaml';
    const masterExt = ext === 'xml' ? 'xml' : 'yaml';
    lines = [
      `- Master changelog: \`src/main/resources/db/changelog/db.changelog-master.${masterExt}\`, which includes the files in \`db/changelog/changes/\`.`,
      ts
        ? `- One file per change: \`changes/<yyyyMMddHHmm>-<description>.${ext}\`.`
        : `- One file per change: \`changes/<nnn>-<description>.${ext}\`; check the latest existing number.`,
      '- Each changeset has a unique `id` (reuse the file name) and an `author`.',
      ext === 'sql' && '- SQL format: `--liquibase formatted sql` header, then `--changeset <author>:<id>` before each changeset.',
      '- Provide a `rollback` whenever Liquibase cannot infer it (raw SQL, data updates).',
    ];
  }

  lines.push(
    '- **Never modify a migration that has already been merged** (its checksum would break every environment): every fix goes into a new migration.',
    '- One migration = one consistent change; large data backfills are done in batches.',
  );

  if (d.ha) {
    lines.push(
      '- **Rolling updates**: the old and new versions of the application run at the same time on the same schema. Every migration must stay compatible with the previous version:',
      '  - adding a column: nullable or with a default value;',
      '  - renaming or changing a type: *expand/contract* (add the new column, migrate the data, switch the code, drop the old column in a later release);',
      '  - dropping a column or table: only once no deployed version uses it any more.',
    );
    const tool = b.migration;
    if (d.migrationRun === 'job' || d.migrationRun === 'init') {
      lines.push(
        `- In deployed environments, migrations are run by ${d.migrationRun === 'job' ? 'a dedicated Job (before the rollout)' : 'an initContainer'}, not on every pod startup (\`spring.${tool}.enabled=false\` in the matching profile).`,
      );
    } else if (d.migrationRun === 'startup') {
      lines.push(
        `- Migrations run on startup; the ${tool === 'flyway' ? 'Flyway' : 'Liquibase'} lock serialises pods, but a long migration blocks readiness: keep them short.`,
      );
    }
  }
  return lines;
}

function apiContract(b, a) {
  const { layout, related } = a.project;
  const spec = b.libs.includes('springdoc') ? ' The OpenAPI spec (`/v3/api-docs`) is the source of truth.' : '';
  if (layout === 'monorepo' && a.frontend) {
    return [
      `- The frontend in this repository consumes this API: a contract change goes in the same PR as the frontend update${a.frontend.apiClient === 'generated' ? ' (regenerated client)' : ''}.${spec}`,
    ];
  }
  if (layout === 'backend') {
    return [
      `- This API is consumed by ${related.frontend ? `the \`${related.frontend}\` frontend` : 'a frontend'}, **in a separate repository**: it is not updated at the same time.${spec}`,
      '- Any contract change (removed or renamed field, changed type, removed endpoint) is **breaking**: stay backward compatible (additions only) or version the API (`/api/v2/…`).',
      '- Explicitly call out any change visible to the frontend in the task summary.',
    ];
  }
  return [];
}

function tests(b) {
  const has = (l) => b.libs.includes(l);
  return [
    '- JUnit 5 + AssertJ + Mockito.',
    '- Naming: `<Class>Test` for unit tests, `<Class>IT` for integration tests.',
    `- Test slices: \`@WebMvcTest\` for controllers${b.persistence === 'jpa' ? ', `@DataJpaTest` for repositories' : ''}.`,
    has('testcontainers') &&
      `- Integration tests run against a real ${DB[b.database]} through Testcontainers (\`@ServiceConnection\`); **no H2**.`,
    '- Every feature or bug fix comes with tests.',
  ];
}

function runtime(b, a) {
  const d = a.ops;
  if (!d || d.orchestrator === 'none') return [];
  const obs = d.observability ?? [];
  return [
    '- Probes enabled (`management.endpoint.health.probes.enabled=true`): liveness `/actuator/health/liveness`, readiness `/actuator/health/readiness`. No external dependency (database…) in the liveness check.',
    '- Graceful shutdown: `server.shutdown=graceful`.',
    d.ha && d.sessions === 'stateless' && '- The application is **stateless**: nothing in local memory that must survive a pod (sessions, business caches, files).',
    d.ha && d.sessions === 'redis' && '- HTTP sessions stored in Redis through Spring Session: nothing in local memory that must survive a pod.',
    d.ha && d.sessions === 'sticky' && '- Sticky sessions are in place: do not add new dependencies on them, aim for statelessness.',
    d.ha && d.scheduling === 'shedlock' && '- Every `@Scheduled` method has a `@SchedulerLock` (ShedLock), otherwise it runs on every replica.',
    d.ha && d.scheduling === 'quartz' && '- Scheduled tasks use clustered Quartz (JDBC JobStore); never a bare `@Scheduled`.',
    d.ha && d.scheduling === 'none' && '- No `@Scheduled` without a distributed lock: it would run on every replica.',
    d.ha && '- In-memory caches (local `@Cacheable`): beware of consistency across replicas.',
    obs.includes('prometheus') && '- Metrics through Micrometer, exposed on `/actuator/prometheus`.',
    (obs.includes('loki') || obs.includes('elk')) &&
      '- Structured JSON logs on standard output (`logging.structured.format.console`), with no personal data or secrets.',
    obs.includes('otel') && '- OpenTelemetry traces through Micrometer Tracing; propagate the context on outgoing calls.',
  ];
}

export function backendDoc(a) {
  const b = a.backend;
  const buildLabel = b.build === 'maven' ? 'Maven (`./mvnw`)' : 'Gradle Kotlin DSL (`./gradlew`)';
  return {
    title: `Backend: Spring Boot ${b.springBoot} / Java ${b.java}`,
    sections: [
      {
        title: 'Stack',
        lines: [
          `- Build: ${buildLabel}. Always use the wrapper, never a global installation.`,
          `- Database: ${DB[b.database]}, accessed through ${PERSISTENCE[b.persistence]}.`,
          b.libs.length && `- Libraries: ${b.libs.map((l) => LIBS[l]).join(', ')}.`,
        ],
      },
      { title: 'Architecture', lines: architecture(b) },
      { title: 'Code rules', lines: codeRules(b, a) },
      { title: 'API contract', lines: apiContract(b, a) },
      { title: `Migrations (${b.migration === 'flyway' ? 'Flyway' : 'Liquibase'})`, lines: migrations(b, a) },
      { title: 'Running in a cluster', lines: runtime(b, a) },
      { title: 'Tests', lines: tests(b) },
    ],
  };
}
