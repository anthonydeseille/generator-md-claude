import { backendCommands, frontendCommands, kubectlBin } from './commands.js';
import { splitList } from './util.js';

const bash = (cmd) => `Bash(${cmd}:*)`;

export function buildPermissions(a) {
  const allow = [];
  const ask = [];
  const deny = ['Read(./.env)', 'Read(./.env.*)', 'Read(./**/secrets/**)'];

  if (a.backend) {
    const w = backendCommands(a.backend).wrapper;
    const goals =
      a.backend.build === 'maven'
        ? ['compile', 'test', 'verify', 'package', 'spotless:apply', 'spotless:check', 'checkstyle:check', 'dependency:tree']
        : ['compileJava', 'test', 'build', 'check', 'spotlessApply', 'spotlessCheck', 'checkstyleMain', 'dependencies'];
    allow.push(...goals.map((g) => bash(`${w} ${g}`)));
  }

  if (a.frontend) {
    const c = frontendCommands(a.frontend);
    const pm = c.pm;
    allow.push(bash(`${pm} test`), bash(`${pm} run test`), bash(`${pm} run build`), bash(c.generate));
    if (c.lint) allow.push(bash(`${pm} run lint`));
    if (c.e2e) allow.push(bash(c.e2e));
    if (c.api) allow.push(bash(c.api));
  }

  const d = a.ops;
  if (d.compose) allow.push(bash('docker compose ps'), bash('docker compose logs'), bash('docker compose up'));

  if (d.orchestrator !== 'none') {
    const kc = kubectlBin(d);
    const ns = d.namespace;
    // Les règles Claude Code sont des préfixes : le CLAUDE.md impose l'ordre
    // `<kc> --context <ctx> -n <ns> <verbe>` pour qu'elles s'appliquent.
    const kReads = ['get', 'describe', 'logs', 'diff', 'top', 'events', 'rollout status'];
    const kWrites = ['apply', 'patch', 'scale', 'rollout restart', 'rollout undo', 'exec'];
    const hReads = ['list', 'status', 'get values', 'diff'];
    const hWrites = ['install', 'upgrade', 'rollback'];

    allow.push(
      ...['explain', 'config get-contexts', 'config current-context'].map((s) => bash(`${kc} ${s}`)),
      bash('helm lint'),
      bash('helm template'),
    );
    if (d.packaging === 'kustomize') allow.push(bash('kubectl kustomize'));

    for (const ctx of splitList(d.nonProdContexts)) {
      const k = `${kc} --context ${ctx} -n ${ns}`;
      const h = `helm --kube-context ${ctx} -n ${ns}`;
      allow.push(...kReads.map((s) => bash(`${k} ${s}`)), ...hReads.map((s) => bash(`${h} ${s}`)));
      ask.push(...kWrites.map((s) => bash(`${k} ${s}`)), ...hWrites.map((s) => bash(`${h} ${s}`)));
      deny.push(bash(`${k} delete`), bash(`${h} uninstall`));
    }

    ask.push(bash(`${kc} config use-context`));
    deny.push(bash(`${kc} delete`), bash('helm uninstall'));

    // La vraie protection de la prod reste un kubeconfig / RBAC sans accès pour Claude.
    for (const ctx of splitList(d.prodContexts)) {
      deny.push(
        bash(`${kc} --context ${ctx}`),
        bash(`${kc} --context=${ctx}`),
        bash(`helm --kube-context ${ctx}`),
        bash(`helm --kube-context=${ctx}`),
      );
    }
  }

  for (const tool of a.deploy?.iac ?? []) {
    if (tool === 'ansible') {
      ask.push(bash('ansible-playbook'));
      continue;
    }
    const bin = tool === 'opentofu' ? 'tofu' : 'terraform';
    allow.push(bash(`${bin} fmt`), bash(`${bin} validate`), bash(`${bin} plan`));
    deny.push(bash(`${bin} apply`), bash(`${bin} destroy`));
  }

  return { allow, ask, deny };
}

const uniq = (arr) => [...new Set(arr)];

/** Fusionne avec un settings.json existant : on ajoute, on ne retire jamais rien. */
export function mergeSettings(existing, generated) {
  const result = { ...existing };
  const perms = { ...(existing.permissions ?? {}) };
  for (const key of ['allow', 'ask', 'deny']) {
    const merged = uniq([...(perms[key] ?? []), ...generated[key]]);
    if (merged.length) perms[key] = merged;
  }
  result.permissions = perms;
  return result;
}
