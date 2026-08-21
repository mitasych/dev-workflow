# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.1] - 2026-08-21 Aleksandr Mitasov <oleksandr.mitasov@wiz-team.com>

### Added

- Conventional Commits support in `/workflow-commit`, `/workflow-commit-dev`, and
  `/workflow-release`: each skill detects a commitlint config or matching repo history and
  offers `type(scope): description` formatting, with the Task ID as the scope, `!` +
  `BREAKING CHANGE:` footer support for breaking changes, and a stateless prompt fallback
  when no convention is detected.

### Fixed

- Commit-style detection no longer infers house style from non-conventional history alone.
  The prior check used an absolute count of conventional subjects out of the last 20, which
  could never trigger in a repo with fewer than 12 commits — a young repo whose every commit
  was a valid Conventional Commit would have hit the prompt forever. Replaced with a
  percentage-of-returned-subjects threshold (60%) and a minimum-sample floor (under 3 commits,
  no signal either way).
