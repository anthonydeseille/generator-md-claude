import { backendCommands, kubectlBin } from './commands.js';
import { splitList } from './util.js';

export const CI = {
  github: 'GitHub Actions (`.github/workflows/`)',
  gitlab: 'GitLab CI (`.gitlab-ci.yml`)',
  jenkins: 'Jenkins (`Jenkinsfile`)',
  azure: 'Azure DevOps (`azure-pipelines.yml`)',
};
const GITOPS = { argocd: 'Argo CD', flux: 'Flux' };
const IAC = { terraform: 'Terraform', opentofu: 'OpenTofu', ansible: 'Ansible' };
const OBS = {
  prometheus: 'Prometheus',
  grafana: 'Grafana',
  loki: 'Loki',
  elk: 'ELK / OpenSearch',
  otel: 'OpenTelemetry',
};
const ticks = (list) => list.map((c) => `\`${c}\``).join(', ');

/** Règles d'accès aux clusters : courtes, placées dans le CLAUDE.md racine (toujours chargé). */
export function clusterSafetyRules(ops) {
  if (!ops || ops.orchestrator === 'none') return [];
  const kc = kubectlBin(ops);
  return [
    `- Claude utilise \`${kc}\` et \`helm\` en ligne de commande. **k9s est réservé aux humains** (interface interactive, inutilisable par Claude).`,
    `- Contextes hors production : ${ticks(splitList(ops.nonProdContexts))}.`,
    `- Toujours passer le contexte puis le namespace explicitement, **avant le verbe** : \`${kc} --context <ctx> -n ${ops.namespace} get pods\`, \`helm --kube-context <ctx> -n ${ops.namespace} list\`. Ne jamais se fier au contexte courant ni le changer (\`config use-context\`). Les permissions de Claude reposent sur cet ordre.`,
    `- **Production (${ticks(splitList(ops.prodContexts))}) : aucune commande, même en lecture.** Donner la commande à l’humain, qui l’exécute.`,
    '- Avant toute modification d’un cluster hors production : montrer le diff (`kubectl diff`, `helm diff upgrade` ou `--dry-run=server`) et attendre la validation.',
    ops.gitops !== 'none' &&
      `- Les clusters sont synchronisés par ${GITOPS[ops.gitops]} : pas d’\`apply\` manuel (il serait écrasé), tout changement passe par un commit dans le dépôt de déploiement.`,
  ];
}

