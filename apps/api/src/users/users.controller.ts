import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiOAuth2,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import type { Response } from "express";
import {
  changeEmailSchema,
  changePasswordSchema,
  customerRegisterSchema,
  loginSchema,
  updateProfileSchema,
  type ChangeEmailInput,
  type ChangePasswordInput,
  type CustomerRegisterInput,
  type LoginInput,
  type TokenPayload,
  type UpdateProfileInput,
} from "@dinego/shared";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { clearAccessTokenCookie, setAccessTokenCookie } from "./auth-cookie.js";
import { CurrentAuth } from "./decorators/current-auth.decorator.js";
import { Roles } from "./decorators/roles.decorator.js";
import {
  AccountErrorDto,
  ChangeEmailDto,
  ChangePasswordDto,
  CustomerAuthResponseDto,
  CustomerMeResponseDto,
  CustomerResponseDto,
  CustomersResponseDto,
  LoginDto,
  RegisterCustomerDto,
  StaffAuthResponseDto,
  StaffMeResponseDto,
  UpdateProfileDto,
  UsersResponseDto,
} from "./dto/swagger.dto.js";
import { CustomerGuard } from "./guards/customer.guard.js";
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";
import { RolesGuard } from "./guards/roles.guard.js";
import { UsersService } from "./users.service.js";

