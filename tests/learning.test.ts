import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CourseService } from '../src/services/course.service.js';
import { LessonService } from '../src/services/lesson.service.js';
import { QuizService } from '../src/services/quiz.service.js';
import { ProgressService } from '../src/services/progress.service.js';
import { AppError } from '../src/middleware/errorHandler.js';

// In-Memory Database for Learning Domain Tests
interface MockCourse {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  level: string;
  status: string;
  isFree: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface MockModule {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  orderIndex: number;
}

interface MockLesson {
  id: string;
  moduleId: string;
  slug: string;
  title: string;
  description: string | null;
  orderIndex: number;
  isPreview: boolean;
  estimatedMinutes: number | null;
}

interface MockLessonContent {
  id: string;
  lessonId: string;
  contentType: string;
  orderIndex: number;
  body: string;
  codeLanguage: string | null;
  metadata: string | null;
}

interface MockQuiz {
  id: string;
  lessonId: string | null;
  title: string;
  description: string | null;
  passingScore: number;
}

interface MockQuizQuestion {
  id: string;
  quizId: string;
  text: string;
  type: string;
  orderIndex: number;
  explanation: string | null;
}

interface MockQuizOption {
  id: string;
  questionId: string;
  text: string;
  isCorrect: boolean;
  orderIndex: number;
}

interface MockQuizAttempt {
  id: string;
  userId: string;
  quizId: string;
  score: number;
  passed: boolean;
  answersPayload: string;
  createdAt: Date;
}

interface MockLessonProgress {
  id: string;
  userId: string;
  lessonId: string;
  completed: boolean;
  completedAt: Date | null;
}

interface MockEnrollment {
  id: string;
  userId: string;
  courseId: string;
  status: string;
  createdAt: Date;
}

const db = {
  courses: [] as MockCourse[],
  modules: [] as MockModule[],
  lessons: [] as MockLesson[],
  contents: [] as MockLessonContent[],
  quizzes: [] as MockQuiz[],
  questions: [] as MockQuizQuestion[],
  options: [] as MockQuizOption[],
  attempts: [] as MockQuizAttempt[],
  progress: [] as MockLessonProgress[],
  enrollments: [] as MockEnrollment[],
};

// Mock Prisma
vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    course: {
      findMany: vi.fn(async ({ where }: { where?: { status?: string } }) => {
        let results = db.courses;
        if (where?.status) {
          results = results.filter((c) => c.status === where.status);
        }
        return results.map((course) => {
          const modules = db.modules
            .filter((m) => m.courseId === course.id)
            .map((mod) => {
              const lessons = db.lessons.filter((l) => l.moduleId === mod.id);
              return { ...mod, lessons };
            });
          return { ...course, modules };
        });
      }),
      findUnique: vi.fn(async ({ where }: { where: { slug?: string; id?: string } }) => {
        const course = db.courses.find((c) =>
          where.slug ? c.slug === where.slug : c.id === where.id
        );
        if (!course) return null;
        const modules = db.modules
          .filter((m) => m.courseId === course.id)
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((mod) => {
            const lessons = db.lessons
              .filter((l) => l.moduleId === mod.id)
              .sort((a, b) => a.orderIndex - b.orderIndex);
            return { ...mod, lessons };
          });
        return { ...course, modules };
      }),
    },
    lesson: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const lesson = db.lessons.find((l) => l.id === where.id);
        if (!lesson) return null;
        const mod = db.modules.find((m) => m.id === lesson.moduleId);
        const course = db.courses.find((c) => c.id === mod?.courseId);
        const contents = db.contents
          .filter((c) => c.lessonId === lesson.id)
          .sort((a, b) => a.orderIndex - b.orderIndex);
        const quiz = db.quizzes.find((q) => q.lessonId === lesson.id) || null;

