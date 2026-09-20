import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { CourseService } from './course.service.js';

export class LessonService {
  /**
   * Fetch a lesson and its ordered content blocks, enforcing enrollment gating.
   */
  static async getLessonById(lessonId: string, userId?: string) {
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        module: {
          include: {
            course: {
              select: {
                id: true,
                slug: true,
                title: true,
                isFree: true,
                status: true,
              },
            },
          },
        },
        contents: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            contentType: true,
            orderIndex: true,
            body: true,
            codeLanguage: true,
            metadata: true,
          },
        },
        quiz: {
          select: {
            id: true,
            title: true,
            description: true,
            passingScore: true,
          },
        },
      },
    });

    if (!lesson) {
      throw new AppError('Lesson not found.', 404, 'LESSON_NOT_FOUND');
    }

    // Access Entitlement Check
    const isFreeCourse = lesson.module.course.isFree;
    const isPreviewLesson = lesson.isPreview;

    if (!isPreviewLesson && !isFreeCourse) {
      if (!userId) {
        throw new AppError('Authentication and enrollment required.', 401, 'UNAUTHORIZED');
      }

      const isEnrolled = await CourseService.isEnrolled(userId, lesson.module.course.id);
      if (!isEnrolled) {
        throw new AppError(
          'Enrollment required to access this lesson.',
          403,
          'ENROLLMENT_REQUIRED'
        );
      }
    }

    return {
      id: lesson.id,
      title: lesson.title,
      slug: lesson.slug,
      description: lesson.description,
      orderIndex: lesson.orderIndex,
      isPreview: lesson.isPreview,
      estimatedMinutes: lesson.estimatedMinutes,
      course: {
        id: lesson.module.course.id,
        slug: lesson.module.course.slug,
        title: lesson.module.course.title,
      },
      module: {
        id: lesson.module.id,
        title: lesson.module.title,
      },
      contents: lesson.contents,
      quiz: lesson.quiz,
    };
  }
}
