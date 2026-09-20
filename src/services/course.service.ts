import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export class CourseService {
  /**
   * List all published courses with module and lesson counts.
   */
  static async listPublishedCourses() {
    const courses = await prisma.course.findMany({
      where: { status: 'PUBLISHED' },
      include: {
        modules: {
          include: {
            lessons: {
              select: { id: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return courses.map((course) => {
      const totalLessons = course.modules.reduce((sum, mod) => sum + mod.lessons.length, 0);

      return {
        id: course.id,
        slug: course.slug,
        title: course.title,
        summary: course.summary,
        description: course.description,
        thumbnailUrl: course.thumbnailUrl,
        level: course.level,
        isFree: course.isFree,
        moduleCount: course.modules.length,
        lessonCount: totalLessons,
        createdAt: course.createdAt,
      };
    });
  }

  /**
   * Fetch full course syllabus and curriculum by slug.
   */
  static async getCourseBySlug(slug: string) {
    const course = await prisma.course.findUnique({
      where: { slug },
      include: {
        modules: {
          orderBy: { orderIndex: 'asc' },
          include: {
            lessons: {
              orderBy: { orderIndex: 'asc' },
              select: {
                id: true,
                slug: true,
                title: true,
                description: true,
                orderIndex: true,
                isPreview: true,
                estimatedMinutes: true,
              },
            },
          },
        },
      },
    });

    if (!course || course.status !== 'PUBLISHED') {
      throw new AppError('Course not found.', 404, 'COURSE_NOT_FOUND');
    }

    return course;
  }

  /**
   * Check whether a user has an active enrollment in a course.
   */
  static async isEnrolled(userId: string, courseId: string): Promise<boolean> {
    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
    });
    return !!enrollment && enrollment.status === 'ACTIVE';
  }

  /**
   * Enroll a learner in a course.
   */
  static async enrollUser(userId: string, courseId: string) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course || course.status !== 'PUBLISHED') {
      throw new AppError('Course not found or unavailable for enrollment.', 404, 'COURSE_NOT_FOUND');
    }

    const enrollment = await prisma.enrollment.upsert({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
      update: {
        status: 'ACTIVE',
      },
      create: {
        userId,
        courseId,
        status: 'ACTIVE',
      },
    });

    return {
      id: enrollment.id,
      courseId: enrollment.courseId,
      status: enrollment.status,
      enrolledAt: enrollment.createdAt,
    };
  }
}