        return {
          ...lesson,
          module: {
            ...mod,
            course,
          },
          contents,
          quiz,
        };
      }),
    },
    quiz: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const quiz = db.quizzes.find((q) => q.id === where.id);
        if (!quiz) return null;
        const questions = db.questions
          .filter((q) => q.quizId === quiz.id)
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((question) => {
            const options = db.options
              .filter((o) => o.questionId === question.id)
              .sort((a, b) => a.orderIndex - b.orderIndex);
            return { ...question, options };
          });
        return { ...quiz, questions };
      }),
    },
    quizAttempt: {
      create: vi.fn(async ({ data }: { data: Omit<MockQuizAttempt, 'id' | 'createdAt'> }) => {
        const attempt: MockQuizAttempt = {
          id: `attempt-${Date.now()}-${Math.random()}`,
          userId: data.userId,
          quizId: data.quizId,
          score: data.score,
          passed: data.passed,
          answersPayload: data.answersPayload,
          createdAt: new Date(),
        };
        db.attempts.push(attempt);
        return attempt;
      }),
    },
    enrollment: {
      findUnique: vi.fn(async ({ where }: { where: { userId_courseId: { userId: string; courseId: string } } }) => {
        return (
          db.enrollments.find(
            (e) =>
              e.userId === where.userId_courseId.userId &&
              e.courseId === where.userId_courseId.courseId
          ) || null
        );
      }),
      upsert: vi.fn(async ({ where, create, update }: { where: { userId_courseId: { userId: string; courseId: string } }; create: any; update: any }) => {
        const existing = db.enrollments.find(
          (e) =>
            e.userId === where.userId_courseId.userId &&
            e.courseId === where.userId_courseId.courseId
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const newEnrollment: MockEnrollment = {
          id: `enroll-${Date.now()}`,
          userId: create.userId,
          courseId: create.courseId,
          status: create.status || 'ACTIVE',
          createdAt: new Date(),
        };
        db.enrollments.push(newEnrollment);
        return newEnrollment;
      }),
    },
    lessonProgress: {
      findUnique: vi.fn(async ({ where }: { where: { userId_lessonId: { userId: string; lessonId: string } } }) => {
        return (
          db.progress.find(
            (p) =>
              p.userId === where.userId_lessonId.userId &&
              p.lessonId === where.userId_lessonId.lessonId
          ) || null
        );
      }),
      findMany: vi.fn(async ({ where }: { where: { userId: string; lessonId: { in: string[] }; completed: boolean } }) => {
        return db.progress.filter(
          (p) =>
            p.userId === where.userId &&
            where.lessonId.in.includes(p.lessonId) &&
            p.completed === where.completed
        );
      }),
      upsert: vi.fn(async ({ where, create, update }: { where: { userId_lessonId: { userId: string; lessonId: string } }; create: any; update: any }) => {
        const existing = db.progress.find(
          (p) =>
            p.userId === where.userId_lessonId.userId &&
            p.lessonId === where.userId_lessonId.lessonId
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const newProgress: MockLessonProgress = {
          id: `prog-${Date.now()}`,
          userId: create.userId,
          lessonId: create.lessonId,
          completed: create.completed,
          completedAt: create.completedAt,
        };
        db.progress.push(newProgress);
        return newProgress;
      }),
    },
  },
  checkDatabaseConnection: vi.fn(async () => true),
}));

