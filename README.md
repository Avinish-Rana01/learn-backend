# ⚙️ Learn Platform - Backend REST API

> High-performance, production-minded REST API built for the **Developer Learning Platform**.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Express](https://img.shields.io/badge/Express.js-000000?style=flat&logo=express&logoColor=white)](https://expressjs.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 📖 1. Architecture & Design Philosophy

The **Learn Backend API** serves as the central source of truth for developer courses, modules, lessons, server-side quiz grading, and single-device authenticated session management.

Key architectural pillars:
- **Clean Layered Architecture**: Controller -> Service -> Repository / Database query layer.
- **Universal Multi-Client Contract**: Standardized `/api/v1` JSON endpoints that power both the Web PWA client and future Flutter mobile apps without backend changes.
- **PostgreSQL Source of Truth**: Strict relational normalization with transactional migrations.
- **Embedded PostgreSQL (PGlite) Local Dev**: Seamless out-of-the-box local execution on any developer machine without requiring Docker or manual PostgreSQL service setup.
- **Single Active Session per Account**: Device B login automatically invalidates Device A at the database layer.
- **Strict Server-Side Entitlement Checks**: Lesson contents and quiz correct answers are never served without validated enrollment.

---

## 🔒 2. Single Active Session Security Engine

To prevent account sharing and enforce device security, the backend enforces **one active authenticated session per user account**:

```text
  Device A (Logged In)          Device B (New Login)             PostgreSQL DB
           |                             |                             |
           |                             |--- POST /auth/login ------->|
           |                             |                             |--- Invalidate older sessions
           |                             |                             |    UPDATE sessions SET is_active = false
           |                             |                             |    WHERE user_id = :userId;
           |                             |                             |--- Create new session (is_active = true)
           |                             |<-- 200 OK (Tokens/Session) -|
           |                                                           |
           |--- GET /api/v1/lessons/:id (Device A old token) --------->|
           |                                                           |--- Check session in DB:
           |                                                           |    is_active is FALSE!
           |<-- 401 Unauthorized (SESSION_INVALIDATED_BY_NEW_LOGIN) ---|
```

### Response Envelope on Invalidation:
```json
{
  "success": false,
  "error": {
    "code": "SESSION_INVALIDATED_BY_NEW_LOGIN",
    "message": "Your account was logged in from another device. Please log in again."
  }
}
```

---

## 🗄️ 3. Database Schema Overview

PostgreSQL tables managed via migrations:
- **`users`**: Authentication credentials, roles (`learner`, `admin`, `instructor`), audit timestamps.
- **`sessions`**: Active session tracker, device info, IP, refresh token hashes, `is_active` status.
- **`courses`**: Course metadata, slug, level, pricing, publication status.
- **`modules`**: Structured course modules ordered by `order_index`.
- **`lessons`**: Ordered lessons within modules with free `is_preview` teaser flag.
- **`lesson_contents`**: Rich Markdown content and code snippets.
- **`enrollments`**: Course entitlement access controls.
- **`lesson_progress`**: Completion status and progress timestamps.
- **`quizzes`**, **`quiz_questions`**, **`quiz_options`**: Dynamic assessment questions and answer choices (server-graded).
- **`quiz_attempts`**: Audit trail of learner submissions and scores.

---

## 🌐 4. REST API v1 Endpoints

### Authentication (`/api/v1/auth`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Register new user account |
| `POST` | `/api/v1/auth/login` | Authenticate user & invalidate existing active sessions |
| `POST` | `/api/v1/auth/logout` | Invalidate current session & clear cookies |
| `POST` | `/api/v1/auth/refresh` | Rotate access token against active session |
| `GET` | `/api/v1/auth/me` | Fetch authenticated user profile & session info |

### Courses & Lessons (`/api/v1/courses`, `/api/v1/lessons`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/courses` | List published courses with enrollment status |
| `GET` | `/api/v1/courses/:slug` | Course overview, syllabus, module hierarchy |
| `POST` | `/api/v1/courses/:id/enroll` | Enroll learner in course |
| `GET` | `/api/v1/lessons/:id` | Fetch lesson content (gated: checks enrollment or preview) |

### Progress & Quizzes (`/api/v1/me`, `/api/v1/quizzes`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/me/enrollments` | List all user course enrollments & progress % |
| `GET` | `/api/v1/me/progress/:courseId`| Fetch completed lesson IDs for course |
| `PUT` | `/api/v1/me/progress/lessons/:id`| Mark lesson completed or incomplete |
| `GET` | `/api/v1/quizzes/:id` | Fetch questions & options (answers stripped) |
| `POST` | `/api/v1/quizzes/:id/attempts`| Server-side grading of quiz submission |

---

## 📁 5. Directory Structure

```text
learn-backend/
├── docs/                     # Detailed architectural specifications
│   ├── database_schema.md    # SQL migration definitions and indexes
│   ├── api_endpoints.md      # Exhaustive /api/v1 request/response contracts
│   ├── business_rules.md     # Access gating and assessment grading logic
│   └── auth_security.md      # Single active session security specification
├── src/
│   ├── config/               # Environment variables and constants
│   ├── controllers/          # Express route handlers
│   ├── services/             # Business logic (auth, access, grading, progress)
│   ├── db/                   # Database connection, migrations, seeders
│   ├── middlewares/          # Auth guard, rate limiting, error handling
│   ├── routes/               # Modular Express routers under /api/v1
│   ├── types/                # Domain models & DTOs
│   ├── utils/                # Password hashing, JWT helpers, Zod schemas
│   ├── app.ts                # Application configuration
│   └── server.ts             # Server entry point
├── tests/                    # Vitest integration tests (auth, invalidation, quizzes)
├── .env.example              # Environment variables template
├── tsconfig.json             # TypeScript configuration
└── package.json              # Backend dependencies and scripts
```

---

## 🚀 6. Getting Started

### Prerequisites
- **Node.js**: v22.0.0 or higher (Node 22 LTS recommended)
- **pnpm**: v10.0.0 or higher

### Installation & Setup
```bash
# 1. Clone repository
git clone https://github.com/Avinish-Rana01/learn-backend.git
cd learn-backend

# 2. Install dependencies
pnpm install

# 3. Configure environment
cp .env.example .env

# 4. Start development server
pnpm dev
```

The API service runs at `http://localhost:4000`.  
Health endpoint: `http://localhost:4000/api/v1/health`.

### Available Scripts
- `pnpm dev`: Start local development server with TypeScript watch mode (`tsx`)
- `pnpm build`: Compile TypeScript to `dist/`
- `pnpm start`: Launch compiled production server
- `pnpm typecheck`: Run TypeScript compiler verification (`tsc --noEmit`)

> **Note**: Database connection (PostgreSQL/Prisma), authentication engines, and quiz grading tests are deferred to Step 2.

---

## 📱 7. Multi-Client & Flutter Compatibility

The backend is built so that a future **Flutter mobile app** can consume the exact same API:
- Accepts `Authorization: Bearer <token>` header in addition to web cookies.
- Returns standardized JSON envelopes for all responses.
- Consistent HTTP status codes (200, 201, 400, 401, 403, 404, 500).

---

## 📄 8. Documentation Index

For in-depth specifications, view the [`docs/`](./docs) folder:
- [PostgreSQL Database Schema & Migrations](./docs/database_schema.md)
- [REST API v1 Endpoints & DTOs](./docs/api_endpoints.md)
- [Business Rules & Assessment Grading](./docs/business_rules.md)
- [Authentication & Single-Session Security](./docs/auth_security.md)

---

## 📜 9. License

This project is licensed under the MIT License.
