
# Scoutarr — Claude Guidelines

Scoutarr is a self-hosted web app that automates upgrade searching in Radarr, Sonarr, Lidarr, and Readarr. It syncs media libraries from Starr app APIs, stores them locally in SQLite, and lets users trigger or schedule automated upgrade searches.

---

## Stack

| Layer | Library |
|-------|---------|  
| Framework | Vite 7 + React 19 |
| Language | TypeScript 5 — strict mode |
| UI | Radix UI Themes (`@radix-ui/themes`) + Tailwind v4 |
| Icons | `@radix-ui/react-icons` |
| Data fetching | `@tanstack/react-query` v5 |
| Grid | `react-data-grid` |
| Monorepo | npm workspaces (`shared` / `frontend` / `backend`) |
| Backend | Express 5 + TypeScript |
| Database | `better-sqlite3` (raw SQL, no ORM) |
| Scheduler | `node-cron` |
| Logging | `winston` |

---

## ⛔ HARD RULES — NON-NEGOTIABLE, NO EXCEPTIONS

These are absolute constraints. They are **not suggestions**. They cannot be skipped because a task seems simple, because requirements appear obvious, or because context has already been gathered. Violating any of these rules is always wrong.

1. **Load relevant skills before any implementation.** Check the Skills table first. Load every skill that applies using `read_file`. If no skill matches, use `find-skills` before proceeding. Reading a skill partially does not count — read it in full.

2. **Always run the full `brainstorming` skill process before writing any code.** This means: explore context → ask clarifying questions → propose approaches → present design → get user approval → write spec doc → spec review loop → user approves spec → invoke `writing-plans`. Every step is mandatory. Receiving a single answer to one question does not satisfy this. There are no exceptions for "simple" tasks.

3. **Never write implementation code until `writing-plans` has produced an approved plan.** The brainstorming skill terminates by invoking `writing-plans`. Implementation only begins after that plan is approved.

4. **No DRY violations.** Extract shared logic before duplicating.

5. **Cleanest implementation.** Fewest moving parts. No future-proofing.

6. **Consistency.** New code must match existing conventions — data fetching, error handling, naming, structure.

7. **Follow Radix UI Themes conventions.** All UI must use `@radix-ui/themes` components (`Box`, `Flex`, `Card`, `Button`, `Text`, `Badge`, etc.) and their props. Do not mix in custom div/span wrappers where a Radix component exists. When in doubt, read the `shadcn` skill for component patterns.

8. **Every task in a plan must name its skills.** Each task block must contain a `**Skills:**` field listing every applicable skill from the table below, and a `Load skills` first step instructing the worker to read those skills in full. Use `none` only when no skill applies (and omit the load step in that case). Plans that skip this are invalid.

---

## Scripts

```bash
npm run dev            # start frontend + backend dev servers concurrently
npm run dev:frontend   # Vite dev server only (port 7291)
npm run dev:backend    # tsx watch backend only (port 5839)
npm run build          # production build: shared → frontend → backend
npm run start          # production start (backend only)
```

---

## Docker (dev)

- Dev image: `node:22-alpine` with `python3 make g++` added via `apk` (needed to compile `better-sqlite3`).
- Named Docker volumes for `node_modules` and `dist` outputs persist across restarts — no rebuild on source change.
- If switching Node.js major versions, wipe volumes: `docker compose -f docker-compose.dev.yml down -v`.
- Ports (dev): backend API `5840→5839`, Vite dev server `7291→7291`.
- Ports (prod): `5839`.
- Mounts (dev): source files for hot reloading, `./config:/app/config` for the SQLite DB and settings.

---

## Skills

| Task | Skill |
|------|-------|
| Planning / feature design | `brainstorming` |
| Writing implementation plans | `writing-plans` |
| UI components / Radix UI Themes | `shadcn` |
| Tailwind CSS v4 / design tokens | `tailwind-design-system` |
| Node.js / Express backend patterns | `nodejs-backend-patterns` |
| TypeScript + React code review | `typescript-react-reviewer` |
| Docker / Dockerfile optimisation | `multi-stage-dockerfile` |
| Find a skill for any other task | `find-skills` |
