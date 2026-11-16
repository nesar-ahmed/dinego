import "reflect-metadata";
import "dotenv/config";
import { DataSource, Not } from "typeorm";
import { buildDataSourceOptions } from "../data-source.js";
import { User } from "../../users/entities/user.entity.js";
import { seedUsers, userAccounts } from "./users.seed.js";

async function main(): Promise<void> {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  try {
    await dataSource.transaction(async (manager) => {
      await seedUsers(manager);
    });

    const repository = dataSource.getRepository(User);
    const [total, staff, customers] = await Promise.all([
      repository.count(),
      repository.count({ where: { role: Not("CUSTOMER") } }),
      repository.count({ where: { role: "CUSTOMER" } }),
    ]);

    console.log(
      [
        "Seed complete:",
        `  users=${total} staff=${staff} customers=${customers}`,
        "",
        "Demo accounts:",
        ...userAccounts.map(
          (account) =>
            `  ${account.role.padEnd(8)} ${account.email.padEnd(24)} / ${account.password}`,
        ),
      ].join("\n"),
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
