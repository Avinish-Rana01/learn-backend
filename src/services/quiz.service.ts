import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export interface QuizSubmission {
  answers: {
    questionId: string;
    optionId: string;
  }[];
}

export class QuizService {
  /**
   * Fetch learner-safe quiz payload.
   * SECURITY GUARANTEE: isCorrect flags are strictly omitted from all options.
   */
  static async getLearnerQuiz(quizId: string) {
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
          include: {
            options: {
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
      },
    });

    if (!quiz) {
      throw new AppError('Quiz not found.', 404, 'QUIZ_NOT_FOUND');
    }

    return {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      passingScore: quiz.passingScore,
      questionCount: quiz.questions.length,
      questions: quiz.questions.map((q) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        orderIndex: q.orderIndex,
        options: q.options.map((opt) => ({
          id: opt.id,
          text: opt.text,
          orderIndex: opt.orderIndex,
          // NOTE: isCorrect is NEVER returned here
        })),
      })),
    };
  }

  /**
   * Evaluate quiz submission strictly on the backend.
   * Calculates score percentage, checks pass threshold, and records QuizAttempt.
   */
  static async submitQuiz(quizId: string, userId: string, submission: QuizSubmission) {
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: {
          include: {
            options: true,
          },
        },
      },
    });

    if (!quiz) {
      throw new AppError('Quiz not found.', 404, 'QUIZ_NOT_FOUND');
    }

    const totalQuestions = quiz.questions.length;
    if (totalQuestions === 0) {
      throw new AppError('Quiz has no questions configured.', 400, 'EMPTY_QUIZ');
    }

    const submissionMap = new Map<string, string>();
    submission.answers.forEach((ans) => {
      submissionMap.set(ans.questionId, ans.optionId);
    });

    let correctCount = 0;

    const questionResults = quiz.questions.map((q) => {
      const selectedOptionId = submissionMap.get(q.id);
      const correctOption = q.options.find((opt) => opt.isCorrect);
      const isQuestionCorrect = !!selectedOptionId && correctOption?.id === selectedOptionId;

      if (isQuestionCorrect) {
        correctCount++;
      }

      return {
        questionId: q.id,
        selectedOptionId: selectedOptionId || null,
        correctOptionId: correctOption?.id || null,
        isCorrect: isQuestionCorrect,
        explanation: q.explanation || null,
      };
    });

    const score = Math.round((correctCount / totalQuestions) * 100);
    const passed = score >= quiz.passingScore;

    // Record learner attempt in database
    const attempt = await prisma.quizAttempt.create({
      data: {
        userId,
        quizId,
        score,
        passed,
        answersPayload: JSON.stringify(submission.answers),
      },
    });

    return {
      attemptId: attempt.id,
      score,
      passed,
      passingScore: quiz.passingScore,
      totalQuestions,
      correctCount,
      submittedAt: attempt.createdAt,
      results: questionResults,
    };
  }
}
