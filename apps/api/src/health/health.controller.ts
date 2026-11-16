import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import type { Health } from "@dinego/shared";
import { HealthResponseDto } from "./dto/health.dto.js";

@ApiTags("Health")
@Controller("health")
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @ApiOperation({ summary: "Service health", description: "Checks the API and SQLite connection." })
  @ApiOkResponse({ type: HealthResponseDto })
  @Get()
  async check(): Promise<Health> {
    await this.dataSource.query("SELECT 1");

    return {
      status: "ok",
      database: "up",
      timestamp: new Date().toISOString(),
    };
  }
}
