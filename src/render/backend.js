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
    `- Package racine : \`${pkg}\`.`,
    b.libs.includes('archunit') && '- Ces règles sont vérifiées par des tests ArchUnit : ne jamais les contourner ni les désactiver.',
  ];
  switch (b.architecture) {
    case 'hexagonal':
      return [
        common[0],
        `- \`${pkg}.domain\` : modèle métier pur, **aucune dépendance Spring ni ${b.persistence === 'jpa' ? 'JPA' : 'persistance'}**.`,
        `- \`${pkg}.application\` : cas d'usage et ports (interfaces) entrants et sortants.`,
        `- \`${pkg}.infrastructure\` : adaptateurs (REST, persistance, messaging) qui implémentent les ports.`,
        '- Les dépendances pointent toujours vers `domain`, jamais l’inverse.',
        common[1],
      ];
    case 'feature':
      return [
        common[0],
        `- Un package par domaine métier (\`${pkg}.order\`, \`${pkg}.customer\`…), contenant son controller, son service, son repository et ses DTOs.`,
        '- Un domaine n’accède jamais au repository d’un autre domaine : il passe par le service public de ce domaine.',
        '- Code transverse (config, sécurité, gestion d’erreurs) dans `common` / `config`.',
        common[1],
      ];
    default:
      return [
        common[0],
        '- Couches : `web` (controllers, DTOs) → `service` (logique métier) → `repository`.',
        '- Un controller n’appelle jamais un repository directement.',
        common[1],
      ];
  }
}

function codeRules(b, a) {
  const jpa = b.persistence === 'jpa';
  const has = (l) => b.libs.includes(l);
  const generatedClient = a.frontend?.apiClient === 'generated';
  return [
    '- Injection par constructeur uniquement (pas de `@Autowired` sur les champs).',
    `- DTOs en \`record\` Java ; les entités${jpa ? ' JPA' : ''} ne sont jamais exposées par l’API REST.`,
    '- `@Transactional` sur les services, jamais sur les controllers.',
    '- Erreurs gérées de façon centralisée (`@RestControllerAdvice`), réponses au format `ProblemDetail` (RFC 9457).',
    '- Configuration dans `application.yml` + profils (`application-<profil>.yml`) ; aucun secret en clair dans le dépôt.',
    has('lombok') &&
      (jpa
        ? '- Lombok : `@Getter`, `@Setter`, `@Builder`, `@RequiredArgsConstructor` autorisés ; **pas de `@Data` ni `@EqualsAndHashCode` sur les entités JPA**.'
        : '- Lombok autorisé, mais préférer les `record` quand c’est possible.'),
    has('mapstruct') &&
      '- Conversions entité ↔ DTO via des mappers MapStruct (`componentModel = "spring"`), pas de mapping manuel dans les services.',
    has('springdoc') &&
      `- Chaque endpoint est documenté (\`@Operation\`, \`@ApiResponse\`)${generatedClient ? ' : la spec OpenAPI sert à générer le client Angular, tout changement d’API doit y être reflété' : ''}.`,
    has('security') &&
      '- Spring Security : tout endpoint est authentifié par défaut ; chaque `permitAll()` doit être justifié.',
    jpa && '- `spring.jpa.open-in-view=false` ; surveiller les N+1 (`@EntityGraph` ou `JOIN FETCH`).',
    jpa &&
      b.migration !== 'none' &&
      `- \`spring.jpa.hibernate.ddl-auto=validate\` : le schéma est géré exclusivement par ${b.migration === 'flyway' ? 'Flyway' : 'Liquibase'}.`,
  ];
}

