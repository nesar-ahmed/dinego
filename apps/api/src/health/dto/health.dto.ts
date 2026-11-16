import { ApiProperty } from "@nestjs/swagger";

export class HealthResponseDto {
  @ApiProperty({ enum: ["ok"], example: "ok" })
  status!: "ok";

  @ApiProperty({ enum: ["up"], example: "up" })
  database!: "up";

  @ApiProperty({ example: "2026-11-16T00:00:00.000Z", format: "date-time" })
  timestamp!: string;
}
