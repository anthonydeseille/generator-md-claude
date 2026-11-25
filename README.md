# generator-md-claude

Interactive `CLAUDE.md` generator for **Spring Boot / Angular / Kubernetes** projects.

## Usage

```bash
npx github:anthonydeseille/generator-md-claude
```

To pin a version: `npx github:anthonydeseille/generator-md-claude#<tag-or-commit>`.

Run it at the root of your project. Options:

| Option | Effect |
|---|---|
| `-y`, `--skip-prompts` | regenerate from `.md-claude.json` without questions |
| `-f`, `--force` | overwrite existing files without asking |
| `--dry-run` | print the result without writing anything |

The latest Spring Boot, Java and Angular versions are fetched from Spring Initializr and the npm registry when the questionnaire starts (static fallback lists when offline).

## Supported layouts

| Layout | What the generator adds |
|---|---|
| Monorepo | one CLAUDE.md per directory; "API change and frontend update in the same PR" rule |
| Backend-only repository | link to the frontend repository; any API contract change is breaking: backward compatibility or versioning |
| Frontend-only repository | link to the backend repository; client generated from a remote OpenAPI spec; no invented endpoints |
| Infrastructure-only repository | images built elsewhere, immutable tags, migrations run by a Job |

In every case you can say where deployment lives: in the repository, in a separate infrastructure repository, or nowhere yet. Operations rules (kube contexts, HA, ShedLock…) are added even when the infrastructure lives elsewhere.

## Generated files

- `CLAUDE.md`: overview, commands, git conventions, Kubernetes safety rules (always loaded by Claude).
- `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `deploy/CLAUDE.md`: detailed rules, loaded only when Claude works in that directory (merged into the root file when the directory is `.`).
- `.claude/settings.json`: permissions (read access outside production, writes require approval, `delete` and production denied). Merged with any existing file; nothing is removed.
- `.claude/commands/bootstrap.md`: the `/bootstrap [backend|frontend|deploy]` command, to run once in Claude Code. It scaffolds the skeleton with Spring Initializr and the Angular CLI, then adds what Initializr does not provide (springdoc, MapStruct, ArchUnit, Spotless, Jib, ShedLock…). Versions come from Initializr and Maven Central, never from Claude’s memory. It overwrites nothing and deploys nothing. At the end of the questionnaire, if the project is not scaffolded yet, the generator offers to open Claude Code with `/bootstrap` directly.
- `.md-claude.json`: your answers, to commit. Running the tool again offers them as defaults.

In every `CLAUDE.md`, everything below the `<!-- md-claude:manual … -->` line is kept when regenerating.

## Known limitation

Claude Code permission rules are prefix matches. Blocking production therefore relies on the `kubectl --context <ctx> -n <ns> <verb>` order enforced in CLAUDE.md. The real safeguard remains a kubeconfig/RBAC with no production access for Claude’s session.
