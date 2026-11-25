// Concrete commands per tool: used in the root CLAUDE.md and for permissions.

export function backendCommands(b) {
  if (b.build === 'maven') {
    return {
      wrapper: './mvnw',
      run: './mvnw spring-boot:run',
      test: './mvnw test',
      testOne: './mvnw test -Dtest=MyClassTest',
      verify: './mvnw verify',
      format: { spotless: './mvnw spotless:apply', checkstyle: './mvnw checkstyle:check' }[b.formatter],
      image: { jib: './mvnw jib:dockerBuild', buildpacks: './mvnw spring-boot:build-image' },
    };
  }
  return {
    wrapper: './gradlew',
    run: './gradlew bootRun',
    test: './gradlew test',
    testOne: "./gradlew test --tests 'MyClassTest'",
    verify: './gradlew build',
    format: { spotless: './gradlew spotlessApply', checkstyle: './gradlew checkstyleMain' }[b.formatter],
    image: { jib: './gradlew jibDockerBuild', buildpacks: './gradlew bootBuildImage' },
  };
}

export function frontendCommands(f) {
  const pm = f.packageManager;
  const run = (script, args = '') => {
    const base = `${pm} run ${script}`;
    if (!args) return base;
    return pm === 'npm' ? `${base} -- ${args}` : `${base} ${args}`;
  };
  const exec = { npm: 'npx', pnpm: 'pnpm exec', yarn: 'yarn' }[pm];
  return {
    pm,
    exec,
    start: `${pm} start`,
    // Claude has no TTY: force single-run (non-watch) mode.
    test: f.unitTests === 'jest' ? run('test') : run('test', '--watch=false'),
    build: run('build'),
    lint: f.lint ? run('lint') : undefined,
    generate: `${exec} ng generate`,
    e2e: { playwright: `${exec} playwright test`, cypress: `${exec} cypress run` }[f.e2e],
    api: f.apiClient === 'generated' ? run(f.apiScript) : undefined,
  };
}

export const kubectlBin = (d) => (d.orchestrator === 'openshift' ? 'oc' : 'kubectl');
