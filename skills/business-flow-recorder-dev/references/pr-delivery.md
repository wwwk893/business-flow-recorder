# PR Delivery and Repository Operations

Load this reference when creating branches, opening PRs, merging, renaming repo
metadata, or checking GitHub CI for `business-flow-recorder`.

## Branch Setup

Prefer a clean main base:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c codex/<short-topic>
```

If the current branch contains useful work, inspect before switching. Do not
reset or clean without explicit user approval.

## Commit Hygiene

Before staging:

```bash
git status --short
git diff --stat
```

Stage only relevant files. In this repo, watch for unrelated local artifacts:

```text
local zip archives
ad-hoc process-doc folders
generated test-results or raw replay artifacts
temporary screenshots, traces, or downloaded attachments
```

Commit messages should identify the layer:

```text
fix(recorder): ...
fix(replay): ...
fix(flow): ...
docs: ...
test: ...
refactor: ...
```

## PR Body Template

Use a concise PR body:

```md
## Summary
- ...

## Validation
- git diff --check
- npm run test:crx:business-flow:l1
- npm run build:crx
- npm run build:examples:recorder
- npm run build:tests
- npm run test:crx:business-flow:l2 -- --reporter=line --global-timeout=1200000
- npm run test:crx:business-flow:l3 -- --reporter=line --global-timeout=1200000

## Notes
- Scope guards / non-goals
- Follow-up issue links, if any
```

Omit validation lines that were not actually run.

## GitHub Checks

After pushing:

```bash
gh pr create --draft --title "<title>" --body-file <file>
gh pr view <number> --json number,title,state,isDraft,mergeable,headRefName,url
gh pr checks <number> --watch --interval 10
```

If checks remain pending for a long time, inspect the run:

```bash
gh run view <run-id> --json status,conclusion,event,workflowName,createdAt,updatedAt,url,headBranch,headSha
gh run view <run-id> --log-failed
```

Report `pending`, `in_progress`, `pass`, or `fail` explicitly. Do not imply CI
passed before it does.

## Merge Flow

Before merge:

```bash
gh pr checks <number>
gh pr view <number> --json state,isDraft,mergeable
```

After merge:

```bash
git switch main
git pull --ff-only origin main
git status --short --branch
```

Then continue the next issue from fresh `main`.

## Repo Rename / Metadata

When renaming repository metadata or updating GitHub About:

```bash
gh repo rename business-flow-recorder --yes
git remote set-url origin https://github.com/<owner>/business-flow-recorder.git
gh repo edit <owner>/business-flow-recorder --description "<description>"
gh repo view <owner>/business-flow-recorder --json nameWithOwner,url,isFork,parent,description
git remote -v
```

Do not rename npm package, import paths, extension display name, or workspace
folder unless the user explicitly asks. Treat those as separate PRs because
they can affect CI, docs, and local clones.

Do not record concrete local checkout paths or machine-specific locations in
durable docs or skills. Prefer placeholders such as `<repo-root>`,
`<owner>/<repo>`, and commands based on `git rev-parse --show-toplevel`.

## Follow-up Issues

Do not leave known risks only in PR bodies. A follow-up issue should include:

```text
problem statement
affected layer
minimal repro or evidence artifact
acceptance criteria
required L1/L2/L3 validation
```

If a known flaky path is accepted, link the issue from the PR and explain why it
does not block the current scope.
