import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../src/services/auth.service.js';
import { hashPassword } from '../src/lib/password.js';
import { hashToken } from '../src/lib/jwt.js';
import { AppError } from '../src/middleware/errorHandler.js';

// In-memory mock database tables
interface MockUser {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MockSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  deviceInfo: string | null;
  ipAddress: string | null;
  isActive: boolean;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const mockUsers: MockUser[] = [];
const mockSessions: MockSession[] = [];

// Mock Prisma
vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) {
          return mockUsers.find((u) => u.email === where.email) || null;
        }
        if (where.id) {
          return mockUsers.find((u) => u.id === where.id) || null;
        }
        return null;
      }),
      create: vi.fn(async ({ data }: { data: Omit<MockUser, 'id' | 'createdAt' | 'updatedAt'> }) => {
        const newUser: MockUser = {
          id: `user-${Date.now()}-${Math.random()}`,
          email: data.email,
          passwordHash: data.passwordHash,
          fullName: data.fullName,
          role: data.role || 'LEARNER',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockUsers.push(newUser);
        return newUser;
      }),
    },
    session: {
      findUnique: vi.fn(async ({ where, include }: { where: { id: string }; include?: { user: boolean } }) => {
        const session = mockSessions.find((s) => s.id === where.id);
        if (!session) return null;
        if (include?.user) {
          const user = mockUsers.find((u) => u.id === session.userId);
          return { ...session, user };
        }
        return session;
      }),
      findFirst: vi.fn(async ({ where, include }: { where: { refreshTokenHash: string }; include?: { user: boolean } }) => {
        const session = mockSessions.find((s) => s.refreshTokenHash === where.refreshTokenHash);
        if (!session) return null;
        if (include?.user) {
          const user = mockUsers.find((u) => u.id === session.userId);
          return { ...session, user };
        }
        return session;
      }),
      create: vi.fn(async ({ data }: { data: Omit<MockSession, 'id' | 'createdAt' | 'updatedAt' | 'revokedAt'> }) => {
        const newSession: MockSession = {
          id: `session-${Date.now()}-${Math.random()}`,
          userId: data.userId,
          refreshTokenHash: data.refreshTokenHash,
          deviceInfo: data.deviceInfo || null,
          ipAddress: data.ipAddress || null,
          isActive: data.isActive ?? true,
          expiresAt: data.expiresAt,
          revokedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockSessions.push(newSession);
        return newSession;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { userId?: string; id?: string; isActive?: boolean }; data: Partial<MockSession> }) => {
        let count = 0;
        mockSessions.forEach((session) => {
          let match = true;
          if (where.userId && session.userId !== where.userId) match = false;
          if (where.id && session.id !== where.id) match = false;
          if (where.isActive !== undefined && session.isActive !== where.isActive) match = false;

          if (match) {
            Object.assign(session, data);
            count++;
          }
        });
        return { count };
      }),
    },
  },
  checkDatabaseConnection: vi.fn(async () => true),
}));

