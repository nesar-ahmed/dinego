import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { USER_ROLES, type UserRole } from "@dinego/shared";

export class LoginDto {
  @ApiProperty({ example: "admin@dinego.com", format: "email" })
  email!: string;

  @ApiProperty({ example: "Admin1234!", format: "password", minLength: 8, maxLength: 128 })
  password!: string;
}

export class RegisterCustomerDto {
  @ApiProperty({ example: "Sofia Alvarez", minLength: 2, maxLength: 120 })
  name!: string;

  @ApiProperty({ example: "customer@dinego.com", format: "email" })
  email!: string;

  @ApiPropertyOptional({
    example: "+1 555 0200",
    nullable: true,
    minLength: 6,
    maxLength: 30,
  })
  phone?: string | null;

  @ApiProperty({ example: "Customer1234!", format: "password", minLength: 8, maxLength: 128 })
  password!: string;
}

export class UserDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: "Amina Rahman" })
  name!: string;

  @ApiProperty({ example: "admin@dinego.com", nullable: true, format: "email" })
  email!: string | null;

  @ApiProperty({ example: "+1 555 0100", nullable: true })
  phone!: string | null;

  @ApiProperty({ enum: [...USER_ROLES], example: "ADMIN" })
  role!: UserRole;

  @ApiProperty({ example: true })
  active!: boolean;

  @ApiProperty({ example: "2026-11-16T00:00:00.000Z", format: "date-time" })
  createdAt!: string;
}

export class CustomerDto {
  @ApiProperty({ example: 6 })
  id!: number;

  @ApiProperty({ example: "Sofia Alvarez" })
  name!: string;

  @ApiProperty({ example: "+1 555 0200", nullable: true })
  phone!: string | null;

  @ApiProperty({ example: "customer@dinego.com", nullable: true, format: "email" })
  email!: string | null;

  @ApiProperty({ example: "2026-11-16T00:00:00.000Z", format: "date-time" })
  createdAt!: string;
}

export class CustomerAuthResponseDto {
  @ApiProperty({ example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." })
  accessToken!: string;

  @ApiProperty({ type: CustomerDto })
  customer!: CustomerDto;
}

export class StaffAuthResponseDto {
  @ApiProperty({ example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." })
  accessToken!: string;

  @ApiProperty({ type: UserDto })
  user!: UserDto;
}

export class UsersResponseDto {
  @ApiProperty({ type: [UserDto] })
  users!: UserDto[];
}

export class CustomersResponseDto {
  @ApiProperty({ type: [CustomerDto] })
  customers!: CustomerDto[];
}

export class StaffMeResponseDto {
  @ApiProperty({ enum: ["STAFF"], example: "STAFF" })
  type!: "STAFF";

  @ApiProperty({ type: UserDto })
  user!: UserDto;
}

export class CustomerMeResponseDto {
  @ApiProperty({ enum: ["CUSTOMER"], example: "CUSTOMER" })
  type!: "CUSTOMER";

  @ApiProperty({ type: CustomerDto })
  customer!: CustomerDto;
}
