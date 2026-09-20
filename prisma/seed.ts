import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[DevLearn Seed] Starting development database seeding...');

  // Create or update sample course
  const course = await prisma.course.upsert({
    where: { slug: 'git-github-masterclass' },
    update: {},
    create: {
      slug: 'git-github-masterclass',
      title: 'Git & GitHub Developer Masterclass',
      summary: 'Master version control, branching strategies, pull requests, and collaborative workflows.',
      description: 'A comprehensive, hands-on masterclass designed for developers wanting to master Git and GitHub from first principles.',
      level: 'BEGINNER',
      status: 'PUBLISHED',
      isFree: true,
      modules: {
        create: [
          {
            title: 'Git Foundations & Version Control',
            description: 'Core concepts of distributed version control, repositories, and snapshots.',
            orderIndex: 1,
            lessons: {
              create: [
                {
                  slug: 'version-control-fundamentals',
                  title: 'Introduction to Version Control',
                  description: 'Understand how Git tracks snapshots and history.',
                  orderIndex: 1,
                  isPreview: true,
                  estimatedMinutes: 10,
                  contents: {
                    create: [
                      {
                        contentType: 'HEADING',
                        orderIndex: 1,
                        body: 'Why Distributed Version Control Matters',
                      },
                      {
                        contentType: 'TEXT',
                        orderIndex: 2,
                        body: 'Version control systems allow developers to track code changes, coordinate with teammates, and safely revert when bugs are introduced.',
                      },
                      {
                        contentType: 'CODE',
                        orderIndex: 3,
                        body: 'git init\ngit status\ngit add .\ngit commit -m "feat: initial project foundation"',
                        codeLanguage: 'bash',
                      },
                      {
                        contentType: 'CALLOUT',
                        orderIndex: 4,
                        body: 'Git records changes as snapshots over time, rather than tracking differences.',
                        metadata: JSON.stringify({ variant: 'tip' }),
                      },
                    ],
                  },
                  quiz: {
                    create: {
                      title: 'Git Foundations Checkpoint',
                      description: 'Test your understanding of Git snapshots and core commands.',
                      passingScore: 70,
                      questions: {
                        create: [
                          {
                            text: 'Which command initializes a new Git repository in the current directory?',
                            type: 'MULTIPLE_CHOICE',
                            orderIndex: 1,
                            explanation: 'git init creates an empty Git repository or reinitializes an existing one.',
                            options: {
                              create: [
                                { text: 'git start', isCorrect: false, orderIndex: 1 },
                                { text: 'git init', isCorrect: true, orderIndex: 2 },
                                { text: 'git create', isCorrect: false, orderIndex: 3 },
                                { text: 'git repo', isCorrect: false, orderIndex: 4 },
                              ],
                            },
                          },
                          {
                            text: 'What is the purpose of the Git staging area (index)?',
                            type: 'MULTIPLE_CHOICE',
                            orderIndex: 2,
                            explanation: 'The staging area allows you to craft exactly which changes will be included in the next commit.',
                            options: {
                              create: [
                                { text: 'To format changes before commit', isCorrect: true, orderIndex: 1 },
                                { text: 'To run unit tests automatically', isCorrect: false, orderIndex: 2 },
                                { text: 'To deploy code to production', isCorrect: false, orderIndex: 3 },
                                { text: 'To delete remote repositories', isCorrect: false, orderIndex: 4 },
                              ],
                            },
                          },
                        ],
                      },
                    },
                  },
                },
                {
                  slug: 'branching-and-merging',
                  title: 'Branching and Collaborative Workflows',
                  description: 'Learn isolated feature branch creation and merging.',
                  orderIndex: 2,
                  isPreview: false,
                  estimatedMinutes: 15,
                  contents: {
                    create: [
                      {
                        contentType: 'HEADING',
                        orderIndex: 1,
                        body: 'Branching in Git',
                      },
                      {
                        contentType: 'TEXT',
                        orderIndex: 2,
                        body: 'Branches allow developers to work on isolated features without impacting the main codebase.',
                      },
                      {
                        contentType: 'CODE',
                        orderIndex: 3,
                        body: 'git checkout -b feature/auth-foundation\ngit push origin feature/auth-foundation',
                        codeLanguage: 'bash',
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  });

  console.log(`[DevLearn Seed] Successfully seeded course: ${course.title} (ID: ${course.id})`);
}

main()
  .catch((e) => {
    console.error('[DevLearn Seed Error]:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
