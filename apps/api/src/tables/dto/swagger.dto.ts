import { ApiProperty } from "@nestjs/swagger";
import {
  TABLE_ERROR_CODES,
  TABLE_MAX_SEATS,
  TABLE_STATUSES,
  type TableStatus,
} from "@dinego/shared";

export class PublicTableDto {
  @ApiProperty({ example: 4 })
  id!: number;

  @ApiProperty({ example: "T4" })
  label!: string;

  @ApiProperty({ example: 4 })
  seats!: number;

  @ApiProperty({ example: "Window", nullable: true, type: String })
  zone!: string | null;

  @ApiProperty({
    example: true,
    description: "True when the table can be chosen for a dine-in checkout (FREE or OCCUPIED).",
  })
  orderable!: boolean;
}

export class PublicTablesResponseDto {
  @ApiProperty({ type: [PublicTableDto] })
  tables!: PublicTableDto[];
}

export class DiningTableDto {
  @ApiProperty({ example: 4 })
  id!: number;

  @ApiProperty({ example: "T4" })
  label!: string;

  @ApiProperty({ example: 4 })
  seats!: number;

  @ApiProperty({ example: "Window", nullable: true, type: String })
  zone!: string | null;

  @ApiProperty({ enum: [...TABLE_STATUSES], example: "FREE" })
  status!: TableStatus;

  @ApiProperty({ example: true, description: "False when the table is out of service." })
  active!: boolean;

  @ApiProperty({ example: "2026-11-16T09:00:00.000Z", format: "date-time" })
  createdAt!: string;

  @ApiProperty({ example: "2026-11-16T09:00:00.000Z", format: "date-time" })
  updatedAt!: string;
}

export class FloorTablesResponseDto {
  @ApiProperty({ type: [DiningTableDto] })
  tables!: DiningTableDto[];
}

export class TableResponseDto {
  @ApiProperty({ type: DiningTableDto })
  table!: DiningTableDto;
}

export class CreateTableDto {
  @ApiProperty({ example: "T9", maxLength: 20, description: "Unique, case-insensitive." })
  label!: string;

  @ApiProperty({ example: 4, minimum: 1, maximum: TABLE_MAX_SEATS })
  seats!: number;

  @ApiProperty({ example: "Terrace", required: false, nullable: true, type: String })
  zone?: string | null;
}

export class UpdateTableDto {
  @ApiProperty({ example: "T9", required: false })
  label?: string;

  @ApiProperty({ example: 6, required: false, minimum: 1, maximum: TABLE_MAX_SEATS })
  seats?: number;

  @ApiProperty({ example: "Terrace", required: false, nullable: true, type: String })
  zone?: string | null;

  @ApiProperty({
    example: false,
    required: false,
    description: "false takes the table out of service; it must be FREE.",
  })
  active?: boolean;
}

export class UpdateTableStatusDto {
  @ApiProperty({ enum: [...TABLE_STATUSES], example: "OCCUPIED" })
  status!: TableStatus;
}

export class TableErrorDto {
  @ApiProperty({ example: 409 })
  statusCode!: number;

  @ApiProperty({ enum: [...TABLE_ERROR_CODES], example: "INVALID_STATUS_TRANSITION" })
  code!: string;

  @ApiProperty({ example: "Table T4 cannot change from CLEANING to OCCUPIED" })
  message!: string;
}
