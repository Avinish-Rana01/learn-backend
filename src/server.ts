import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

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

// Healthcheck Route
app.get('/api/v1/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'devlearn-backend',
    version: '1.0.0',
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

// Start Server
app.listen(PORT, () => {
  console.log(`[DevLearn Backend] Server running on http://localhost:${PORT}`);
  console.log(`[DevLearn Backend] Health endpoint: http://localhost:${PORT}/api/v1/health`);
});
