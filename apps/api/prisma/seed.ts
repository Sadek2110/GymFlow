import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { BASE_EXERCISES } from './exercises.data';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@gymflow.local';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN', autoReserveEnabled: true, autoReserveTime: '09:00 - 10:00' },
    create: {
      name: 'Admin',
      email: adminEmail,
      passwordHash,
      role: 'ADMIN',
      autoReserveEnabled: true,
      autoReserveTime: '09:00 - 10:00',
      profile: { create: {} },
    },
  });
  console.log(`✔ Admin listo: ${admin.email}`);

  let created = 0;
  for (const ex of BASE_EXERCISES) {
    const exists = await prisma.exercise.findFirst({ where: { name: ex.name } });
    if (!exists) {
      await prisma.exercise.create({ data: ex });
      created += 1;
    }
  }
  console.log(
    `✔ Ejercicios base: ${created} creados, ${BASE_EXERCISES.length - created} ya existían (total catálogo: ${BASE_EXERCISES.length})`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
