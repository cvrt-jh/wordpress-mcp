# Standards TODO — wordpress-mcp
Audited against [Tier 2 checklist](https://github.com/cvrt-jh/standards/blob/main/standards/repo-checklist.md) on 2026-02-28.

## Missing Items
- [ ] **.env.example** — code references `WORDPRESS_SITE_URL`, `WORDPRESS_USERNAME`, `WORDPRESS_PASSWORD` via `process.env` but no `.env.example` is present
- [ ] **GitHub Actions CI** — `.github/workflows/ci.yml` missing (should lint, build, run `npm audit`)
- [ ] **Tagged releases** — no git tags present; adopt semver tagging (`v1.0.0` etc.)
- [ ] **CLAUDE.md** — project-specific agent instructions not present (gitignored, local only)
- [ ] **memory/MEMORY.md** — project memory file not present (gitignored, local only)
