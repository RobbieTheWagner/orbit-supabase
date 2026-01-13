# CI/CD Documentation

This document describes the continuous integration and deployment setup for orbit-supabase.

## GitHub Actions Workflows

### CI Workflow (`.github/workflows/ci.yml`)

Runs on every push to `main` and on all pull requests.

**Jobs:**

1. **Test & Lint**
   - Runs on Node.js 22.x
   - Steps:
     - Type checking with TypeScript (`pnpm run typecheck`)
     - Code formatting check with Prettier (`pnpm run format:check`)
     - Linting with ESLint (`pnpm run lint`)
     - Unit tests (`pnpm test`)
     - Coverage report (`pnpm run test:coverage`)
     - Uploads coverage to Codecov (optional)

2. **Build**
   - Verifies the package builds successfully
   - Checks that all expected output files are generated:
     - `dist/index.js` (CommonJS)
     - `dist/index.mjs` (ESM)
     - `dist/index.d.ts` (TypeScript declarations)

### Publish Workflow (`.github/workflows/publish.yml`)

Automatically publishes to npm when a GitHub release is created.

**Requirements:**
- `NPM_TOKEN` secret must be configured in repository settings
- Release must be published (not draft)

**Steps:**
1. Runs full test suite
2. Builds the package
3. Publishes to npm registry

### Dependabot (`.github/dependabot.yml`)

Automatically creates PRs for dependency updates:
- **npm dependencies**: Weekly updates, grouped by type
  - `@orbit/*` packages grouped together
  - Dev dependencies (minor/patch) grouped together
- **GitHub Actions**: Weekly updates for action versions

## Local Development

Before pushing code, ensure all CI checks pass locally:

```bash
# Run all checks
pnpm run typecheck && \
pnpm run format:check && \
pnpm run lint && \
pnpm test && \
pnpm run build

# Or run individually
pnpm run typecheck      # Type checking
pnpm run format:check   # Check formatting
pnpm run format         # Fix formatting
pnpm run lint           # Check linting
pnpm run lint:fix       # Fix linting issues
pnpm test               # Run tests
pnpm run test:watch     # Run tests in watch mode
pnpm run test:coverage  # Generate coverage report
pnpm run build          # Build package
```

## Required Secrets

To enable all features, configure these secrets in GitHub repository settings:

### Required for Publishing
- `NPM_TOKEN`: npm authentication token for publishing packages
  - Get from https://www.npmjs.com/settings/[username]/tokens
  - Requires "Automation" or "Publish" token type

### Optional for Coverage
- `CODECOV_TOKEN`: Token for uploading coverage reports to Codecov
  - Get from https://codecov.io/gh/RobbieTheWagner/orbit-supabase
  - Not required for CI to pass

## Branch Protection

Recommended branch protection rules for `main`:

- ✅ Require pull request reviews before merging
- ✅ Require status checks to pass before merging
  - `Test & Lint`
  - `Build`
- ✅ Require branches to be up to date before merging
- ✅ Require linear history (optional)

## Publishing Releases

To publish a new version:

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Commit changes: `git commit -am "Release v0.x.x"`
4. Create git tag: `git tag v0.x.x`
5. Push with tags: `git push --follow-tags`
6. Create GitHub release from the tag
7. Publish workflow will automatically publish to npm

Alternatively, use `npm version`:

```bash
npm version patch  # 0.1.0 -> 0.1.1
npm version minor  # 0.1.0 -> 0.2.0
npm version major  # 0.1.0 -> 1.0.0
git push --follow-tags
```

Then create a GitHub release from the new tag.

## Troubleshooting

### CI Fails on Linting
```bash
pnpm run lint:fix
git add -A
git commit --amend --no-edit
git push --force-with-lease
```

### CI Fails on Formatting
```bash
pnpm run format
git add -A
git commit --amend --no-edit
git push --force-with-lease
```

### Tests Fail Locally but Pass in CI (or vice versa)
- Ensure your Node.js version matches CI (22.x)
- Run `pnpm install` to sync dependencies
- Check for uncommitted changes

### Build Output Missing
- Run `pnpm run build` locally
- Check `dist/` directory for expected files
- Verify `tsup` is installed: `pnpm list tsup`
