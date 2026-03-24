---
name: release
description: Create a versioned release — bump version, update CHANGELOG.md, tag, push, create GitHub release. Usage: /release [patch|minor|major]
user-invocable: true
---

# Release

Create a versioned release for pilgrim-viewer.

## Usage

`/release patch` — bug fixes (0.1.0 → 0.1.1)
`/release minor` — new features (0.1.0 → 0.2.0)
`/release major` — breaking changes (0.1.0 → 1.0.0)

Default: `patch` if no argument given.

## Steps

### 1. Pre-flight checks

Run all quality gates. If ANY fail, STOP and fix before releasing.

```bash
npm run typecheck
npm test
npm run build
```

Also verify:
- Working tree is clean (`git status` — no uncommitted changes)
- On the `main` branch
- Up to date with remote (`git fetch origin main && git rev-list HEAD..origin/main --count` returns 0)

If any check fails, tell the user what's wrong and stop.

### 2. Determine version

Read current version from `package.json`. Apply the bump type (patch/minor/major).

Show: "Releasing v{new_version} (was v{old_version})"

### 3. Generate changelog entry

Get commits since the last tag:

```bash
git log $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --oneline --no-merges
```

Parse each commit and categorize by conventional commit prefix:

**Categories (in this order, skip empty ones):**
- `feat:` → **Added**
- `fix:` → **Fixed**
- `chore:` / `refactor:` / `perf:` → **Changed**

**Filtering rules:**
- SKIP commits that are only about CI/CD, docs, or plans (prefixed with `chore: ` that mention "plan", "spec", "workflow")
- SKIP merge commits
- SKIP commits that only modify files in `docs/` or `.github/`
- Keep the message concise — strip the prefix, capitalize first letter
- Remove "Co-Authored-By" lines

**Format:**

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- Feature description
- Feature description

### Fixed
- Fix description

### Changed
- Change description
```

### 4. Update CHANGELOG.md

Read `CHANGELOG.md`. Insert the new entry AFTER the header (after the "adheres to Semantic Versioning" line) and BEFORE any previous entries. Preserve all existing content.

### 5. Update package.json

Update the `version` field in `package.json`.

### 6. Commit, tag, push

```bash
git add package.json CHANGELOG.md
git commit -m "release: v{version}"
git tag -a "v{version}" -m "Release v{version}"
git push origin main
git push origin "v{version}"
```

The push to main triggers `.github/workflows/deploy.yml` which builds and deploys to GitHub Pages. The tag is used for the GitHub release.

### 7. Create GitHub release

Use the changelog entry (without the `## [X.Y.Z]` header) as the release body:

```bash
gh release create "v{version}" --title "v{version}" --notes "{release_notes}"
```

### 8. Verify deployment

```bash
gh run list --limit 1 --workflow=deploy.yml
```

Show the user:
- Version: v{version}
- GitHub release URL
- Deploy workflow status
- Changelog entry preview
