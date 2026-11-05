# Git workflow

- `main` is the integration branch and must always build (`pnpm typecheck && pnpm lint && pnpm test`) and replay the reference run.
- Every track works on its own branch, ideally in its own worktree: `feat/<track>` (for example `feat/engine`, `feat/stage`, `feat/docs-pitch`, `feat/data-corpus`, `feat/forecasting`, `feat/persona-models`), `fix/<topic>` for repairs.
- Commits follow Conventional Commits with a scope: `feat(engine): coalition calculus over veto players`, `fix(web): palette mounted twice`, `docs(readme): run instructions`. One logical change per commit, imperative mood, body says why.
- Branches merge into `main` with `git merge --no-ff` after the checks pass, so each track stays visible in history.
- Never commit: `.env`, keys or tokens, raw PDFs, caches, full-text Stellungnahmen derivatives, training data, model weights, anything with a real person's name. Run the pre-push scan before every push: `git diff origin/main --name-only | xargs grep -lE "api[-_]?key|BEGIN (RSA|OPENSSH)"`, plus a look at new data files.
- No em dash (U+2014) anywhere: `git grep -n $'—'` must return nothing.
- `archive/prototype-checkpoints` holds the first checkpoint commits from before this workflow existed.
