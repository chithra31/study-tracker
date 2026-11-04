# Study Progress Tracker

A full-stack app where learners track study goals and the topics under them. A topic **unlocks only when its prerequisite topics are complete**, and every goal shows its progress. Mentors can view any learner's goals and also act as the admin for configuration.

Built for the one-week full-stack project brief ("Study Progress Tracker with Prerequisite Rules").

| | |
|---|---|
| **Frontend** | Angular 22 (standalone components, signals), Chart.js |
| **Backend** | NestJS 12, TypeScript |
| **Database** | PostgreSQL, accessed through Prisma 7 |
| **Auth** | JWT, with roles enforced by server-side guards |
| **Extra** | AI-written weekly review using the Claude API (with an offline fallback) |

---

## Contents

1. [Features](#features)
2. [Setup (from a clean machine)](#setup-from-a-clean-machine)
3. [Running the tests](#running-the-tests)
4. [Architecture](#architecture)
5. [Data model](#data-model)
6. [Business rules and design decisions](#business-rules-and-design-decisions)
7. [API reference](#api-reference)
8. [AI weekly review](#ai-weekly-review)
9. [Project structure](#project-structure)
10. [Assumptions and limitations](#assumptions-and-limitations)

---

## Features

**Baseline**
- **Two roles, enforced on the server.** A learner can read and edit only their own goals. A mentor can view any learner's goals (read-only) and manages configuration.
- **Goals and topics.** A goal has topics, and each topic can list prerequisite topics. A prerequisite that points at the topic itself, or that would create a loop (direct or indirect), is rejected.
- **Session log** with date, topic, minutes and a note. Minutes must be within the configured minimum and maximum (default 5 to 480), and the date cannot be in the future.
- **Unlock rule in code.** A topic stays locked until all its prerequisites are complete, and the UI shows which prerequisites are still missing.
- **Progress view per goal:** percent of topics complete, total minutes logged, and a bar chart of minutes per week.
- **Admin-configurable values** used directly in the business logic: minimum and maximum minutes per session, and the maximum number of prerequisites per topic. Changing one changes behaviour on the next request, with no code change or restart.
- **Seed data:** 3 goals, 12 topics with prerequisites, and 30 sessions spread over six weeks.

**Extra**
- **Weekly review:** a summary of the week and a suggested study plan, written by Claude. Without an API key (or if the API fails), a deterministic rule-based review is used instead.

---

## Setup (from a clean machine)

### Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 22 or newer | `node --version` |
| PostgreSQL | 15 or newer, running locally | `psql --version` |
| Git | any recent version | `git --version` |

Docker is **not** required. You only need a running local PostgreSQL server and its `postgres` user password.

### 1. Get the code

```bash
git clone <repo-url> study-tracker
cd study-tracker
```

### 2. Create the database

```bash
psql -U postgres -h localhost -c "CREATE DATABASE study_tracker;"
```

(It asks for your PostgreSQL password.)

### 3. Set up the backend

```bash
cd backend
npm install
cp .env.example .env
```

Open `backend/.env` and set your PostgreSQL password in `DATABASE_URL`, and any long random string for `JWT_SECRET`. On Windows PowerShell, use `copy .env.example .env` instead of `cp`.

Then create the tables and load the seed data:

```bash
npm run db:setup
```

This runs `prisma generate`, applies the migration, and runs the seed script. You can re-run just the seed at any time with `npm run db:seed`, which resets the data to the original state.

Start the API (http://localhost:3000):

```bash
npm run start:dev
```

### 4. Set up the frontend

In a second terminal:

```bash
cd frontend
npm install
npx ng serve
```

Open **http://localhost:4200**. If Angular asks about sharing usage data, answer `n`.

> The frontend calls the API at `http://localhost:3000` (set in `frontend/src/app/api.service.ts`), and the API allows requests from `http://localhost:4200`. If either port is busy, stop whatever is using it first.

### Demo accounts

All use the password `Password123!`.

| Email | Role | Notes |
|---|---|---|
| `alice@example.com` | Learner | Goals: "Learn TypeScript" and "Master SQL" |
| `bob@example.com` | Learner | Goal: "Web Fundamentals" |
| `mentor@example.com` | Mentor / admin | Can view every learner's goals and open the Configuration page |

### Optional: enable the AI weekly review

Add your key to `backend/.env` and restart the backend:

```
ANTHROPIC_API_KEY="sk-ant-..."
```

Never commit this file. `.env` is in `.gitignore`.

### Quick tour (2 minutes)

1. Sign in as **alice**, open **Learn TypeScript**. "Advanced Types" is **Locked** and shows "Still missing: Generics".
2. Click **Mark complete** on "Generics". "Advanced Types" unlocks.
3. Click **Reopen** on "Basic Types". Everything that depends on it, directly or indirectly, locks again and progress drops. Mark it complete again to restore it.
4. Open **Prerequisites** on a topic and try to make "Basic Types" depend on "Advanced Types". The server rejects it as a circular dependency.
5. Sign in as **mentor**. Goals are read-only. Open **Configuration**, set the maximum session minutes to 60, then sign in as a learner and try to log 90 minutes. It is rejected immediately.

---

## Running the tests

The suite has **62 automated tests**.

```bash
cd backend

npm test            # 39 unit tests, no database needed
npm run test:e2e    # 23 end-to-end API tests
```

- **Unit tests** cover the pure business logic: the unlock rule, re-locking, cycle detection, the prerequisite limit, session validation, week bucketing, progress calculation, and the weekly-review logic.
- **End-to-end tests** start the real Nest app and call it over HTTP with real JWTs against PostgreSQL. They cover login, role enforcement (403s), config-driven behaviour, the full lock / unlock / re-lock flow, session validation, progress, and the review endpoint.

The e2e tests need the database to be set up and seeded first (`npm run db:setup`) and `backend/.env` to exist. The API does not have to be running. Each e2e run creates its own goal, deletes it afterwards, and restores any configuration it changed, so your seed data is left intact.

> `npm test` and `npm run test:e2e` use Node's `--experimental-vm-modules` flag (already in the npm scripts) because NestJS 12 is published as ES modules. The warning it prints is harmless.

---

## Architecture

```
┌───────────────────────┐   HTTPS/JSON + JWT    ┌─────────────────────────────┐        ┌────────────┐
│  Angular SPA          │ ────────────────────► │  NestJS REST API            │ ─────► │ PostgreSQL │
│  localhost:4200       │ ◄──────────────────── │  localhost:3000             │ Prisma │            │
│  signals, Chart.js    │                       │  guards · services · logic  │        └────────────┘
└───────────────────────┘                       └──────────────┬──────────────┘
                                                               │ optional
                                                               ▼
                                                        Claude API (weekly review)
```

### Backend layers

Each feature module follows the same shape: **controller** (HTTP, validation) → **service** (database and rules) → **pure logic** (no I/O).

| Module | Responsibility |
|---|---|
| `auth` | Login, JWT strategy, **global `JwtAuthGuard`** (every route needs a token unless marked `@Public()`) and **global `RolesGuard`** (enforces `@Roles()`) |
| `common` | `AccessService` (ownership rules), `TopicViewService` (topics with derived lock status), `PrismaService` |
| `app-config` | Reads and updates the admin-configurable values **from the database on every call** |
| `goals` | Goal CRUD, per-goal list with progress, progress endpoint |
| `topics` | Topic CRUD, setting prerequisites, complete / reopen |
| `sessions` | Logging and listing study sessions |
| `review` | Weekly review (Claude call, validation, fallback) |

The business rules live in small **pure functions** so they can be unit-tested without a database:

- `topics/topic-logic.ts`: `computeTopicStates`, `wouldCreateCycle`, `findPrerequisiteError`
- `sessions/session-logic.ts`: `validateSession`, `weeklyMinutes`
- `goals/progress-logic.ts`: `summarizeProgress`
- `review/review-logic.ts`: `buildReviewContext`, `ruleBasedReview`, `sanitizeReview`

### Frontend

Standalone Angular components with signals. `api.service.ts` wraps all HTTP calls, `auth.ts` holds the session, the HTTP interceptor that attaches the JWT, and the route guards. Route guards in the UI are a convenience only: **the server is what enforces permissions**.

| Route | Screen |
|---|---|
| `/login` | Sign in |
| `/goals` | Goals with progress bars (a learner's own, or every learner's for a mentor) |
| `/goals/:id` | Progress and chart, weekly review, topics with lock status and prerequisites, session form and history |
| `/config` | Admin configuration (mentor only) |

---

## Data model

```
User ──< Goal ──< Topic ──< StudySession >── User
                   │  ▲
                   ▼  │
              TopicPrerequisite   (topic requires prerequisite)

Config   (key / value, independent)
```

| Table | Columns | Notes |
|---|---|---|
| `User` | `id`, `email` (unique), `name`, `passwordHash`, `role` (`LEARNER` / `MENTOR`) | Passwords are hashed with bcrypt |
| `Goal` | `id`, `title`, `description`, `ownerId` → User | Deleting a goal cascades to its topics and sessions |
| `Topic` | `id`, `goalId` → Goal, `title`, `completed`, `completedAt` | Only the stored `completed` flag is saved. Lock status is derived |
| `TopicPrerequisite` | `topicId` → Topic, `prerequisiteId` → Topic | Composite primary key. A directed edge: "topic requires prerequisite" |
| `StudySession` | `id`, `topicId` → Topic, `userId` → User, `date` (date only), `minutes`, `note` | |
| `Config` | `key` (primary key), `value` (int), `description` | `MIN_SESSION_MINUTES`, `MAX_SESSION_MINUTES`, `MAX_PREREQUISITES_PER_TOPIC` |

The schema is in `backend/prisma/schema.prisma` and the migration in `backend/prisma/migrations/`.

---

## Business rules and design decisions

**Lock status is derived, not stored.** It is computed on every read from the stored `completed` flags. A topic is *effectively complete* only if it is marked complete **and** all its prerequisites are effectively complete. A topic with any prerequisite that is not effectively complete is **LOCKED**. Because nothing is cached, reopening a topic automatically re-locks everything that depends on it, directly or transitively, and completing it again restores them. There is no cascade to forget and nothing that can get out of sync.

**A re-locked topic keeps its completed flag.** If a prerequisite is reopened, a dependent that was already complete shows as LOCKED but is not forgotten, so re-completing the prerequisite restores it. Progress counts only effectively complete topics, so the percentage drops while the dependent is re-locked.

**Locked topics cannot be completed or studied.** Completing a locked topic, or logging a session against one, is rejected with a message naming the missing prerequisites.

**Prerequisite validation** (on every change, server-side, in this order): no duplicates; not the topic itself; all from the same goal; not more than the configured maximum; no loop. Loop detection is a graph search from the proposed prerequisites: if it reaches the topic being edited, the change would create a cycle. This catches indirect loops (A→B→C→A), not only direct ones.

**Roles are enforced on the server.**
- Every route requires a valid JWT, except login.
- A learner gets `403` on another learner's goals, topics, and sessions.
- A mentor can read any learner's goal and progress, but gets `403` on any change to learner data. Mentors are read-only because the brief gives them viewing rights and admin rights for configuration, not editing rights.
- Only mentors can change configuration (`PUT /config`).

**Configuration is live.** The limits are read from the `Config` table on every request, with no caching and no restart. The mentor's Configuration page updates them. The server also validates the config itself (minimum at least 1, maximum not below the minimum, prerequisite limit 0 to 50).

**Dates are UTC calendar days.** Session dates are plain `YYYY-MM-DD` values, stored as a date without a time, and "not in the future" is compared against today's date in UTC. The date field in the UI defaults to today in UTC, so a user ahead of UTC cannot accidentally pick a date the server calls the future.

**Lowering the maximum prerequisites setting does not rewrite existing topics.** The limit is checked whenever a topic's prerequisites are set, so topics that already exceed a newly lowered limit are left as they are and are checked the next time they are edited.

---

## API reference

All routes except login need `Authorization: Bearer <token>`.

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/auth/login` | Public | Returns `{ accessToken, user }` |
| GET | `/auth/me` | Any | Current user |
| GET | `/users/learners` | Mentor | List learners |
| GET | `/config` | Any | Current limits |
| PUT | `/config` | Mentor | Update limits |
| GET | `/goals` | Any | Learner: own goals. Mentor: all (optional `?ownerId=`) |
| POST | `/goals` | Learner | Create a goal |
| GET | `/goals/:id` | Owner or mentor | Goal with topics, status and missing prerequisites |
| PATCH / DELETE | `/goals/:id` | Owner | Update or delete |
| GET | `/goals/:id/progress` | Owner or mentor | Percent complete, total minutes, minutes per week |
| POST | `/goals/:id/review` | Owner or mentor | Weekly review |
| POST | `/goals/:goalId/topics` | Owner | Add a topic |
| PATCH / DELETE | `/topics/:id` | Owner | Rename or delete |
| PUT | `/topics/:id/prerequisites` | Owner | Replace prerequisites (`{ prerequisiteIds: number[] }`) |
| POST | `/topics/:id/complete` | Owner | Mark complete (rejected if locked) |
| POST | `/topics/:id/reopen` | Owner | Reopen (re-locks dependents) |
| POST | `/sessions` | Owner | Log a session `{ topicId, date, minutes, note? }` |
| GET | `/sessions?goalId=&topicId=` | Owner or mentor | List sessions |
| DELETE | `/sessions/:id` | Owner | Delete a session |

Topic mutations return the goal's refreshed topic list. Validation failures return `400` with a readable `message`, permission failures `403`, missing or invalid tokens `401`.

---

## AI weekly review

`POST /goals/:id/review` builds a compact summary of the goal and sends it to Claude, which returns a short review and a suggested plan for next week.

- **Input to the model:** percent complete, each topic's status and what is blocking it, minutes in the last 7 days against the 7 days before, days since the last session, and the 10 most recent session notes (truncated).
- **Output is constrained and validated.** The model returns JSON in a fixed schema. The server then checks it: plan items must name **real, unlocked topics** (a locked topic is never suggested), and minutes are forced into the configured session limits. Session notes are treated as untrusted data in the prompt, and the result is shown as plain text.
- **Never breaks the page.** With no `ANTHROPIC_API_KEY`, or if the API call fails, times out, or is refused, the server returns a deterministic **rule-based** review in the same shape. The UI badge shows "Written by Claude" or "Rule-based review".
- **Cached for 5 minutes** per identical set of progress data, so repeated clicks do not cost anything.
- **Model:** `claude-opus-5-5` by default. Set `ANTHROPIC_MODEL` in `backend/.env` to use another one (for example `claude-haiku-5-5` for lower cost).

---

## Project structure

```
study-tracker/
├── README.md
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          data model
│   │   ├── migrations/            SQL migration
│   │   └── seed.ts                demo data (3 goals, 12 topics, 30 sessions)
│   ├── src/
│   │   ├── auth/                  login, JWT, global guards, decorators
│   │   ├── common/                access rules, topic view, Prisma service
│   │   ├── app-config/            admin-configurable limits
│   │   ├── goals/                 goals, progress  (+ progress-logic.ts)
│   │   ├── topics/                topics, prerequisites  (+ topic-logic.ts)
│   │   ├── sessions/              study sessions  (+ session-logic.ts)
│   │   ├── review/                AI weekly review  (+ review-logic.ts)
│   │   └── *.spec.ts              unit tests, next to the code they test
│   ├── test/app.e2e-spec.ts       end-to-end API tests
│   └── .env.example
└── frontend/
    └── src/app/
        ├── api.service.ts         all HTTP calls
        ├── auth.ts                session, JWT interceptor, route guards
        ├── models.ts              API types
        └── pages/                 login, goals, goal-detail, config, chart
```

---

## Assumptions and limitations

- **Mentors are read-only** on learner data. They cannot create goals or log sessions for a learner.
- **Sign-up is not built.** The three seeded users are the only accounts. Adding users means inserting rows (the seed script shows how).
- **No password reset, refresh tokens or rate limiting.** Login tokens last 8 hours.
- **Local-only configuration.** The API and web ports are fixed to 3000 and 4200, and the API URL is a constant in the frontend, not an environment setting.
- **The weekly review cache is in memory,** so it resets when the server restarts and is not shared between server instances.
- **Frontend has no automated tests.** The business rules, API and role enforcement are what the test suite covers.
- **Ideas for next steps:** a prerequisite graph visualisation, per-user study streaks, and moving the API URL into an Angular environment file.