function migrations(b, a) {
  if (b.migration === 'none') return [];
  const ts = b.migrationNaming === 'timestamp';
  const d = a.ops ?? {};
  let lines;

  if (b.migration === 'flyway') {
    lines = [
      '- Scripts SQL dans `src/main/resources/db/migration/`.',
      ts
        ? '- Nommage : `V<yyyyMMddHHmm>__<description_snake_case>.sql` (ex. `V202611251430__create_order_table.sql`).'
        : '- Nommage : `V<n>__<description_snake_case>.sql` ; vérifier le dernier numéro existant avant d’en créer un.',
    ];
  } else {
    const ext = b.liquibaseFormat === 'xml' ? 'xml' : b.liquibaseFormat === 'sql' ? 'sql' : 'yaml';
    const masterExt = ext === 'xml' ? 'xml' : 'yaml';
    lines = [
      `- Changelog maître : \`src/main/resources/db/changelog/db.changelog-master.${masterExt}\`, qui inclut les fichiers de \`db/changelog/changes/\`.`,
      ts
        ? `- Un fichier par évolution : \`changes/<yyyyMMddHHmm>-<description>.${ext}\`.`
        : `- Un fichier par évolution : \`changes/<nnn>-<description>.${ext}\` ; vérifier le dernier numéro existant.`,
      '- Chaque changeset a un `id` unique (reprendre le nom du fichier) et un `author`.',
      ext === 'sql' && '- Format SQL : en-tête `--liquibase formatted sql`, puis `--changeset <auteur>:<id>` avant chaque changeset.',
      '- Fournir un `rollback` dès que Liquibase ne sait pas le déduire (SQL brut, mises à jour de données).',
    ];
  }

  lines.push(
    '- **Ne jamais modifier une migration déjà mergée** (checksum invalide sur tous les environnements) : toute correction passe par une nouvelle migration.',
    '- Une migration = une évolution cohérente ; les reprises de données volumineuses sont faites par lots.',
  );

  if (d.ha) {
    lines.push(
      '- **Rolling update** : l’ancienne et la nouvelle version de l’application tournent en même temps sur le même schéma. Chaque migration doit rester compatible avec la version précédente :',
      '  - ajout de colonne : nullable ou avec valeur par défaut ;',
      '  - renommage ou changement de type : *expand/contract* (ajouter la nouvelle colonne, migrer les données, basculer le code, supprimer l’ancienne colonne dans une release ultérieure) ;',
      '  - suppression de colonne ou de table : uniquement quand plus aucune version déployée ne l’utilise.',
    );
    const tool = b.migration;
    if (d.migrationRun === 'job' || d.migrationRun === 'init') {
      lines.push(
        `- En environnement déployé, les migrations sont exécutées par ${d.migrationRun === 'job' ? 'un Job dédié (avant le déploiement)' : 'un initContainer'}, pas au démarrage de chaque pod (\`spring.${tool}.enabled=false\` dans le profil correspondant).`,
      );
    } else if (d.migrationRun === 'startup') {
      lines.push(
        `- Les migrations s’exécutent au démarrage ; le verrou ${tool === 'flyway' ? 'Flyway' : 'Liquibase'} sérialise les pods, mais une migration longue bloque la readiness : les garder courtes.`,
      );
    }
  }
  return lines;
}

function apiContract(b, a) {
  const { layout, related } = a.project;
  const spec = b.libs.includes('springdoc') ? ' La spec OpenAPI (`/v3/api-docs`) fait foi.' : '';
  if (layout === 'monorepo' && a.frontend) {
    return [
      `- Le frontend du même dépôt consomme cette API : un changement de contrat se fait dans la même PR que l’adaptation du frontend${a.frontend.apiClient === 'generated' ? ' (client régénéré)' : ''}.${spec}`,
    ];
  }
  if (layout === 'backend') {
    return [
      `- Cette API est consommée par ${related.frontend ? `le frontend \`${related.frontend}\`` : 'un frontend'}, **dans un dépôt séparé** : il n’est pas mis à jour en même temps.${spec}`,
      '- Tout changement de contrat (champ supprimé ou renommé, type modifié, endpoint retiré) est **cassant** : rester rétrocompatible (ajouts uniquement) ou versionner (`/api/v2/…`).',
      '- Signaler explicitement dans le résumé de la tâche tout changement visible par le frontend.',
    ];
  }
  return [];
}

function tests(b) {
  const has = (l) => b.libs.includes(l);
  return [
    '- JUnit 5 + AssertJ + Mockito.',
    `- Nommage : \`<Classe>Test\` pour les tests unitaires, \`<Classe>IT\` pour les tests d’intégration.`,
    `- Tranches de test : \`@WebMvcTest\` pour les controllers${b.persistence === 'jpa' ? ', `@DataJpaTest` pour les repositories' : ''}.`,
    has('testcontainers') &&
      `- Tests d’intégration sur un vrai ${DB[b.database]} via Testcontainers (\`@ServiceConnection\`) ; **pas de H2**.`,
    '- Toute fonctionnalité ou correction de bug s’accompagne de tests.',
  ];
}

