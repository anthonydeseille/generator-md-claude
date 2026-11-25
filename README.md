# generator-md-claude

Générateur interactif de `CLAUDE.md` pour les projets **Spring Boot / Angular / Kubernetes**, dans l'esprit de JHipster.

## Utilisation

```bash
npx github:<compte>/generator-md-claude    # sans installation
# ou
npm i -g generator-md-claude && md-claude
```

À lancer à la racine du projet. Options :

| Option | Effet |
|---|---|
| `-y`, `--skip-prompts` | régénère depuis `.md-claude.json` sans questions |
| `-f`, `--force` | écrase les fichiers existants sans demander |
| `--dry-run` | affiche le résultat sans rien écrire |

## Organisations supportées

| Organisation | Ce que le générateur ajoute |
|---|---|
| Monorepo | un CLAUDE.md par dossier ; règle « changement d'API et adaptation du front dans la même PR » |
| Dépôt backend seul | lien vers le dépôt front ; tout changement de contrat d'API est cassant : rétrocompatibilité ou versioning |
| Dépôt frontend seul | lien vers le dépôt back ; client généré depuis une spec OpenAPI distante ; interdiction d'inventer des endpoints |
| Dépôt d'infra seul | images construites ailleurs, tags immuables, migrations par Job |

Dans tous les cas, on peut indiquer où se trouve le déploiement : dans le dépôt, dans un dépôt d'infra séparé, ou nulle part pour l'instant. Les règles d'exploitation (contextes kube, HA, ShedLock…) sont posées même quand l'infra est ailleurs.

## Fichiers produits

- `CLAUDE.md` : vue d'ensemble, commandes, conventions git, règles de sécurité Kubernetes (toujours chargé par Claude)
- `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `deploy/CLAUDE.md` : règles détaillées, chargées seulement quand Claude travaille dans le dossier (fusionnées dans le fichier racine si le dossier est `.`)
- `.claude/settings.json` : permissions (lecture autorisée hors prod, écritures soumises à validation, `delete` et prod refusés). Fusionné avec l'existant, rien n'est retiré.
- `.md-claude.json` : les réponses, à commiter. Relancer l'outil les propose par défaut.

Dans chaque `CLAUDE.md`, tout ce qui suit la ligne `<!-- md-claude:manual … -->` est conservé lors des régénérations.

## Limite connue

Les règles de permission de Claude Code sont des préfixes. Le blocage de la production repose donc sur l'ordre `kubectl --context <ctx> -n <ns> <verbe>` imposé dans le CLAUDE.md. La vraie protection reste un kubeconfig/RBAC sans accès prod pour la session de Claude.
