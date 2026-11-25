import { frontendCommands } from './commands.js';

const UI = { material: 'Angular Material', primeng: 'PrimeNG', tailwind: 'Tailwind CSS' };
const UNIT = { vitest: 'Vitest', jest: 'Jest', karma: 'Karma + Jasmine' };

export function frontendDoc(a) {
  const f = a.frontend;
  const cmd = frontendCommands(f);
  const separateBackend = a.project.layout === 'frontend';
  const backendRepo = a.project.related?.backend;

  const state = {
    signals:
      "- État partagé dans des services `providedIn: 'root'` qui exposent des signals en lecture seule (`asReadonly()`).",
    signalstore:
      '- État partagé via NgRx SignalStore (`signalStore`, `withState`, `withComputed`, `withMethods`), un store par domaine fonctionnel.',
    ngrx: '- État global via NgRx Store : actions via `createActionGroup`, effets fonctionnels, sélecteurs mémoïsés ; aucun appel HTTP hors des effets.',
  }[f.state];

  return {
    title: `Frontend : Angular ${f.angular}`,
    sections: [
      {
        title: 'Stack',
        lines: [
          `- Angular ${f.angular}, gestionnaire de paquets : ${f.packageManager} (ne pas en utiliser un autre, ne pas commiter d’autre lockfile).`,
          f.ui.length && `- UI : ${f.ui.map((u) => UI[u]).join(', ')}.`,
          `- Tests : ${UNIT[f.unitTests]}${f.e2e !== 'none' ? `, e2e avec ${f.e2e === 'playwright' ? 'Playwright' : 'Cypress'}` : ''}.`,
        ],
      },
      {
        title: 'Structure',
        lines: [
          '- `src/app/core/` : singletons (intercepteurs, guards, services globaux).',
          '- `src/app/shared/` : composants, pipes et directives réutilisables.',
          '- `src/app/features/<feature>/` : pages et composants d’une fonctionnalité, chargés en lazy loading.',
          f.apiClient === 'generated' && `- \`${f.apiDir}/\` : client HTTP **généré**, ne jamais modifier à la main.`,
        ],
      },
      {
        title: 'Règles Angular',
        lines: [
          '- Composants **standalone** uniquement (pas de `NgModule`), `ChangeDetectionStrategy.OnPush`.',
          '- Injection via `inject()` plutôt que par le constructeur.',
          '- Signals pour l’état (`signal`, `computed`, `input()`, `output()`, `model()`) ; RxJS réservé aux flux asynchrones (HTTP, événements).',
          '- Control flow natif (`@if`, `@for` avec `track`, `@switch`), jamais `*ngIf` / `*ngFor`.',
          '- Formulaires réactifs typés.',
          '- Routes en lazy loading (`loadComponent` / `loadChildren`).',
          '- Pas d’abonnement manuel non nettoyé : `takeUntilDestroyed()`, `toSignal()` ou pipe `async`.',
          '- TypeScript strict : pas de `any` (utiliser `unknown` + garde de type).',
          `- Générer avec Angular CLI (\`${cmd.generate} component …\`) pour respecter la structure.`,
          state,
          f.ui.includes('material') && '- Utiliser les composants Angular Material existants avant d’en créer un.',
          f.ui.includes('primeng') && '- Utiliser les composants PrimeNG existants avant d’en créer un.',
          f.ui.includes('tailwind') && '- Styles via les classes utilitaires Tailwind ; CSS de composant seulement si Tailwind ne suffit pas.',
        ],
      },
      {
        title: 'Appels au backend',
        lines: [
          separateBackend &&
            `- Le backend est dans un **dépôt séparé**${backendRepo ? ` (\`${backendRepo}\`)` : ''} : ne jamais supposer un endpoint ou un champ qui n’est pas dans son contrat ; si un besoin d’API manque, le signaler au lieu de l’inventer.`,
          ...(f.apiClient === 'generated'
            ? [
                `- Client généré depuis la spec OpenAPI du backend${f.apiSpec ? ` (\`${f.apiSpec}\`)` : ''} : après tout changement d’API, régénérer avec \`${cmd.api}\`.`,
                '- Les composants n’appellent pas le client généré directement : passer par un service de la feature.',
              ]
            : [
                '- Appels HTTP centralisés dans des services dédiés (un par ressource), réponses typées par des interfaces.',
                '- URL de l’API via la configuration d’environnement, jamais en dur.',
              ]),
        ],
      },
      {
        title: 'Tests',
        lines: [
          '- Fichier `*.spec.ts` à côté du fichier testé.',
          '- Tester le comportement visible (DOM, sorties), pas les détails d’implémentation.',
          f.e2e !== 'none' && `- Scénarios e2e dans \`e2e/\` : \`${cmd.e2e}\`.`,
          f.lint && `- Le code doit passer \`${cmd.lint}\` sans erreur (ESLint + Prettier).`,
        ],
      },
    ],
  };
}
