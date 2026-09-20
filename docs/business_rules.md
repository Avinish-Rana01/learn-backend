# Backend Business Rules & Quality Safeguards

## 1. Access Control & Entitlement Gating
- Lesson content is never served indiscriminately.
- A user requesting `GET /api/v1/lessons/:id` must pass one of the following criteria:
  1. `lesson.is_preview == true` (public preview).
  2. The authenticated user holds an active row in `enrollments` for `course_id`.
  3. The authenticated user has `role == 'admin'`.
- Any failure yields HTTP 403 with `{ "code": "ACCESS_DENIED_NOT_ENROLLED" }`.

## 2. Single-Active-Session Logic
- When `POST /api/v1/auth/login` succeeds:
  1. Transaction begins.
  2. Any existing row in `sessions` where `user_id = :userId` and `is_active = true` is updated to `is_active = false`.
  3. A new session row is inserted with `is_active = true`.
  4. Transaction commits.
- When an API request arrives with a JWT:
  1. The JWT is verified for signature and expiration.
  2. The embedded `sessionId` is looked up in the `sessions` table.
  3. If `is_active == false`, the request is rejected immediately with HTTP 401 and code `SESSION_INVALIDATED_BY_NEW_LOGIN`.

## 3. Quiz Grading Engine
- Answer evaluations are calculated exclusively on the server.
- The scoring formula: `scorePercentage = Math.round((correctAnswersCount / totalQuestions) * 100)`.
- If `scorePercentage >= quiz.passing_score_percentage`, the attempt is marked `passed = true`.
- Attempt record is saved in `quiz_attempts` with full answer audit history.

## 4. Automated Testing Strategy
- Unit tests for password hashing and token generation.
- Integration tests using Supertest covering:
  - User registration & login.
  - Multi-device login: Device A logs in, Device B logs in, Device A is rejected.
  - Gated lesson access (non-enrolled rejected, enrolled accepted).
  - Quiz submission evaluation (100% correct answers passes, incorrect answers fails).
