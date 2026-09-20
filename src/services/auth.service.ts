import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword, isStrongPassword } from '../lib/password.js';
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  REFRESH_TOKEN_EXPIRY_DAYS,
} from '../lib/jwt.js';
import { AppError } from '../middleware/errorHandler.js';

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface SessionMeta {
  deviceInfo?: string;
  ipAddress?: string;
}

export interface SafeUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  createdAt: Date;
}

export class AuthService {
  /**
   * Register a new user account with secure password hashing and normalized email.
   */
  static async register(input: RegisterInput): Promise<SafeUser> {
    const normalizedEmail = input.email.trim().toLowerCase();

    if (!isStrongPassword(input.password)) {
      throw new AppError(
        'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number.',
        400,
        'WEAK_PASSWORD'
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new AppError(
        'An account with this email address already exists.',
        409,
        'EMAIL_ALREADY_EXISTS'
      );
    }

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        fullName: input.fullName.trim(),
        role: 'LEARNER',
      },
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  /**
   * Authenticate credentials and enforce the ONE ACTIVE SESSION policy.
   * Any previously active sessions for this user are invalidated immediately.
   */
  static async login(
    input: LoginInput,
    meta: SessionMeta = {}
  ): Promise<{
    user: SafeUser;
    session: { id: string; expiresAt: Date };
    tokens: { accessToken: string; refreshToken: string };
  }> {
    const normalizedEmail = input.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.passwordHash) {
      throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    const isValidPassword = await verifyPassword(input.password, user.passwordHash);
    if (!isValidPassword) {
      throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    // --- ONE ACTIVE SESSION ENFORCEMENT ---
    // Invalidate all existing active sessions for this user
    await prisma.session.updateMany({
      where: {
        userId: user.id,
        isActive: true,
      },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });

    // Generate cryptographic refresh token and its hash
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashToken(refreshToken);
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    // Create the new exclusive active session
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        deviceInfo: meta.deviceInfo || 'Unknown Device',
        ipAddress: meta.ipAddress || 'Unknown IP',
        isActive: true,
        expiresAt,
      },
    });

    // Generate short-lived access token
    const accessToken = generateAccessToken({
      userId: user.id,
      sessionId: session.id,
      email: user.email,
      role: user.role,
    });

    const safeUser: SafeUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      createdAt: user.createdAt,
    };

    return {
      user: safeUser,
      session: {
        id: session.id,
        expiresAt: session.expiresAt,
      },
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  /**
   * Validate that a session is still active in the database.
   * If a newer login on another device invalidated this session, throw 401 SESSION_INVALIDATED_BY_NEW_LOGIN.
   */
  static async validateSession(sessionId: string): Promise<SafeUser> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session || !session.isActive || session.revokedAt) {
      throw new AppError(
        'Your session ended because your account was signed in on another device.',
        401,
        'SESSION_INVALIDATED_BY_NEW_LOGIN'
      );
    }

    if (session.expiresAt < new Date()) {
      throw new AppError(
        'Your session has expired. Please log in again.',
        401,
        'SESSION_EXPIRED'
      );
    }

    return {
      id: session.user.id,
      email: session.user.email,
      fullName: session.user.fullName,
      role: session.user.role,
      createdAt: session.user.createdAt,
    };
  }

  /**
   * Rotate access token using a valid refresh token.
   * If the session was invalidated by another device login, rejection is immediate.
   */
  static async refreshSession(
    refreshToken: string
  ): Promise<{
    accessToken: string;
    user: SafeUser;
  }> {
    const hashed = hashToken(refreshToken);

    const session = await prisma.session.findFirst({
      where: { refreshTokenHash: hashed },
      include: { user: true },
    });

    if (!session || !session.isActive || session.revokedAt) {
      throw new AppError(
        'Your session ended because your account was signed in on another device.',
        401,
        'SESSION_INVALIDATED_BY_NEW_LOGIN'
      );
    }

    if (session.expiresAt < new Date()) {
      throw new AppError(
        'Your refresh token has expired. Please log in again.',
        401,
        'SESSION_EXPIRED'
      );
    }

    const accessToken = generateAccessToken({
      userId: session.user.id,
      sessionId: session.id,
      email: session.user.email,
      role: session.user.role,
    });

    return {
      accessToken,
      user: {
        id: session.user.id,
        email: session.user.email,
        fullName: session.user.fullName,
        role: session.user.role,
        createdAt: session.user.createdAt,
      },
    };
  }

  /**
   * Log out by revoking the active session in the database.
   */
  static async logout(sessionId: string): Promise<void> {
    await prisma.session.updateMany({
      where: { id: sessionId },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });
  }

  /**
   * Retrieve safe user profile by ID.
   */
  static async getUserById(userId: string): Promise<SafeUser> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}
