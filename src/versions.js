// Fetches the latest versions when the questionnaire starts.
// No project data is sent: plain public GET requests.
// When offline or on error, falls back to static lists.

const TIMEOUT_MS = 4000;

const FALLBACK = {
  online: false,
  boot: [{ value: '4', label: 'Spring Boot 4.x' }],
  bootDefault: '4',
  java: [
    { value: '25', label: 'Java 25', hint: 'LTS' },
    { value: '21', label: 'Java 21', hint: 'LTS' },
    { value: '17', label: 'Java 17', hint: 'LTS' },
  ],
  javaDefault: '21',
  angular: [],
  angularDefault: undefined,
};

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
  return res.json();
}

// Java LTS releases: 17, 21, 25, 29… (one every two years).
const isLts = (v) => Number(v) >= 17 && (Number(v) - 17) % 4 === 0;

async function springVersions() {
  const m = await getJson('https://start.spring.io', { Accept: 'application/json' });

  // Ids look like "4.2.0.RELEASE", "4.2.1.BUILD-SNAPSHOT", "4.3.0.M1": keep GA releases only,
  // the most recent one per major.minor line (the list is sorted in descending order).
  const lines = new Map();
  for (const { id } of m.bootVersion.values) {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:\.RELEASE)?$/.exec(id);
    if (!match) continue;
    const line = `${match[1]}.${match[2]}`;
    if (!lines.has(line)) lines.set(line, id.replace(/\.RELEASE$/, ''));
  }
  const boot = [...lines].map(([line, version], i) => ({
    value: line,
    label: `Spring Boot ${line}`,
    hint: i === 0 ? `${version}, latest` : version,
  }));

  const javaIds = m.javaVersion.values.map((v) => v.id);
  const java = javaIds.map((v) => ({ value: v, label: `Java ${v}`, hint: isLts(v) ? 'LTS' : undefined }));
  // Default to the latest LTS (Initializr's own default is often older).
  const javaDefault = javaIds.find(isLts) ?? m.javaVersion.default;

  return { boot, bootDefault: boot[0]?.value, java, javaDefault };
}

async function angularVersions() {
  const tags = await getJson('https://registry.npmjs.org/-/package/@angular/cli/dist-tags');
  const latestMajor = Number(tags.latest.split('.')[0]);
  // Supported versions: the latest, then majors still in LTS ("vNN-lts" tags).
  const angular = [{ value: String(latestMajor), label: `Angular ${latestMajor}`, hint: `${tags.latest}, latest` }];
  for (const major of [latestMajor - 1, latestMajor - 2]) {
    const lts = tags[`v${major}-lts`];
    if (lts) angular.push({ value: String(major), label: `Angular ${major}`, hint: `${lts}, LTS` });
  }
  return { angular, angularDefault: String(latestMajor) };
}

export async function fetchVersions({ spring = true, angular = true } = {}) {
  const [s, a] = await Promise.allSettled([
    spring ? springVersions() : Promise.resolve({}),
    angular ? angularVersions() : Promise.resolve({}),
  ]);
  const result = { ...FALLBACK, online: true };
  if (s.status === 'fulfilled') Object.assign(result, s.value);
  else result.online = false;
  if (a.status === 'fulfilled') Object.assign(result, a.value);
  else result.online = false;
  return result;
}