describe('Learning Domain & Database Architecture', () => {
  beforeEach(() => {
    // Reset DB
    db.courses.length = 0;
    db.modules.length = 0;
    db.lessons.length = 0;
    db.contents.length = 0;
    db.quizzes.length = 0;
    db.questions.length = 0;
    db.options.length = 0;
    db.attempts.length = 0;
    db.progress.length = 0;
    db.enrollments.length = 0;

    // Seed test course
    db.courses.push(
      {
        id: 'c-1',
        slug: 'git-course',
        title: 'Git Complete',
        summary: 'Learn Git',
        description: 'Deep dive into Git',
        thumbnailUrl: null,
        level: 'BEGINNER',
        status: 'PUBLISHED',
        isFree: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'c-draft',
        slug: 'draft-course',
        title: 'Draft Course',
        summary: 'Not ready yet',
        description: null,
        thumbnailUrl: null,
        level: 'ADVANCED',
        status: 'DRAFT',
        isFree: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    );

    db.modules.push({
      id: 'm-1',
      courseId: 'c-1',
      title: 'Module 1: Basics',
      description: 'Basics of Git',
      orderIndex: 1,
    });

    db.lessons.push(
      {
        id: 'l-1',
        moduleId: 'm-1',
        slug: 'git-init',
        title: 'Git Init Lesson',
        description: 'Initialize a repo',
        orderIndex: 1,
        isPreview: true,
        estimatedMinutes: 5,
      },
      {
        id: 'l-2',
        moduleId: 'm-1',
        slug: 'git-branch',
        title: 'Git Branch Lesson',
        description: 'Branching strategies',
        orderIndex: 2,
        isPreview: false,
        estimatedMinutes: 10,
      }
    );

    db.contents.push(
      {
        id: 'cnt-1',
        lessonId: 'l-1',
        contentType: 'HEADING',
        orderIndex: 1,
        body: 'Getting Started with Git',
        codeLanguage: null,
        metadata: null,
      },
      {
        id: 'cnt-2',
        lessonId: 'l-1',
        contentType: 'CODE',
        orderIndex: 2,
        body: 'git init',
        codeLanguage: 'bash',
        metadata: null,
      }
    );

    db.quizzes.push({
      id: 'q-1',
      lessonId: 'l-1',
      title: 'Git Quiz',
      description: 'Test Git knowledge',
      passingScore: 70,
    });

    db.questions.push({
      id: 'ques-1',
      quizId: 'q-1',
      text: 'Which command creates a repo?',
      type: 'MULTIPLE_CHOICE',
      orderIndex: 1,
      explanation: 'git init creates a new Git repository.',
    });

    db.options.push(
      { id: 'opt-1', questionId: 'ques-1', text: 'git init', isCorrect: true, orderIndex: 1 },
      { id: 'opt-2', questionId: 'ques-1', text: 'git start', isCorrect: false, orderIndex: 2 }
    );
  });

  describe('Course & Module Hierarchy', () => {
    it('returns only published courses in course catalog', async () => {
      const courses = await CourseService.listPublishedCourses();
      expect(courses).toHaveLength(1);
      expect(courses[0].slug).toBe('git-course');
      expect(courses[0].lessonCount).toBe(2);
      expect(courses[0].moduleCount).toBe(1);
    });

    it('retrieves course syllabus with ordered modules and lessons by slug', async () => {
      const course = await CourseService.getCourseBySlug('git-course');
      expect(course.title).toBe('Git Complete');
      expect(course.modules).toHaveLength(1);
      expect(course.modules[0].lessons).toHaveLength(2);
      expect(course.modules[0].lessons[0].orderIndex).toBe(1);
      expect(course.modules[0].lessons[1].orderIndex).toBe(2);
    });

    it('throws 404 for draft or non-existent course slug', async () => {
      await expect(CourseService.getCourseBySlug('draft-course')).rejects.toThrow(AppError);
      await expect(CourseService.getCourseBySlug('unknown-slug')).rejects.toThrow(AppError);
    });
  });

  describe('Lesson Content & Access Entitlement', () => {
    it('allows guest/un-enrolled access to preview lessons', async () => {
      const lesson = await LessonService.getLessonById('l-1');
      expect(lesson.title).toBe('Git Init Lesson');
      expect(lesson.contents).toHaveLength(2);
      expect(lesson.contents[0].contentType).toBe('HEADING');
      expect(lesson.contents[1].contentType).toBe('CODE');
      expect(lesson.contents[1].codeLanguage).toBe('bash');
    });

    it('enforces enrollment on paid non-preview lessons', async () => {
      // Set course as paid
      const course = db.courses.find((c) => c.id === 'c-1');
      if (course) course.isFree = false;

      // Unauthenticated access fails
      await expect(LessonService.getLessonById('l-2')).rejects.toMatchObject({
        statusCode: 401,
      });

      // Un-enrolled user fails
      await expect(LessonService.getLessonById('l-2', 'user-guest')).rejects.toMatchObject({
        statusCode: 403,
      });

      // Enroll user
      await CourseService.enrollUser('user-guest', 'c-1');

      // Enrolled user succeeds
      const enrolledLesson = await LessonService.getLessonById('l-2', 'user-guest');
      expect(enrolledLesson.id).toBe('l-2');
    });
  });

  describe('MANDATORY TEST: Quiz Security & Answer Secrecy', () => {
    it('STRICTLY OMITS isCorrect from learner quiz payload', async () => {
      const learnerQuiz = await QuizService.getLearnerQuiz('q-1');

      expect(learnerQuiz.id).toBe('q-1');
      expect(learnerQuiz.questions).toHaveLength(1);

      const question = learnerQuiz.questions[0];
      expect(question.options).toHaveLength(2);

      // Verify that NO option exposes isCorrect
      question.options.forEach((opt: any) => {
        expect(opt.isCorrect).toBeUndefined();
        expect(opt).not.toHaveProperty('isCorrect');
      });
    });

    it('evaluates answers server-side, calculates score, and stores attempt', async () => {
      const result = await QuizService.submitQuiz('q-1', 'user-123', {
        answers: [{ questionId: 'ques-1', optionId: 'opt-1' }], // Correct answer
      });

      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
      expect(result.correctCount).toBe(1);
      expect(result.results[0].isCorrect).toBe(true);
      expect(result.results[0].explanation).toBe('git init creates a new Git repository.');

      expect(db.attempts).toHaveLength(1);
      expect(db.attempts[0].userId).toBe('user-123');
      expect(db.attempts[0].score).toBe(100);
    });

    it('calculates failing score when incorrect answer submitted', async () => {
      const result = await QuizService.submitQuiz('q-1', 'user-123', {
        answers: [{ questionId: 'ques-1', optionId: 'opt-2' }], // Wrong answer
      });

      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
      expect(result.correctCount).toBe(0);
      expect(result.results[0].isCorrect).toBe(false);
    });
  });

  describe('Progress Tracking & User Isolation', () => {
    it('idempotently marks lesson progress without duplicate records', async () => {
      // First completion
      const res1 = await ProgressService.markLessonProgress('user-1', 'l-1', true);
      expect(res1.completed).toBe(true);
      expect(db.progress).toHaveLength(1);

      // Repeated request (idempotent)
      const res2 = await ProgressService.markLessonProgress('user-1', 'l-1', true);
      expect(res2.completed).toBe(true);
      expect(db.progress).toHaveLength(1); // No duplicates
    });

    it('dynamically calculates course progress percentage', async () => {
      // 0 of 2 completed
      const initialProgress = await ProgressService.getCourseProgress('user-1', 'c-1');
      expect(initialProgress.totalLessons).toBe(2);
      expect(initialProgress.completedLessons).toBe(0);
      expect(initialProgress.percentage).toBe(0);

      // Complete 1 of 2 lessons
      await ProgressService.markLessonProgress('user-1', 'l-1', true);
      const halfProgress = await ProgressService.getCourseProgress('user-1', 'c-1');
      expect(halfProgress.completedLessons).toBe(1);
      expect(halfProgress.percentage).toBe(50);

      // Complete 2 of 2 lessons
      await ProgressService.markLessonProgress('user-1', 'l-2', true);
      const fullProgress = await ProgressService.getCourseProgress('user-1', 'c-1');
      expect(fullProgress.completedLessons).toBe(2);
      expect(fullProgress.percentage).toBe(100);
    });

    it('enforces user isolation in progress tracking', async () => {
      // User A completes lesson 1
      await ProgressService.markLessonProgress('user-A', 'l-1', true);

      // User B should still have 0% progress
      const userBProgress = await ProgressService.getCourseProgress('user-B', 'c-1');
      expect(userBProgress.completedLessons).toBe(0);
      expect(userBProgress.percentage).toBe(0);
    });
  });
});
