import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { CourseService } from '../services/course.service.js';
import { LessonService } from '../services/lesson.service.js';
import { QuizService } from '../services/quiz.service.js';
import { ProgressService } from '../services/progress.service.js';
import { verifyAccessToken } from '../lib/jwt.js';

const router = Router();

// Validation Schemas
const quizSubmissionSchema = z.object({
  body: z.object({
    answers: z.array(
      z.object({
        questionId: z.string().uuid(),
        optionId: z.string().uuid(),
      })
    ),
  }),
});

const progressSchema = z.object({
  body: z.object({
    completed: z.boolean().default(true),
  }),
});

// Helper: Optional authentication for preview access
function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    let token = req.cookies?.access_token;
    const authHeader = req.headers.authorization;
    if (!token && authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }
    if (token) {
      const payload = verifyAccessToken(token);
      req.user = {
        id: payload.userId,
        email: payload.email,
        fullName: '',
        role: payload.role,
        createdAt: new Date(),
      };
    }
  } catch {
    // Ignore error for optional authentication
  }
  next();
}

/**
 * GET /api/v1/courses
 * List published developer courses.
 */
router.get('/courses', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const courses = await CourseService.listPublishedCourses();
    res.status(200).json({
      success: true,
      data: { courses },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/courses/:slug
 * Fetch course details, syllabus, and module hierarchy.
 */
router.get('/courses/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const course = await CourseService.getCourseBySlug(req.params.slug);
    res.status(200).json({
      success: true,
      data: { course },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/courses/:courseId/enroll
 * Enroll the authenticated user in a course.
 */
router.post(
  '/courses/:courseId/enroll',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const enrollment = await CourseService.enrollUser(req.user!.id, req.params.courseId);
      res.status(201).json({
        success: true,
        data: { enrollment },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/lessons/:lessonId
 * Fetch lesson with ordered content blocks. Enforces preview/enrollment access.
 */
router.get(
  '/lessons/:lessonId',
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lesson = await LessonService.getLessonById(req.params.lessonId, req.user?.id);
      res.status(200).json({
        success: true,
        data: { lesson },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/quizzes/:quizId
 * Fetch learner-safe quiz questions and options (isCorrect omitted).
 */
router.get('/quizzes/:quizId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const quiz = await QuizService.getLearnerQuiz(req.params.quizId);
    res.status(200).json({
      success: true,
      data: { quiz },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/quizzes/:quizId/submit
 * Submit answers for server-side evaluation, score calculation, and attempt record.
 */
router.post(
  '/quizzes/:quizId/submit',
  requireAuth,
  validate(quizSubmissionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await QuizService.submitQuiz(
        req.params.quizId,
        req.user!.id,
        req.body
      );
      res.status(200).json({
        success: true,
        data: { result },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/progress/lessons/:lessonId
 * Mark lesson as completed or incomplete.
 */
router.post(
  '/progress/lessons/:lessonId',
  requireAuth,
  validate(progressSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const progress = await ProgressService.markLessonProgress(
        req.user!.id,
        req.params.lessonId,
        req.body.completed
      );
      res.status(200).json({
        success: true,
        data: { progress },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/progress/courses/:courseId
 * Dynamically derive user's completion percentage for a course.
 */
router.get(
  '/progress/courses/:courseId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const progress = await ProgressService.getCourseProgress(
        req.user!.id,
        req.params.courseId
      );
      res.status(200).json({
        success: true,
        data: { progress },
      });
    } catch (error) {
      next(error);
    }
  }
);

export const learningRoutes = router;
