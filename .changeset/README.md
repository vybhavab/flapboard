# Changesets

Run `pnpm changeset` for any user-facing package change.

Changeset files store release intent, not the final package version. `pnpm
version` consumes pending changesets, updates `package.json`, writes
`CHANGELOG.md`, and removes the consumed files.

For the first stable release, a `major` changeset from `0.1.0` maps to `1.0.0`.