describe('Authentication & Single Active Session Engine', () => {
  beforeEach(() => {
    mockUsers.length = 0;
    mockSessions.length = 0;
  });

  describe('Registration', () => {
    it('creates a user with valid email, strong password, and full name', async () => {
      const user = await AuthService.register({
        email: 'Learner@Example.COM ',
        password: 'Password123',
        fullName: 'Dev Learner',
      });

      expect(user.id).toBeDefined();
      expect(user.email).toBe('learner@example.com'); // Normalized
      expect(user.fullName).toBe('Dev Learner');
      expect(user.role).toBe('LEARNER');

      const storedUser = mockUsers.find((u) => u.email === 'learner@example.com');
      expect(storedUser).toBeDefined();
      expect(storedUser?.passwordHash).not.toBe('Password123'); // Hashed
    });

    it('rejects weak passwords missing uppercase, lowercase, or numbers', async () => {
      await expect(
        AuthService.register({
          email: 'test@example.com',
          password: 'short',
          fullName: 'Test User',
        })
      ).rejects.toThrow(AppError);

      await expect(
        AuthService.register({
          email: 'test@example.com',
          password: 'alllowercase123',
          fullName: 'Test User',
        })
      ).rejects.toThrow(AppError);
    });

    it('prevents duplicate registration for existing email', async () => {
      await AuthService.register({
        email: 'user@example.com',
        password: 'Password123',
        fullName: 'First User',
      });

      await expect(
        AuthService.register({
          email: 'USER@example.com',
          password: 'Password456',
          fullName: 'Duplicate User',
        })
      ).rejects.toThrow('An account with this email address already exists.');
    });
  });

  describe('Login & Credentials Verification', () => {
    beforeEach(async () => {
      const passwordHash = await hashPassword('SecurePass1');
      mockUsers.push({
        id: 'user-1',
        email: 'dev@devlearn.io',
        passwordHash,
        fullName: 'Developer One',
        role: 'LEARNER',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('authenticates valid credentials and creates an active session', async () => {
      const result = await AuthService.login(
        { email: 'dev@devlearn.io', password: 'SecurePass1' },
        { deviceInfo: 'Chrome on macOS', ipAddress: '192.168.1.10' }
      );

      expect(result.user.email).toBe('dev@devlearn.io');
      expect(result.session.id).toBeDefined();
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();

      const createdSession = mockSessions.find((s) => s.id === result.session.id);
      expect(createdSession?.isActive).toBe(true);
      expect(createdSession?.deviceInfo).toBe('Chrome on macOS');
    });

    it('rejects invalid password with generic error', async () => {
      await expect(
        AuthService.login({ email: 'dev@devlearn.io', password: 'WrongPassword99' })
      ).rejects.toThrow('Invalid email or password.');
    });

    it('rejects non-existent email with generic error', async () => {
      await expect(
        AuthService.login({ email: 'unknown@devlearn.io', password: 'SecurePass1' })
      ).rejects.toThrow('Invalid email or password.');
    });
  });

  describe('MANDATORY TEST: One Active Session Enforcement', () => {
    beforeEach(async () => {
      const passwordHash = await hashPassword('SecurePass1');
      mockUsers.push({
        id: 'user-multi-device',
        email: 'multi@devlearn.io',
        passwordHash,
        fullName: 'Multi Device User',
        role: 'LEARNER',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('invalidates Device A session when same user logs in on Device B', async () => {
      // 1. User logs in on Device A (e.g. Chrome on Windows)
      const deviceA = await AuthService.login(
        { email: 'multi@devlearn.io', password: 'SecurePass1' },
        { deviceInfo: 'Chrome 128 on Windows 11', ipAddress: '10.0.0.1' }
      );

      // Verify Session A is initially active
      const sessionAState = await AuthService.validateSession(deviceA.session.id);
      expect(sessionAState.id).toBe('user-multi-device');

      // 2. Same user logs in on Device B (e.g. Safari on iPhone)
      const deviceB = await AuthService.login(
        { email: 'multi@devlearn.io', password: 'SecurePass1' },
        { deviceInfo: 'Safari on iPhone 16', ipAddress: '10.0.0.2' }
      );

      // Verify Session B is active
      const sessionBState = await AuthService.validateSession(deviceB.session.id);
      expect(sessionBState.id).toBe('user-multi-device');

      // 3. Device A attempts to access protected resource with Session A
      // MUST BE REJECTED with code SESSION_INVALIDATED_BY_NEW_LOGIN
      await expect(AuthService.validateSession(deviceA.session.id)).rejects.toMatchObject({
        statusCode: 401,
        code: 'SESSION_INVALIDATED_BY_NEW_LOGIN',
        message: 'Your session ended because your account was signed in on another device.',
      });

      // 4. Device A refresh token must also be rejected
      await expect(AuthService.refreshSession(deviceA.tokens.refreshToken)).rejects.toMatchObject({
        statusCode: 401,
        code: 'SESSION_INVALIDATED_BY_NEW_LOGIN',
      });

      // 5. Device B continues to succeed normally
      const validDeviceB = await AuthService.validateSession(deviceB.session.id);
      expect(validDeviceB.email).toBe('multi@devlearn.io');
    });
  });

  describe('Logout', () => {
    it('revokes the session and prevents further authenticated access', async () => {
      const passwordHash = await hashPassword('SecurePass1');
      mockUsers.push({
        id: 'user-logout-test',
        email: 'logout@devlearn.io',
        passwordHash,
        fullName: 'Logout Test',
        role: 'LEARNER',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { session } = await AuthService.login({
        email: 'logout@devlearn.io',
        password: 'SecurePass1',
      });

      // Active prior to logout
      expect((await AuthService.validateSession(session.id)).id).toBe('user-logout-test');

      // Execute logout
      await AuthService.logout(session.id);

      // Subsequent access must fail
      await expect(AuthService.validateSession(session.id)).rejects.toThrow();
    });
  });
});
