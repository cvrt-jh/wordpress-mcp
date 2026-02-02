# Registry Submissions

Status of wordpress-mcp registry submissions.

---

## Submission Status

| Registry | Status | Link |
|----------|--------|------|
| npm | **Published** | [@cavort-it-systems/wordpress-mcp](https://www.npmjs.com/package/@cavort-it-systems/wordpress-mcp) |
| GitHub Releases | **Published** | [v1.0.0](https://github.com/cvrt-jh/wordpress-mcp/releases/tag/v1.0.0) |
| Official MCP Registry | **Published** | io.github.cvrt-jh/wordpress-mcp |
| mcpservers.org | Pending | Submit below |

---

## mcpservers.org Submission

Submit at: https://mcpservers.org/submit

**Form values:**

| Field | Value |
|-------|-------|
| Server Name | wordpress-mcp |
| Short Description | Lightweight WordPress MCP server with 42 tools. Token-optimized responses reduce REST API verbosity by 95%+. Posts, pages, users, plugins, themes, media, taxonomies, comments. |
| Link | https://github.com/cvrt-jh/wordpress-mcp |
| Category | productivity |
| Contact Email | jh@cavort.de |

---

## Completed Checklist

- [x] GitHub topics added (9 topics)
- [x] package.json configured for npm
- [x] README with badges and install instructions
- [x] Published to npm v1.0.0
- [x] GitHub release v1.0.0
- [x] Official MCP Registry published
- [ ] mcpservers.org submitted

---

## Installation

```bash
npx @cavort-it-systems/wordpress-mcp
```

## Configuration

```bash
claude mcp add wordpress \
  -e WORDPRESS_SITE_URL=https://example.com \
  -e WORDPRESS_USERNAME=admin \
  -e WORDPRESS_PASSWORD="xxxx xxxx xxxx xxxx" \
  -- npx @cavort-it-systems/wordpress-mcp
```
