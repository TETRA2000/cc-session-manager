# Project Structure

## Organization Philosophy

Layered architecture with clear backend/frontend separation. Backend follows a **routes → services** pattern where routes handle HTTP concerns and delegate to services for business logic. Frontend is a flat component-based SPA with shared utilities.

## Directory Patterns

### Backend entry (`main.ts`, `src/server.ts`, `src/config.ts`)
**Purpose**: Application bootstrap — CLI parsing, config loading, Hono app creation, `Deno.serve` startup.
**Pattern**: `main.ts` is the entry point; `server.ts` wires routes and static serving; `config.ts` resolves CLI args and env vars into `AppConfig`.

### Routes (`src/routes/`)
**Purpose**: HTTP request handling — parse params, call services, return JSON responses.
**Pattern**: Each file exports a factory function `xxxRoutes(config: AppConfig): Hono` that returns a Hono sub-app. All route sub-apps are mounted in `api.ts`.
**Example**: `dashboardRoutes(config)` → `GET /api/dashboard`

### Services (`src/services/`)
**Purpose**: Business logic — data parsing, discovery, launching, summarization.
**Pattern**: Pure functions and async helpers. No HTTP concerns. Services receive config or paths as parameters, not Hono context.
**Example**: `session-parser.ts` exports `parseSessionMetadata()`, `parseTranscript()`, `getSessionFiles()`

### Types (`src/types.ts`)
**Purpose**: All TypeScript interfaces in one file — raw JSONL types, API response types, config, request/result types.
**Pattern**: Grouped by domain with comment separators (`// ─── Raw JSONL line types ───`).

### Frontend SPA (`static/`)
**Purpose**: Client-side application served as static files. No build step.
**Files**: `index.html` (shell + importmap), `app.js` (root component + routing), `style.css` (all styles).

### Frontend components (`static/components/`)
**Purpose**: Preact components using htm tagged templates.
**Pattern**: One component per file, named by feature (e.g., `dashboard.js`, `projects.js`, `transcript.js`). Components export a single named function.
**Example**: `export function DashboardView() { ... }` using `html\`<div>...</div>\``

### Frontend utilities (`static/lib/`)
**Purpose**: Shared client-side logic — API client, router, formatting.
**Pattern**: `api.js` wraps `fetch` calls; `router.js` provides hash-based routing with signals; `format.js` has display helpers.

### Tests (`tests/`)
**Purpose**: Unit and integration tests.
**Pattern**: `<service-name>.test.ts` mirrors service files. `api.test.ts` covers route integration. `fixtures/` holds test JSONL data.

## Naming Conventions

- **Backend files**: `kebab-case.ts` (e.g., `session-parser.ts`, `project-discovery.ts`)
- **Frontend files**: `kebab-case.js` (e.g., `session-row.js`, `stat-card.js`)
- **Components**: PascalCase exports (e.g., `DashboardView`, `SessionRow`, `StatCard`)
- **Route factories**: `camelCaseRoutes` (e.g., `dashboardRoutes`, `projectRoutes`)
- **Service functions**: `camelCase` (e.g., `parseSessionMetadata`, `getSessionFiles`)
- **Types/Interfaces**: PascalCase (e.g., `SessionSummary`, `AppConfig`)
- **Test files**: `<module>.test.ts`

## Import Organization

```typescript
// Backend: JSR imports first, then relative
import { Hono } from "hono";
import type { AppConfig } from "../types.ts";
import { parseSessionMetadata } from "../services/session-parser.ts";
```

```javascript
// Frontend: CDN imports first, then relative with .js extension
import { html } from "htm/preact";
import { signal } from "@preact/signals";
import { navigate } from "./lib/router.js";
```

**Key rules**:
- Backend imports always include `.ts` extension (Deno convention)
- Frontend imports always include `.js` extension (browser ES modules)
- No path aliases — all imports are relative or bare specifiers from importmap/deno.json

## Code Organization Principles

1. **Routes are thin** — Extract params, call service, return response. No business logic in route handlers.
2. **Services are pure** — Accept config/paths as args, return data. No Hono or HTTP knowledge.
3. **Types are centralized** — Single `src/types.ts` file for all shared interfaces, organized by domain.
4. **Frontend has no build step** — Components are plain `.js` with htm. No transpilation, no bundling.
5. **Config flows down** — `AppConfig` is created once in `main.ts` and threaded through route/service factories.
