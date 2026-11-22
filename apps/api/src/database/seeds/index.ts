import "reflect-metadata";
import "dotenv/config";
import { DataSource, Not } from "typeorm";
import { buildDataSourceOptions } from "../data-source.js";
import { MenuCategory } from "../../menu/entities/menu-category.entity.js";
import { MenuItem } from "../../menu/entities/menu-item.entity.js";
import { DiningTable } from "../../tables/entities/dining-table.entity.js";
import { User } from "../../users/entities/user.entity.js";
import { seedDemoService } from "./demo-service.seed.js";
import { seedMenu } from "./menu.seed.js";
import { seedTables } from "./tables.seed.js";
import { seedUsers, userAccounts } from "./users.seed.js";

async function main(): Promise<void> {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  try {
    await dataSource.transaction(async (manager) => {
      await seedUsers(manager);
      await seedMenu(manager);
      await seedTables(manager);
    });

    // After the base data is committed: it runs the real checkout and staff services.
    const demo = await seedDemoService(dataSource);
    const [board] = await dataSource.query(
      `SELECT SUM("status" IN ('SENT', 'IN_PROGRESS', 'READY', 'SERVED')) AS "dineIn",
              SUM("status" IN ('PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP')) AS "takeaway",
              COUNT(*) AS "total"
       FROM "orders"`,
    );

    const repository = dataSource.getRepository(User);
    const [total, staff, customers, menuCategories, menuItems, tables] = await Promise.all([
      repository.count(),
      repository.count({ where: { role: Not("CUSTOMER") } }),
      repository.count({ where: { role: "CUSTOMER" } }),
      dataSource.getRepository(MenuCategory).count(),
      dataSource.getRepository(MenuItem).count(),
      dataSource.getRepository(DiningTable).count(),
    ]);

    console.log(
      [
        "Seed complete:",
        `  users=${total} staff=${staff} customers=${customers}`,
        `  menu categories=${menuCategories} items=${menuItems}`,
        `  dining tables=${tables}`,
        demo.created
          ? `  demo service: ${demo.orders} orders placed and moved along by the staff`
          : "  demo service: already seeded (existing demo orders are left as they are)",
        `  orders=${board.total} in service: dine-in=${board.dineIn ?? 0} takeaway=${board.takeaway ?? 0}`,
        ...demo.skipped.map((entry) => `  skipped demo order ${entry}`),
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
