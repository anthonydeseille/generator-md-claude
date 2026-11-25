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

/** Cluster access rules: kept short and placed in the root CLAUDE.md (always loaded). */
export function clusterSafetyRules(ops) {
  if (!ops || ops.orchestrator === 'none') return [];
  const kc = kubectlBin(ops);
  return [
    `- Claude uses \`${kc}\` and \`helm\` on the command line. **k9s is for humans only** (interactive UI, unusable by Claude).`,
    `- Non-production contexts: ${ticks(splitList(ops.nonProdContexts))}.`,
    `- Always pass the context then the namespace explicitly, **before the verb**: \`${kc} --context <ctx> -n ${ops.namespace} get pods\`, \`helm --kube-context <ctx> -n ${ops.namespace} list\`. Never rely on the current context and never change it (\`config use-context\`). Claude’s permissions rely on this order.`,
    `- **Production (${ticks(splitList(ops.prodContexts))}): no command at all, not even read-only.** Give the command to the human, who runs it.`,
    '- Before changing a non-production cluster: show the diff (`kubectl diff`, `helm diff upgrade` or `--dry-run=server`) and wait for approval.',
    ops.gitops !== 'none' &&
      `- Clusters are synchronised by ${GITOPS[ops.gitops]}: no manual \`apply\` (it would be overwritten); every change goes through a commit in the deployment repository.`,
  ];
}

export function deployDoc(a) {
  const d = a.deploy;
  const ops = a.ops;
  const b = a.backend;
  const k8s = ops.orchestrator !== 'none';
  const bc = b ? backendCommands(b) : undefined;
  const isInfraRepo = a.project.layout === 'infra';
  const appRepos = [a.project.related.backend, a.project.related.frontend].filter(Boolean);

  const containerLine = isInfraRepo
    ? `- Images are built by the application repositories${appRepos.length ? ` (${ticks(appRepos)})` : ''}; this repository only deploys them. Immutable image tags, never \`latest\`.`
    : {
        dockerfile: '- Images built from multi-stage Dockerfiles: minimal final image (JRE or distroless), non-root user.',
        jib: `- Backend image built with Jib (\`${bc?.image.jib}\`), no Dockerfile.`,
        buildpacks: `- Backend image built with Buildpacks (\`${bc?.image.buildpacks}\`).`,
      }[d.container];

  const packaging =
    {
      helm: [
        '- Packaging: Helm. Per-environment values in `values-<env>.yaml`.',
        '- Check a chart with `helm lint <chart>` then `helm template <chart> -f values-<env>.yaml`.',
      ],
      kustomize: ['- Packaging: Kustomize (`base/` + `overlays/<env>/`).', '- Check the output with `kubectl kustomize overlays/<env>`.'],
      raw: ['- Plain YAML manifests, one directory per environment.'],
    }[d.packaging] ?? [];

  const secrets = {
    vault: '- Secrets stored in HashiCorp Vault, injected at runtime.',
    'external-secrets': '- Secrets declared through `ExternalSecret` resources (External Secrets Operator), never a value in the repository.',
    sealed: '- Secrets encrypted with `kubeseal`: only the `SealedSecret` is committed, never the plain `Secret`.',
    k8s: '- Kubernetes Secrets created outside the repository: never commit a `Secret` manifest containing values.',
  }[d.secrets];

  const localCluster = { kind: '`kind create cluster`', k3d: '`k3d cluster create`', minikube: '`minikube start`' }[d.localCluster];

  const dbHa = {
    managed: '- Managed database: high availability is handled by the provider.',
    cnpg: '- PostgreSQL through CloudNativePG: `<cluster>-rw` service for writes, `<cluster>-ro` for reads.',
    patroni: '- PostgreSQL HA through Patroni: always connect through the leader endpoint, never to an instance directly.',
    none: '- Single database instance: a known single point of failure, keep it in mind.',
  }[d.dbHa];

  return {
    title: 'Deployment / DevOps',
    sections: [
      {
        title: 'Tooling',
        lines: [
          containerLine,
          k8s && `- Orchestration: ${ops.orchestrator === 'openshift' ? 'OpenShift (`oc`)' : 'Kubernetes (`kubectl`)'}, application namespace \`${ops.namespace}\`.`,
          ...(k8s ? packaging : []),
          k8s && localCluster && `- Local cluster: ${localCluster}.`,
          k8s && ops.gitops !== 'none' && `- GitOps: ${GITOPS[ops.gitops]}.`,
          d.iac.length && `- Infrastructure as Code: ${d.iac.map((i) => IAC[i]).join(', ')}. Claude may run \`plan\`/\`validate\`, never \`apply\` or \`destroy\`.`,
          ops.observability.length && `- Observability: ${ops.observability.map((o) => OBS[o]).join(', ')}.`,
        ],
      },
      {
        title: 'Security',
        lines: [
          k8s && '- Cluster access rules (contexts, production, k9s): see the root `CLAUDE.md`.',
          secrets,
          '- No plain-text secret, password or token in the repository, the values files or the pipelines.',
        ],
      },
      {
        title: 'High availability',
        lines: ops.ha
          ? [
              `- At least ${d.replicas} replicas in production${d.hpa ? ', plus a HorizontalPodAutoscaler to scale out' : ''}.`,
              d.pdb && '- A PodDisruptionBudget on every deployment, to survive node maintenance.',
              '- `RollingUpdate` strategy with `maxUnavailable: 0`.',
              '- `topologySpreadConstraints` to spread replicas across nodes or zones.',
              '- Readiness and liveness probes on the Actuator endpoints; a `startupProbe` to absorb JVM startup time.',
              '- Memory `resources.requests` and `limits` always set; JVM heap sized with `-XX:MaxRAMPercentage`.',
              '- `preStop` hook (short `sleep`) and a `terminationGracePeriodSeconds` longer than the graceful shutdown timeout.',
              ops.migrationRun === 'job' && '- Schema migrations run by a Job before the rollout (Helm `pre-upgrade` hook or Argo CD `PreSync`).',
              ops.migrationRun === 'init' && '- Schema migrations run by an initContainer.',
              isInfraRepo &&
                '- Schema migrations: run by a Job before the new version is rolled out, and always backward compatible with the running version (expand/contract).',
              dbHa,
            ]
          : [],
      },
    ],
  };
}
