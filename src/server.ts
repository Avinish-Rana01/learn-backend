import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { prisma, checkDatabaseConnection } from './lib/prisma.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authLimiter } from './middleware/rateLimit.js';
import { authRoutes } from './routes/auth.routes.js';
import { learningRoutes } from './routes/learning.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Middlewares
app.use(
  cors({
    origin: [CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Request logging in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });
}

// Healthcheck Route
app.get('/api/v1/health', async (_req: Request, res: Response) => {
  const isDbConnected = await checkDatabaseConnection();

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'devlearn-backend',
    version: '1.0.0',
    database: isDbConnected ? 'connected' : 'disconnected',
  });
});

// Root Route
app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    name: 'DevLearn Backend REST API',
    version: '1.0.0',
    documentation: '/api/v1/health',
  });
});

// Mount Authentication Routes with Rate Limiting
app.use('/api/v1/auth', authLimiter, authRoutes);

// Mount Learning Domain Routes
app.use('/api/v1', learningRoutes);

// Centralized Error Handler
app.use(errorHandler);

// Start Server
const server = app.listen(PORT, () => {
  console.log(`[DevLearn Backend] Server running on http://localhost:${PORT}`);
  console.log(`[DevLearn Backend] Health endpoint: http://localhost:${PORT}/api/v1/health`);
});

// Graceful Shutdown
async function handleShutdown(signal: string) {
  console.log(`[DevLearn Backend] ${signal} received, closing server gracefully...`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log('[DevLearn Backend] Prisma disconnected cleanly.');
    } catch (e) {
      console.error('[DevLearn Backend] Error during Prisma disconnect:', e);
    }
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export { app, server };
