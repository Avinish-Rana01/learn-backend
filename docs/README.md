# Backend Architectural Plan & Specification

## 1. Overview
The backend is a Node.js + TypeScript REST API providing data services, authentication, access control, and progress evaluation for the Developer Learning Platform.

## 2. Technology Choices
- **Runtime**: Node.js v24+
- **Language**: TypeScript (strict mode enabled)
- **Framework**: Express.js (or Fastify) with clean layered architecture
- **Database Engine**: PostgreSQL
  - Local dev / testing: Embedded PostgreSQL via `@electric-sql/pglite` (zero Docker/psql requirement, runs anywhere).
  - Production / staging: Standard PostgreSQL via `pg` connection pool.
- **Validation**: Zod schema validation on all incoming query params, route params, and request bodies.
- **Testing**: Vitest + Supertest for integration and unit test coverage.

## 3. Directory Structure (Proposed for Implementation)
```text
backend/
├── src/
│   ├── config/               # Environment configuration and runtime constants
│   ├── controllers/          # HTTP request handlers (auth, courses, quizzes, progress)
│   ├── services/             # Business logic (session invalidation, grading, entitlements)
│   ├── db/                   # Database connection, migrations, seeders
│   │   ├── migrations/       # SQL migration scripts
│   │   ├── migrate.ts        # Migration execution engine
│   │   ├── seed.ts           # Rich curriculum seed data (Git, SQL, Node.js)
│   │   └── connection.ts     # PostgreSQL / PGlite database connector
│   ├── middlewares/          # Auth guards, single-session check, error handler, rate limit
│   ├── routes/               # API route definitions grouped under /api/v1
│   ├── types/                # Domain types, DTOs, response contracts
│   ├── utils/                # Password hashing, JWT helpers, Zod schemas
│   ├── app.ts                # Express application setup
│   └── server.ts             # Server bootstrap & lifecycle
├── tests/                    # Integration & unit test suites
├── .env.example              # Environment variables template
├── tsconfig.json             # TypeScript configuration
└── package.json              # Backend dependencies and scripts
```