export function deployDoc(a) {
  const d = a.deploy;
  const ops = a.ops;
  const b = a.backend;
  const k8s = ops.orchestrator !== 'none';
  const bc = b ? backendCommands(b) : undefined;
  const isInfraRepo = a.project.layout === 'infra';

  const containerLine = isInfraRepo
    ? `- Les images sont construites par les dépôts applicatifs${[a.project.related.backend, a.project.related.frontend].filter(Boolean).length ? ` (${ticks([a.project.related.backend, a.project.related.frontend].filter(Boolean))})` : ''} ; ce dépôt ne fait que les déployer. Tags d’image immuables, jamais \`latest\`.`
    : {
        dockerfile: '- Images construites via des Dockerfile multi-stage : image finale minimale (JRE ou distroless), utilisateur non root.',
        jib: `- Image backend construite avec Jib (\`${bc?.image.jib}\`), sans Dockerfile.`,
        buildpacks: `- Image backend construite avec les Buildpacks (\`${bc?.image.buildpacks}\`).`,
      }[d.container];

  const packaging = {
    helm: [
      '- Packaging : Helm. Valeurs par environnement dans `values-<env>.yaml`.',
      '- Vérifier un chart avec `helm lint <chart>` puis `helm template <chart> -f values-<env>.yaml`.',
    ],
    kustomize: ['- Packaging : Kustomize (`base/` + `overlays/<env>/`).', '- Vérifier le rendu avec `kubectl kustomize overlays/<env>`.'],
    raw: ['- Manifests YAML bruts, un dossier par environnement.'],
  }[d.packaging] ?? [];

  const secrets = {
    vault: '- Secrets dans HashiCorp Vault, injectés au runtime.',
    'external-secrets': '- Secrets déclarés via des `ExternalSecret` (External Secrets Operator), jamais de valeur dans le dépôt.',
    sealed: '- Secrets chiffrés avec `kubeseal` : seul le `SealedSecret` est commité, jamais le `Secret` en clair.',
    k8s: '- Secrets Kubernetes créés hors dépôt : ne jamais commiter de manifeste `Secret` contenant des valeurs.',
  }[d.secrets];

  const localCluster = { kind: '`kind create cluster`', k3d: '`k3d cluster create`', minikube: '`minikube start`' }[d.localCluster];

  const dbHa = {
    managed: '- Base de données managée : la HA est assurée par le fournisseur.',
    cnpg: '- PostgreSQL via CloudNativePG : service `<cluster>-rw` pour les écritures, `<cluster>-ro` pour les lectures.',
    patroni: '- PostgreSQL en HA via Patroni : toujours se connecter via le point d’entrée du leader, jamais à une instance directement.',
    none: '- Base en instance unique : point de défaillance connu, à garder en tête.',
  }[d.dbHa];

  return {
    title: 'Déploiement / DevOps',
    sections: [
      {
        title: 'Outillage',
        lines: [
          containerLine,
          k8s && `- Orchestration : ${ops.orchestrator === 'openshift' ? 'OpenShift (`oc`)' : 'Kubernetes (`kubectl`)'}, namespace applicatif \`${ops.namespace}\`.`,
          ...(k8s ? packaging : []),
          k8s && localCluster && `- Cluster local : ${localCluster}.`,
          k8s && ops.gitops !== 'none' && `- GitOps : ${GITOPS[ops.gitops]}.`,
          d.iac.length && `- Infrastructure as Code : ${d.iac.map((i) => IAC[i]).join(', ')}. Claude peut lancer \`plan\`/\`validate\`, jamais \`apply\` ni \`destroy\`.`,
          ops.observability.length && `- Observabilité : ${ops.observability.map((o) => OBS[o]).join(', ')}.`,
        ],
      },
      {
        title: 'Sécurité',
        lines: [
          k8s && '- Règles d’accès aux clusters (contextes, production, k9s) : voir le `CLAUDE.md` racine.',
          secrets,
          '- Aucun secret, mot de passe ou token en clair dans le dépôt, les values ou les pipelines.',
        ],
      },
      {
        title: 'Haute disponibilité',
        lines: ops.ha
          ? [
              `- Au moins ${d.replicas} replicas en production${d.hpa ? ', plus un HorizontalPodAutoscaler pour la montée en charge' : ''}.`,
              d.pdb && '- PodDisruptionBudget sur chaque déploiement, pour survivre aux maintenances de nœuds.',
              '- Stratégie `RollingUpdate` avec `maxUnavailable: 0`.',
              '- `topologySpreadConstraints` pour répartir les replicas sur plusieurs nœuds ou zones.',
              '- Probes readiness et liveness sur les endpoints Actuator ; `startupProbe` pour absorber le démarrage de la JVM.',
              '- `resources.requests` et `limits` mémoire toujours définis ; heap JVM réglée par `-XX:MaxRAMPercentage`.',
              '- Hook `preStop` (court `sleep`) et `terminationGracePeriodSeconds` supérieur au délai de graceful shutdown.',
              ops.migrationRun === 'job' && '- Migrations de schéma exécutées par un Job avant le déploiement (hook Helm `pre-upgrade` ou Argo CD `PreSync`).',
              ops.migrationRun === 'init' && '- Migrations de schéma exécutées par un initContainer.',
              isInfraRepo &&
                '- Migrations de schéma : exécutées par un Job avant le déploiement de la nouvelle version, et toujours rétrocompatibles avec la version en cours (expand/contract).',
              dbHa,
            ]
          : [],
      },
    ],
  };
}