function runtime(b, a) {
  const d = a.ops;
  if (!d || d.orchestrator === 'none') return [];
  const obs = d.observability ?? [];
  return [
    '- Probes activées (`management.endpoint.health.probes.enabled=true`) : liveness `/actuator/health/liveness`, readiness `/actuator/health/readiness`. Pas de dépendance externe (BDD…) dans la liveness.',
    '- Arrêt propre : `server.shutdown=graceful`.',
    d.ha && d.sessions === 'stateless' && '- Application **sans état** : rien en mémoire locale qui doive survivre à un pod (sessions, caches métier, fichiers).',
    d.ha && d.sessions === 'redis' && '- Sessions HTTP stockées dans Redis via Spring Session : rien en mémoire locale qui doive survivre à un pod.',
    d.ha && d.sessions === 'sticky' && '- Sticky sessions en place : ne pas en ajouter de nouvelles dépendances, viser le sans-état.',
    d.ha && d.scheduling === 'shedlock' && '- Toute méthode `@Scheduled` porte un `@SchedulerLock` (ShedLock), sinon elle s’exécute sur chaque replica.',
    d.ha && d.scheduling === 'quartz' && '- Tâches planifiées via Quartz en mode cluster (JobStore JDBC) ; jamais de `@Scheduled` brut.',
    d.ha && d.scheduling === 'none' && '- Pas de `@Scheduled` sans verrou distribué : il s’exécuterait sur chaque replica.',
    d.ha && '- Caches en mémoire (`@Cacheable` local) : attention à la cohérence entre replicas.',
    obs.includes('prometheus') && '- Métriques via Micrometer, exposées sur `/actuator/prometheus`.',
    (obs.includes('loki') || obs.includes('elk')) &&
      '- Logs structurés en JSON sur la sortie standard (`logging.structured.format.console`), sans données personnelles ni secrets.',
    obs.includes('otel') && '- Traces OpenTelemetry via Micrometer Tracing ; propager le contexte dans les appels sortants.',
  ];
}

export function backendDoc(a) {
  const b = a.backend;
  const buildLabel = b.build === 'maven' ? 'Maven (`./mvnw`)' : 'Gradle Kotlin DSL (`./gradlew`)';
  return {
    title: `Backend : Spring Boot ${b.springBoot} / Java ${b.java}`,
    sections: [
      {
        title: 'Stack',
        lines: [
          `- Build : ${buildLabel}. Toujours utiliser le wrapper, jamais une installation globale.`,
          `- Base de données : ${DB[b.database]}, accès via ${PERSISTENCE[b.persistence]}.`,
          b.libs.length && `- Bibliothèques : ${b.libs.map((l) => LIBS[l]).join(', ')}.`,
        ],
      },
      { title: 'Architecture', lines: architecture(b) },
      { title: 'Règles de code', lines: codeRules(b, a) },
      { title: 'Contrat d’API', lines: apiContract(b, a) },
      { title: `Migrations (${b.migration === 'flyway' ? 'Flyway' : 'Liquibase'})`, lines: migrations(b, a) },
      { title: 'Exécution en cluster', lines: runtime(b, a) },
      { title: 'Tests', lines: tests(b) },
    ],
  };
}
