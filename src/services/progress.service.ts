import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export class ProgressService {
  /**
   * Idempotently mark a lesson as completed or incomplete for the authenticated learner.
   */
  static async markLessonProgress(userId: string, lessonId: string, completed = true) {
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
    });

    if (!lesson) {
      throw new AppError('Lesson not found.', 404, 'LESSON_NOT_FOUND');
    }

    const progress = await prisma.lessonProgress.upsert({
      where: {
        userId_lessonId: {
          userId,
          lessonId,
        },
      },
      update: {
        completed,
        completedAt: completed ? new Date() : null,
      },
      create: {
        userId,
        lessonId,
        completed,
        completedAt: completed ? new Date() : null,
      },
    });

    return {
      lessonId: progress.lessonId,
      completed: progress.completed,
      completedAt: progress.completedAt,
    };
  }

  /**
   * Dynamically derive course completion percentage from lesson-level progress records.
   */
  static async getCourseProgress(userId: string, courseId: string) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        modules: {
          include: {
            lessons: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (!course) {
      throw new AppError('Course not found.', 404, 'COURSE_NOT_FOUND');
    }

    const lessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id));
    const totalLessons = lessonIds.length;

    if (totalLessons === 0) {
      return {
        courseId,
        totalLessons: 0,
        completedLessons: 0,
        percentage: 0,
        completedLessonIds: [],
      };
    }

    const completedProgress = await prisma.lessonProgress.findMany({
      where: {
        userId,
        lessonId: { in: lessonIds },
        completed: true,
      },
      select: { lessonId: true },
    });

    const completedLessonIds = completedProgress.map((p) => p.lessonId);
    const completedCount = completedLessonIds.length;
    const percentage = Math.round((completedCount / totalLessons) * 100);

    return {
      courseId,
      totalLessons,
      completedLessons: completedCount,
      percentage,
      completedLessonIds,
    };
  }
}
