import { frontendCommands } from './commands.js';

const UI = { material: 'Angular Material', primeng: 'PrimeNG', tailwind: 'Tailwind CSS' };
const UNIT = { vitest: 'Vitest', jest: 'Jest', karma: 'Karma + Jasmine' };

export function frontendDoc(a) {
  const f = a.frontend;
  const cmd = frontendCommands(f);
  const separateBackend = a.project.layout === 'frontend';
  const backendRepo = a.project.related?.backend;

  const state = {
    signals: "- Shared state in `providedIn: 'root'` services exposing read-only signals (`asReadonly()`).",
    signalstore:
      '- Shared state through NgRx SignalStore (`signalStore`, `withState`, `withComputed`, `withMethods`), one store per functional domain.',
    ngrx: '- Global state through NgRx Store: actions via `createActionGroup`, functional effects, memoised selectors; no HTTP call outside effects.',
  }[f.state];

  return {
    title: `Frontend: Angular ${f.angular}`,
    sections: [
      {
        title: 'Stack',
        lines: [
          `- Angular ${f.angular}, package manager: ${f.packageManager} (do not use another one, do not commit another lockfile).`,
          f.ui.length && `- UI: ${f.ui.map((u) => UI[u]).join(', ')}.`,
          `- Tests: ${UNIT[f.unitTests]}${f.e2e !== 'none' ? `, e2e with ${f.e2e === 'playwright' ? 'Playwright' : 'Cypress'}` : ''}.`,
        ],
      },
      {
        title: 'Structure',
        lines: [
          '- `src/app/core/`: singletons (interceptors, guards, global services).',
          '- `src/app/shared/`: reusable components, pipes and directives.',
          '- `src/app/features/<feature>/`: pages and components of a feature, lazy-loaded.',
          f.apiClient === 'generated' && `- \`${f.apiDir}/\`: **generated** HTTP client, never edit it by hand.`,
        ],
      },
      {
        title: 'Angular rules',
        lines: [
          '- **Standalone** components only (no `NgModule`), `ChangeDetectionStrategy.OnPush`.',
          '- Inject with `inject()` rather than through the constructor.',
          '- Signals for state (`signal`, `computed`, `input()`, `output()`, `model()`); RxJS only for asynchronous streams (HTTP, events).',
          '- Built-in control flow (`@if`, `@for` with `track`, `@switch`), never `*ngIf` / `*ngFor`.',
          '- Typed reactive forms.',
          '- Lazy-loaded routes (`loadComponent` / `loadChildren`).',
          '- No manual subscription left uncleaned: `takeUntilDestroyed()`, `toSignal()` or the `async` pipe.',
          '- Strict TypeScript: no `any` (use `unknown` + a type guard).',
          `- Generate with the Angular CLI (\`${cmd.generate} component …\`) to keep the structure consistent.`,
          state,
          f.ui.includes('material') && '- Use existing Angular Material components before creating a new one.',
          f.ui.includes('primeng') && '- Use existing PrimeNG components before creating a new one.',
          f.ui.includes('tailwind') && '- Style with Tailwind utility classes; component CSS only when Tailwind is not enough.',
        ],
      },
      {
        title: 'Backend calls',
        lines: [
          separateBackend &&
            `- The backend lives in a **separate repository**${backendRepo ? ` (\`${backendRepo}\`)` : ''}: never assume an endpoint or field that is not in its contract; if an API is missing, say so instead of inventing it.`,
          ...(f.apiClient === 'generated'
            ? [
                `- Client generated from the backend OpenAPI spec${f.apiSpec ? ` (\`${f.apiSpec}\`)` : ''}: after any API change, regenerate it with \`${cmd.api}\`.`,
                '- Components do not call the generated client directly: go through a feature service.',
              ]
            : [
                '- HTTP calls centralised in dedicated services (one per resource), responses typed with interfaces.',
                '- API URL from the environment configuration, never hard-coded.',
              ]),
        ],
      },
      {
        title: 'Tests',
        lines: [
          '- `*.spec.ts` file next to the file under test.',
          '- Test visible behaviour (DOM, outputs), not implementation details.',
          f.e2e !== 'none' && `- E2E scenarios in \`e2e/\`: \`${cmd.e2e}\`.`,
          f.lint && `- Code must pass \`${cmd.lint}\` with no errors (ESLint + Prettier).`,
        ],
      },
    ],
  };
}
