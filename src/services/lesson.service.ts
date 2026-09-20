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

    // Query course curriculum hierarchy for canonical navigation & sidebar syllabus
    const courseModules = await prisma.module.findMany({
      where: { courseId: lesson.module.course.id },
      orderBy: { orderIndex: 'asc' },
      include: {
        lessons: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            title: true,
            slug: true,
            orderIndex: true,
            isPreview: true,
            estimatedMinutes: true,
          },
        },
      },
    });

    const flattenedLessons = courseModules.flatMap((m) =>
      m.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        slug: l.slug,
        orderIndex: l.orderIndex,
        moduleId: m.id,
        moduleTitle: m.title,
      }))
    );

    const currentIndex = flattenedLessons.findIndex((l) => l.id === lesson.id);
    const previousLesson =
      currentIndex > 0
        ? {
            id: flattenedLessons[currentIndex - 1].id,
            title: flattenedLessons[currentIndex - 1].title,
            slug: flattenedLessons[currentIndex - 1].slug,
            orderIndex: flattenedLessons[currentIndex - 1].orderIndex,
          }
        : null;

    const nextLesson =
      currentIndex >= 0 && currentIndex < flattenedLessons.length - 1
        ? {
            id: flattenedLessons[currentIndex + 1].id,
            title: flattenedLessons[currentIndex + 1].title,
            slug: flattenedLessons[currentIndex + 1].slug,
            orderIndex: flattenedLessons[currentIndex + 1].orderIndex,
          }
        : null;

    // Check user lesson progress
    let completedLessonIds = new Set<string>();
    if (userId) {
      const userProgress = await prisma.lessonProgress.findMany({
        where: {
          userId,
          lessonId: { in: flattenedLessons.map((l) => l.id) },
          completed: true,
        },
        select: { lessonId: true },
      });
      completedLessonIds = new Set(userProgress.map((p) => p.lessonId));
    }

    const syllabus = courseModules.map((m) => ({
      id: m.id,
      title: m.title,
      orderIndex: m.orderIndex,
      lessons: m.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        slug: l.slug,
        orderIndex: l.orderIndex,
        isPreview: l.isPreview,
        estimatedMinutes: l.estimatedMinutes,
        isCompleted: completedLessonIds.has(l.id),
      })),
    }));

    return {
      id: lesson.id,
      title: lesson.title,
      slug: lesson.slug,
      description: lesson.description,
      orderIndex: lesson.orderIndex,
      isPreview: lesson.isPreview,
      estimatedMinutes: lesson.estimatedMinutes,
      isCompleted: completedLessonIds.has(lesson.id),
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
      navigation: {
        previousLesson,
        nextLesson,
      },
      syllabus,
    };
  }
}
