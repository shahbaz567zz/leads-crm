import { hash } from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

type SeedUserInput = {
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  isPriorityAgent?: boolean;
};

async function upsertUser(input: SeedUserInput, passwordHash: string) {
  return prisma.user.upsert({
    where: { email: input.email },
    update: {
      name: input.name,
      phone: input.phone,
      role: input.role,
      isActive: true,
      isPriorityAgent: input.isPriorityAgent ?? false,
      passwordHash,
    },
    create: {
      ...input,
      passwordHash,
      isActive: true,
      isPriorityAgent: input.isPriorityAgent ?? false,
    },
  });
}

async function main() {
  const defaultPassword = process.env.SEED_DEFAULT_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await hash(defaultPassword, 12);

  const adminEmail =
    process.env.SEED_ADMIN_EMAIL?.toLowerCase() ?? "admin@collegetpoint.in";
  const managerEmail =
    process.env.SEED_MANAGER_EMAIL?.toLowerCase() ?? "manager@collegetpoint.in";

  const baseUsers: SeedUserInput[] = [
    {
      name: "CRM Admin",
      email: adminEmail,
      phone: "9876543210",
      role: UserRole.ADMIN,
      isPriorityAgent: true,
    },
    {
      name: "Admissions Manager",
      email: managerEmail,
      phone: "9876543211",
      role: UserRole.MANAGER,
      isPriorityAgent: true,
    },
    {
      name: "Telecaller One",
      email: "telecaller1@collegetpoint.in",
      phone: "9876543212",
      role: UserRole.TELECALLER,
      isPriorityAgent: true,
    },
    {
      name: "Telecaller Two",
      email: "telecaller2@collegetpoint.in",
      phone: "9876543213",
      role: UserRole.TELECALLER,
      isPriorityAgent: true,
    },
    {
      name: "Telecaller Three",
      email: "telecaller3@collegetpoint.in",
      phone: "9876543214",
      role: UserRole.TELECALLER,
    },
    {
      name: "Telecaller Four",
      email: "telecaller4@collegetpoint.in",
      phone: "9876543215",
      role: UserRole.TELECALLER,
    },
  ];

  await Promise.all(baseUsers.map((user) => upsertUser(user, passwordHash)));

  console.log("Seed complete.");
  console.log(`Admin login: ${adminEmail}`);
  console.log(`Default password: ${defaultPassword}`);
}

main()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
