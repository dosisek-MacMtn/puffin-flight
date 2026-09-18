# Vendored skill: security-audit

This directory is a vendored copy of Cloudflare's `security-audit` coding-agent skill,
committed here so it loads automatically for anyone running Claude Code in this repository.

| | |
|---|---|
| Upstream | https://github.com/cloudflare/security-audit-skill |
| Upstream path | `skills/security-audit/` |
| Commit | `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8` (2026-09-14, "Clarify guidance and full audit modes") |
| License | MIT, Copyright (c) 2025-2026 Cloudflare, Inc. — see `LICENSE` in this directory |

## Local modifications

One, kept deliberately small so upstream updates stay easy to merge:

- `SKILL.md` — added a "Mapping for Claude Code (local addition)" subsection under
  "Platform terminology", mapping the skill's agent-neutral roles onto this platform
  (`Agent` tool, `Explore` / `general-purpose` subagent types, validator invocation, and the
  absence of an OS-enforced sandbox in a normal Claude Code session).

Every other file is byte-identical to upstream.

## How it behaves

The skill has two modes, decided by the request, not by loading it:

- **Guidance mode** (default) — security questions, focused reviews, triage. No output
  directory, no audit artifacts.
- **Full audit mode** — only for an explicit "audit / pen-test this codebase", a full or
  end-to-end review, or a request for the report artifacts. Runs all six phases and writes
  `run-metadata.json`, `architecture.md`, `coverage-ledger.json`, `findings.json`, `REPORT.md`,
  `FINDINGS-DETAIL.md`, and `NEEDS-VALIDATION.md` to an output directory **outside** this repo
  (default `~/security-audit-skill/<repo-name>/run-<N>`).

Nothing about this skill authorizes touching deployed infrastructure. It is source-first and
read-only; it does not probe live endpoints, AWS accounts, or any Gaiia environment.

## Updating

```sh
git clone --depth 1 https://github.com/cloudflare/security-audit-skill /tmp/sa
cp /tmp/sa/skills/security-audit/* .claude/skills/security-audit/
cp /tmp/sa/LICENSE .claude/skills/security-audit/LICENSE
# then re-apply the SKILL.md mapping subsection above and update the commit row in this file
```

## Self-test

The validators are zero-dependency Node scripts and ship with their own tests:

```sh
node .claude/skills/security-audit/validate-findings.test.cjs
node .claude/skills/security-audit/validate-coverage-ledger.test.cjs
```
