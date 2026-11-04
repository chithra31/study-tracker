import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DEMO_PASSWORD = 'Password123!';

/** Date `n` days before today, as a date-only value (UTC midnight). */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

interface TopicSeed {
  key: string;
  title: string;
  completed: boolean;
  requires: string[];
}
interface GoalSeed {
  title: string;
  description: string;
  owner: 'alice' | 'bob';
  topics: TopicSeed[];
}

// 3 goals, 12 topics. Mix of complete / unlocked-in-progress / locked topics.
const goals: GoalSeed[] = [
  {
    title: 'Learn TypeScript',
    description: 'Go from JavaScript to confident TypeScript.',
    owner: 'alice',
    topics: [
      { key: 'ts1', title: 'Basic Types', completed: true, requires: [] },
      { key: 'ts2', title: 'Functions & Interfaces', completed: true, requires: ['ts1'] },
      { key: 'ts3', title: 'Generics', completed: false, requires: ['ts2'] },
      { key: 'ts4', title: 'Advanced Types', completed: false, requires: ['ts2', 'ts3'] },
    ],
  },
  {
    title: 'Master SQL',
    description: 'Query and optimise relational databases.',
    owner: 'alice',
    topics: [
      { key: 'sql1', title: 'SELECT Basics', completed: true, requires: [] },
      { key: 'sql2', title: 'Joins', completed: true, requires: ['sql1'] },
      { key: 'sql3', title: 'Aggregations', completed: true, requires: ['sql1'] },
      { key: 'sql4', title: 'Query Optimisation', completed: false, requires: ['sql2', 'sql3'] },
    ],
  },
  {
    title: 'Web Fundamentals',
    description: 'Build the base skills for front-end development.',
    owner: 'bob',
    topics: [
      { key: 'web1', title: 'HTML & CSS', completed: true, requires: [] },
      { key: 'web2', title: 'JavaScript Basics', completed: false, requires: ['web1'] },
      { key: 'web3', title: 'DOM Manipulation', completed: false, requires: ['web2'] },
      { key: 'web4', title: 'Frontend Frameworks', completed: false, requires: ['web2', 'web3'] },
    ],
  },
];

// 30 sessions over six weeks, only on topics that are unlocked.
// [owner, topicKey, daysAgo, minutes, note]
const sessions: [string, string, number, number, string][] = [
  ['alice', 'ts1', 41, 45, 'Primitive types and type annotations'],
  ['alice', 'ts1', 38, 30, 'Arrays, tuples and enums'],
  ['alice', 'ts1', 35, 60, 'Practice exercises'],
  ['alice', 'ts2', 30, 50, 'Function signatures'],
  ['alice', 'ts2', 27, 40, 'Interfaces vs type aliases'],
  ['alice', 'ts2', 24, 75, 'Optional and readonly properties'],
  ['alice', 'ts3', 17, 45, 'Generic functions'],
  ['alice', 'ts3', 10, 60, 'Generic constraints'],
  ['alice', 'ts3', 3, 35, 'Generic classes, still confusing'],
  ['alice', 'sql1', 40, 30, 'SELECT, WHERE, ORDER BY'],
  ['alice', 'sql1', 37, 25, 'LIMIT and DISTINCT'],
  ['alice', 'sql2', 32, 55, 'INNER JOIN'],
  ['alice', 'sql2', 29, 45, 'LEFT and RIGHT joins'],
  ['alice', 'sql3', 23, 40, 'COUNT, SUM, AVG'],
  ['alice', 'sql3', 20, 50, 'GROUP BY and HAVING'],
  ['alice', 'sql4', 13, 60, 'Reading EXPLAIN output'],
  ['alice', 'sql4', 6, 45, 'Indexes'],
  ['bob', 'web1', 42, 90, 'HTML structure and semantic tags'],
  ['bob', 'web1', 39, 60, 'CSS selectors and box model'],
  ['bob', 'web1', 33, 75, 'Flexbox layout'],
  ['bob', 'web1', 28, 45, 'Responsive design basics'],
  ['bob', 'web1', 22, 120, 'Built a landing page'],
  ['bob', 'web2', 18, 40, 'Variables and functions'],
  ['bob', 'web2', 15, 50, 'Arrays and objects'],
  ['bob', 'web2', 12, 30, 'Loops and conditionals'],
  ['bob', 'web2', 9, 65, 'Array methods: map, filter'],
  ['bob', 'web2', 7, 45, 'Async basics'],
  ['bob', 'web2', 4, 55, 'Fetch API practice'],
  ['bob', 'web2', 2, 35, 'Review and small quiz'],
  ['bob', 'web2', 1, 20, 'Closures'],
];

async function main() {
  // Reset so the seed can be re-run safely.
  await prisma.studySession.deleteMany();
  await prisma.topicPrerequisite.deleteMany();
  await prisma.topic.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.user.deleteMany();
  await prisma.config.deleteMany();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = {
    mentor: await prisma.user.create({
      data: { email: 'mentor@example.com', name: 'Morgan Mentor', passwordHash, role: Role.MENTOR },
    }),
    alice: await prisma.user.create({
      data: { email: 'alice@example.com', name: 'Alice Learner', passwordHash, role: Role.LEARNER },
    }),
    bob: await prisma.user.create({
      data: { email: 'bob@example.com', name: 'Bob Learner', passwordHash, role: Role.LEARNER },
    }),
  };

  await prisma.config.createMany({
    data: [
      { key: 'MIN_SESSION_MINUTES', value: 5, description: 'Minimum minutes allowed for one study session' },
      { key: 'MAX_SESSION_MINUTES', value: 480, description: 'Maximum minutes allowed for one study session' },
      { key: 'MAX_PREREQUISITES_PER_TOPIC', value: 3, description: 'Maximum number of prerequisites a topic can have' },
    ],
  });

  const topicIds = new Map<string, number>();
  for (const g of goals) {
    const goal = await prisma.goal.create({
      data: { title: g.title, description: g.description, ownerId: users[g.owner].id },
    });
    for (const t of g.topics) {
      const topic = await prisma.topic.create({
        data: {
          goalId: goal.id,
          title: t.title,
          completed: t.completed,
          completedAt: t.completed ? daysAgo(1) : null,
        },
      });
      topicIds.set(t.key, topic.id);
    }
  }

  for (const g of goals) {
    for (const t of g.topics) {
      for (const req of t.requires) {
        await prisma.topicPrerequisite.create({
          data: { topicId: topicIds.get(t.key)!, prerequisiteId: topicIds.get(req)! },
        });
      }
    }
  }

  for (const [owner, key, ago, minutes, note] of sessions) {
    await prisma.studySession.create({
      data: {
        userId: users[owner as 'alice' | 'bob'].id,
        topicId: topicIds.get(key)!,
        date: daysAgo(ago),
        minutes,
        note,
      },
    });
  }

  console.log(`Seeded: 3 users, ${goals.length} goals, ${topicIds.size} topics, ${sessions.length} sessions`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
