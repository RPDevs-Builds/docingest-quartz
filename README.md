# docingest-quartz

> A comprehensive [Quartz v5](https://quartz.jzhao.xyz/) component plugin that embeds a 1:1 reproduction of the **DocIngest** documentation crawler and searchable corpus viewer directly into your digital garden or static portfolio.

[![npm version](https://img.shields.io/npm/v/docingest-quartz.svg)](https://www.npmjs.com/package/docingest-quartz)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

---

## ◈ Features

* **URL Ingestion Dashboard (`DocIngestAdd`)**:
  * Live URL validation with automatic include-pattern suggestion.
  * Configurable wildcards (`/docs/*`, `*/v1/*`) and max page limits.
  * Direct crawl job initiation against the DocIngest backend API.
  * Real-time progress bar, discovered/completed metrics, and live terminal telemetry streaming.
  * Grid of recently indexed documentation repositories.
  * Automatically handles the `POST /docs/save` lifecycle when crawling completes.

* **Searchable Corpus Viewer (`DocIngestView`)**:
  * Instant full-text search against the indexed documentation database.
  * In-modal raw Markdown preview.
  * One-click "Copy Context" with animated clipboard feedback (ideal for AI prompt grounding).
  * Direct `.md` file download.
  * Clean pagination ("Load More") support.

* **Standalone & Theme-Aware**:
  * Built using Preact with zero external runtime dependencies.
  * Adapts cleanly to dark mode palettes (including custom Sovereign / ANSI themes).
  * Seamless SPA navigation support via Quartz's `nav` event lifecycle.

---

## ◈ Installation

Install the package in your Quartz repository:

```bash
npm install docingest-quartz
```

or link locally:

```bash
npm install /path/to/docingest-quartz
```

---

## ◈ Quartz Configuration

Add `DocIngestAdd` and `DocIngestView` to your `quartz.config.yaml` or `quartz.config.ts`:

```yaml
plugins:
  # ... transformers, filters, emitters ...

  # UI Components
  - source: "docingest-quartz"
    component: "DocIngestAdd"
    enabled: true
    options:
      apiUrl: "https://docingest.yourdomain.com/api"
    layout:
      position: beforeBody
      priority: 12

  - source: "docingest-quartz"
    component: "DocIngestView"
    enabled: true
    options:
      apiUrl: "https://docingest.yourdomain.com/api"
    layout:
      position: beforeBody
      priority: 13
```

---

## ◈ Usage in Content Markdown

Create two markdown pages in your Quartz `content/` folder:

### 1. Ingestion Page (`content/tools/docingest/add.md`)
```markdown
---
title: "DocIngest URL Ingestion"
docingest: "add"
aliases:
  - "/tools/docingest/add"
  - "/add"
---

# Ingest Documentation

Submit documentation URLs below to crawl and index into your searchable Markdown corpus.
```

### 2. Corpus Explorer Page (`content/tools/docingest/view.md`)
```markdown
---
title: "Documentation Corpus Viewer"
docingest: "view"
aliases:
  - "/tools/docingest/view"
  - "/view"
---

# Search Documentation

Search, preview, copy context, or download indexed documentation trees.
```

---

## ◈ API Contract

The plugin expects a DocIngest backend exposing standard REST endpoints:
* `POST /crawl/start` - Initiate crawl with `{ url, limit, maxDepth, scrapeOptions, includePaths, excludePaths }`
* `GET /crawl/status/:id` - Poll active crawl status
* `POST /docs/save` - Persist completed documentation tree
* `GET /docs/list` - Return paginated list of indexed documents
* `GET /docs/fullsearch?q=:query` - Full-text search
* `GET /docs/content?domain=:domain` - Return raw markdown
* `GET /docs/download?domain=:domain` - Trigger file download

---

## ◈ Building from Source

```bash
cd docingest-quartz
npm install
npm run build
```

---

## ◈ License
MIT © Richard P. Dissell (RPDev)
