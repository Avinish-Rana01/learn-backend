# Authentication & Single-Active-Session Security Model

## 1. The Single Active Login Policy

### Business Rule:
A user account may only have **one active authenticated session** at any time.

### Sequence Diagram:
```text
User on Device A            User on Device B                 Backend / Database
      |                           |                                   |
      |-- 1. Login -------------->|                                   |
      |                           |-- 2. Authenticate credentials --->|
      |                           |                                   |-- 3. Invalidate previous sessions
      |                           |                                   |      UPDATE sessions SET is_active = false
      |                           |                                   |      WHERE user_id = :userId;
      |                           |                                   |-- 4. Create new active session
      |                           |<-- 5. Return session & tokens ----|
      |                           |      (Device B is now active)     |
      |                                                               |
      |-- 6. Request with Device A Session -------------------------->|
      |                                                               |-- 7. Check session in DB
      |                                                               |      is_active is FALSE!
      |<-- 8. 401 Unauthorized (SESSION_INVALIDATED_BY_NEW_LOGIN) ----|
      |
[Device A clears state and prompts:
"You were logged out because this account logged in on another device."]
```

## 2. Session Schema & Tracking
Each session is stored in PostgreSQL:
- `id`: UUID (Primary Key)
- `user_id`: UUID (Foreign Key to `users.id`)
- `refresh_token_hash`: Hash of the issued refresh token
- `device_info`: User-Agent string / Device name (e.g. "Chrome 128 on Windows 11", "Pixel 8 Pro")
- `ip_address`: Client IP address
- `is_active`: Boolean flag indicating if this is the currently authorized session
- `expires_at`: Expiration timestamp
- `created_at` & `updated_at`: Audit timestamps

## 3. Token Strategy
1. **Access Token**:
   - Short-lived (15 minutes).
   - JWT containing: `{ userId, sessionId, role }`.
   - Signed with `JWT_SECRET`.
2. **Refresh Token**:
   - Long-lived (7 days).
   - Cryptographically random string hashed with SHA-256 before storage in `sessions.refresh_token_hash`.
3. **Transport**:
   - For Web browsers: Stored in `HttpOnly`, `SameSite=Lax`, `Secure` cookies to prevent XSS exfiltration.
   - For Mobile clients (Flutter): Returned in JSON response body to store in Secure Keystore/Keychain.
4. **Validation Check**:
   - Every protected API request validates the JWT signature, then checks whether `sessionId` is marked `is_active = true` in the database.
   - If invalid, the request is rejected with HTTP 401 and code `SESSION_INVALIDATED_BY_NEW_LOGIN`.

## 4. Password Security
- Passwords are never stored in plain text.
- Hashed using **Argon2id** or **bcrypt** with minimum cost factor 12.
- Enforces minimum 8 characters with numbers, lowercase, and uppercase requirements.
