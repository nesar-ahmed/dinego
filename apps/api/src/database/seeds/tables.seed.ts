import type { EntityManager } from "typeorm";
import { DiningTable } from "../../tables/entities/dining-table.entity.js";

/**
 * Demo floor: 8 tables and 48 seats, matching the web app's restaurant details
 * (`seats: 48`, "Main floor · 8 tables").
 */
export const floorPlan: Array<{ label: string; seats: number; zone: string }> = [
  { label: "T1", seats: 4, zone: "Window" },
  { label: "T2", seats: 4, zone: "Window" },
  { label: "T3", seats: 4, zone: "Window" },
  { label: "T4", seats: 4, zone: "Window" },
  { label: "T5", seats: 6, zone: "Main floor" },
  { label: "T6", seats: 6, zone: "Main floor" },
  { label: "T7", seats: 8, zone: "Main floor" },
  { label: "T8", seats: 12, zone: "Chef's table" },
];

/**
 * Idempotent by label. Re-seeding restores seats, zone, and active, but never touches `status`,
 * so running the seed during service does not free occupied tables.
 */
export async function seedTables(manager: EntityManager): Promise<void> {
  const repository = manager.getRepository(DiningTable);

  for (const entry of floorPlan) {
    const existing = await repository.findOne({ where: { label: entry.label } });

    if (existing) {
      existing.seats = entry.seats;
      existing.zone = entry.zone;
      existing.active = true;
      await repository.save(existing);
      continue;
    }

    await repository.save(repository.create({ ...entry, status: "FREE", active: true }));
  }
}