@ApiTags("Users")
@ApiExtraModels(StaffMeResponseDto, CustomerMeResponseDto)
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** Customer registration. */
  @ApiOperation({
    summary: "Register a customer account",
    description:
      "Creates a user with the CUSTOMER role. The JWT is returned and also set as an HttpOnly cookie.",
  })
  @ApiBody({ type: RegisterCustomerDto })
  @ApiCreatedResponse({ type: CustomerAuthResponseDto })
  @ApiConflictResponse({ description: "An account with this email already exists" })
  @Post("register")
  async register(
    @Body(new ZodValidationPipe(customerRegisterSchema)) input: CustomerRegisterInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.usersService.registerCustomer(input);
    setAccessTokenCookie(response, result.accessToken);

    return result;
  }

  /** Customer login. */
  @ApiOperation({
    summary: "Customer login",
    description: "Returns an access token and sets the HttpOnly session cookie.",
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: CustomerAuthResponseDto })
  @ApiUnauthorizedResponse({ description: "Invalid email or password" })
  @HttpCode(HttpStatus.OK)
  @Post("login")
  async login(
    @Body(new ZodValidationPipe(loginSchema)) input: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.usersService.loginCustomer(input);
    setAccessTokenCookie(response, result.accessToken);

    return result;
  }

  /** Restaurant admin login for the admin panel. */
  @ApiOperation({
    summary: "Restaurant admin login",
    description:
      "Only ADMIN accounts can sign in. Returns an access token and sets the HttpOnly session cookie.",
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: StaffAuthResponseDto })
  @ApiUnauthorizedResponse({ description: "Invalid email or password" })
  @ApiForbiddenResponse({ description: "The account does not have admin access" })
  @HttpCode(HttpStatus.OK)
  @Post("admin/login")
  async adminLogin(
    @Body(new ZodValidationPipe(loginSchema)) input: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.usersService.loginAdmin(input);
    setAccessTokenCookie(response, result.accessToken);

    return result;
  }

  /** Staff login for future POS, kitchen, and cashier screens. */
  @ApiOperation({
    summary: "Staff login",
    description:
      "Login for any active non-customer account. Also sets the HttpOnly session cookie.",
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: StaffAuthResponseDto })
  @ApiUnauthorizedResponse({ description: "Invalid email or password" })
  @HttpCode(HttpStatus.OK)
  @Post("staff/login")
  async staffLogin(
    @Body(new ZodValidationPipe(loginSchema)) input: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.usersService.loginStaff(input);
    setAccessTokenCookie(response, result.accessToken);

    return result;
  }

  /** Unified login for the single frontend login page. */
  @ApiOperation({
    summary: "Login as any account",
    description:
      "Signs in a customer or staff account, sets the HttpOnly cookie, and returns the matching profile.",
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    description: "Customer or staff auth response",
    schema: {
      oneOf: [
        { $ref: getSchemaPath(CustomerAuthResponseDto) },
        { $ref: getSchemaPath(StaffAuthResponseDto) },
      ],
    },
  })
  @ApiUnauthorizedResponse({ description: "Invalid email or password" })
  @HttpCode(HttpStatus.OK)
  @Post("session-login")
  async sessionLogin(
    @Body(new ZodValidationPipe(loginSchema)) input: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.usersService.loginAnyUser(input);
    setAccessTokenCookie(response, result.accessToken);

    return result;
  }

  /**
   * OAuth2 password-flow token endpoint used only by Swagger UI.
   * Swagger sends form-urlencoded username/password and receives a standard token response.
   */
  @ApiExcludeEndpoint()
  @HttpCode(HttpStatus.OK)
  @Post("swagger-login")
  async swaggerLogin(@Body() body: Record<string, unknown>) {
    const username = typeof body.username === "string" ? body.username : body.email;
    const password = body.password;

    if (typeof username !== "string" || typeof password !== "string") {
      throw new BadRequestException("Email and password are required");
    }

    const parsed = loginSchema.safeParse({ email: username, password });

    if (!parsed.success) {
      throw new BadRequestException("Enter a valid email and a password of at least 8 characters");
    }

    const result = await this.usersService.loginAnyUser(parsed.data);

    return {
      access_token: result.accessToken,
      token_type: "Bearer",
      expires_in: Number(process.env.JWT_EXPIRES_IN_SECONDS ?? 604800),
      scope: "api",
    };
  }

  /** Clears the HttpOnly JWT cookie. */
  @ApiOperation({
    summary: "Logout",
    description: "Clears the HttpOnly session cookie.",
  })
  @ApiOkResponse({ description: "Session cookie cleared" })
  @HttpCode(HttpStatus.OK)
  @Post("logout")
  logout(@Res({ passthrough: true }) response: Response) {
    clearAccessTokenCookie(response);

    return { success: true };
  }

  /** Returns the signed-in customer or staff account. */
  @ApiOAuth2(["api"], "developer-login")
  @ApiOperation({
    summary: "Current account",
    description:
      "Returns the customer or staff profile. Authenticate with the HttpOnly cookie or a Bearer token.",
  })
  @ApiOkResponse({
    description: "Signed-in customer or staff account",
    schema: {
      oneOf: [
        { $ref: getSchemaPath(StaffMeResponseDto) },
        { $ref: getSchemaPath(CustomerMeResponseDto) },
      ],
    },
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token or cookie" })
  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentAuth() auth: TokenPayload) {
    return this.usersService.getMe(auth);
  }

  /** Customer profile update: name and phone. */
  @ApiOAuth2(["api"], "developer-login")
  @ApiOperation({
    summary: "Update my profile",
    description:
      "Customers only. Updates name and/or phone (null or empty removes the phone). Email and password are changed with their own endpoints.",
  })
  @ApiBody({ type: UpdateProfileDto })
  @ApiOkResponse({ type: CustomerResponseDto })
  @ApiBadRequestResponse({ type: AccountErrorDto, description: "VALIDATION_ERROR" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session" })
  @ApiForbiddenResponse({ description: "Staff accounts (CUSTOMER_ONLY)" })
  @UseGuards(JwtAuthGuard, CustomerGuard)
  @Patch("me/profile")
  updateProfile(
    @CurrentAuth() auth: TokenPayload,
    @Body(new ZodValidationPipe(updateProfileSchema)) input: UpdateProfileInput,
  ) {
    return this.usersService.updateProfile(auth.sub, input);
  }

  /** Customer email change, confirmed with the current password. */
  @ApiOAuth2(["api"], "developer-login")
  @ApiOperation({
    summary: "Change my email",
    description:
      "Customers only. Requires the current password. The new email is used to sign in from now on; other sessions stay signed in.",
  })
  @ApiBody({ type: ChangeEmailDto })
  @ApiOkResponse({ type: CustomerResponseDto })
  @ApiBadRequestResponse({
    type: AccountErrorDto,
    description: "INVALID_CURRENT_PASSWORD, or VALIDATION_ERROR (including the same email)",
  })
  @ApiConflictResponse({ type: AccountErrorDto, description: "EMAIL_TAKEN or CREDENTIALS_CHANGED" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session" })
  @ApiForbiddenResponse({ description: "Staff accounts (CUSTOMER_ONLY)" })
  @UseGuards(JwtAuthGuard, CustomerGuard)
  @Put("me/email")
  changeEmail(
    @CurrentAuth() auth: TokenPayload,
    @Body(new ZodValidationPipe(changeEmailSchema)) input: ChangeEmailInput,
  ) {
    return this.usersService.changeEmail(auth.sub, input);
  }

  /** Customer password change. Signs out every other session. */
  @ApiOAuth2(["api"], "developer-login")
  @ApiOperation({
    summary: "Change my password",
    description:
      "Customers only. Requires the current password. Signs out every other session and device; this one receives a new token and session cookie.",
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({ type: CustomerAuthResponseDto })
  @ApiBadRequestResponse({
    type: AccountErrorDto,
    description:
      "INVALID_CURRENT_PASSWORD, or VALIDATION_ERROR (including reusing the current password)",
  })
  @ApiConflictResponse({ type: AccountErrorDto, description: "CREDENTIALS_CHANGED" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session" })
  @ApiForbiddenResponse({ description: "Staff accounts (CUSTOMER_ONLY)" })
  @UseGuards(JwtAuthGuard, CustomerGuard)
  @Put("me/password")
  async changePassword(
    @CurrentAuth() auth: TokenPayload,
    @Body(new ZodValidationPipe(changePasswordSchema)) input: ChangePasswordInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.usersService.changePassword(auth.sub, input);
    setAccessTokenCookie(response, result.accessToken);

    return result;
  }

  /** Admin-only staff user list. */
  @ApiOAuth2(["api"], "developer-login")
  @ApiOperation({
    summary: "List staff accounts",
    description: "ADMIN or MANAGER only. CUSTOMER accounts are excluded.",
  })
  @ApiOkResponse({ type: UsersResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token or cookie" })
  @ApiForbiddenResponse({ description: "Requires ADMIN or MANAGER role" })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Get()
  list() {
    return this.usersService.listUsers();
  }

  /** Admin-only customer list. */
  @ApiOAuth2(["api"], "developer-login")
  @ApiOperation({ summary: "List customer accounts", description: "ADMIN or MANAGER only." })
  @ApiOkResponse({ type: CustomersResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token or cookie" })
  @ApiForbiddenResponse({ description: "Requires ADMIN or MANAGER role" })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Get("customers")
  listCustomers() {
    return this.usersService.listCustomers();
  }
}
