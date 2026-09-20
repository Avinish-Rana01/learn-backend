# REST API v1 Specification

Base URL: `/api/v1`

## 1. Authentication Endpoints
- **`POST /api/v1/auth/register`**
  - Body: `{ "email": "learner@example.com", "password": "...", "fullName": "Jane Doe" }`
  - Response: 201 Created `{ success: true, data: { user, accessToken, refreshToken } }`
- **`POST /api/v1/auth/login`**
  - Body: `{ "email": "learner@example.com", "password": "..." }`
  - Invalidation Action: Any existing active session for this user is marked `is_active = false`.
  - Response: 200 OK `{ success: true, data: { user, accessToken, refreshToken } }`
- **`POST /api/v1/auth/logout`**
  - Headers: `Authorization: Bearer <token>` or active cookie
  - Invalidation Action: Current session is set to `is_active = false`. Cookies cleared.
  - Response: 200 OK `{ success: true, message: "Logged out successfully" }`
- **`POST /api/v1/auth/refresh`**
  - Body or Cookie: `{ "refreshToken": "..." }`
  - Validates active session state in database; returns new access token.
- **`GET /api/v1/auth/me`**
  - Headers: Bearer Token / Cookie
  - Response: Current user profile and active session details.

## 2. Course Catalog Endpoints
- **`GET /api/v1/courses`**
  - Query params: `?level=beginner&page=1&limit=10`
  - Returns list of published courses with lesson counts and enrollment status for current user.
- **`GET /api/v1/courses/:slug`**
  - Returns course metadata, module syllabus, and lesson titles with `is_preview` flags.
- **`POST /api/v1/courses/:id/enroll`**
  - Requires authenticated session. Enrolls learner in the course.

## 3. Lesson Content Endpoints
- **`GET /api/v1/lessons/:id`**
  - Authorization check:
    - Allowed if `is_preview === true`
    - Allowed if learner holds an `active` enrollment record
    - Returns 403 Forbidden with `COURSE_NOT_ENROLLED` otherwise
  - Returns Markdown body, code snippets, and attached quiz ID.

## 4. Progress Tracking Endpoints
- **`GET /api/v1/me/enrollments`**
  - Returns all enrolled courses with aggregate percentage complete.
- **`GET /api/v1/me/progress/:courseId`**
  - Returns list of completed lesson IDs and overall course progress percentage.
- **`PUT /api/v1/me/progress/lessons/:lessonId`**
  - Body: `{ "completed": true }`
  - Updates lesson completion status and timestamp.

## 5. Quiz Assessment Endpoints
- **`GET /api/v1/quizzes/:id`**
  - Returns quiz title, passing score, questions, and option choices.
  - **Security Rule**: The `is_correct` field is stripped from options to protect test integrity.
- **`POST /api/v1/quizzes/:id/attempts`**
  - Body: `{ "answers": [{ "questionId": "...", "selectedOptionId": "..." }] }`
  - Backend grades each answer against the true database answers, computes score %, stores attempt, and returns:
    `{ scorePercentage: 85, passed: true, review: [...] }`.
