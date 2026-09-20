import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt.js';
import { AuthService, SafeUser } from '../services/auth.service.js';
import { AppError } from './errorHandler.js';

declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
      sessionId?: string;
    }
  }
}

/**
 * Middleware ensuring request has a valid access token and an active database session.
 * Rejects requests if session was invalidated by a new login on another device.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token: string | undefined;

    // 1. Check HttpOnly cookie
    if (req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
    }

    // 2. Check Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (!token && authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }

    if (!token) {
      throw new AppError('Authentication required. Please log in.', 401, 'UNAUTHORIZED');
    }

    // 3. Verify JWT signature & expiration
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new AppError('Invalid or expired authentication token.', 401, 'INVALID_TOKEN');
    }

    // 4. Validate session state in database (Enforces single active login)
    const user = await AuthService.validateSession(payload.sessionId);

    req.user = user;
    req.sessionId = payload.sessionId;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware enforcing role-based access control (e.g. ADMIN, INSTRUCTOR).
 */
export function requireRole(allowedRoles: string | string[]) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to access this resource.', 403, 'FORBIDDEN')
      );
    }

    next();
  };
}
