import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import bcrypt from "bcryptjs";
import { Not, Repository } from "typeorm";
import type {
  AccountErrorCode,
  ChangeEmailInput,
  ChangePasswordInput,
  CustomerAuthResponse,
  CustomerRegisterInput,
  CustomerResponse,
  CustomersResponse,
  LoginInput,
  MeResponse,
  StaffAuthResponse,
  TokenPayload,
  UpdateProfileInput,
  UsersResponse,
} from "@dinego/shared";
import { apiError, isUniqueViolation } from "../common/errors/api-error.js";
import { NotificationPublisher } from "../notifications/notification-publisher.js";
import { accountNotifications } from "../notifications/notifications.catalog.js";
import { User } from "./entities/user.entity.js";
import { toCustomerDto, toUserDto } from "./users.mapper.js";

const accountError = (
  status: HttpStatus,
  code: AccountErrorCode,
  message: string,
  extra?: Record<string, unknown>,
) => apiError(status, code, message, extra);

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly notifications: NotificationPublisher,
  ) {}

  /**
   * Customer self-registration. Customers are users with the CUSTOMER role.
   * Notifies the customer (welcome) and ADMIN and MANAGER staff (new customer).
   */
  async registerCustomer(input: CustomerRegisterInput): Promise<CustomerAuthResponse> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.users.findOne({ where: { email } });

    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    const customer = this.users.create({
      name: input.name,
      email,
      phone: input.phone ?? null,
      passwordHash: await bcrypt.hash(input.password, 10),
      pinHash: null,
      role: "CUSTOMER",
      active: true,
    });

    // One INSERT needs no transaction. `save()` would otherwise hold BEGIN … COMMIT open across
    // awaits on the shared SQLite connection, where other requests' writes could join it.
    const saved = await this.users.save(customer, { transaction: false });

    await this.notifications.publish(accountNotifications.registration(saved));

    return this.customerAuthResponse(saved);
  }

  /** Customer login used by the public web app. */
  async loginCustomer(input: LoginInput): Promise<CustomerAuthResponse> {
    const customer = await this.users.findOne({
      where: { email: input.email.trim().toLowerCase(), role: "CUSTOMER" },
    });

    if (
      !customer ||
      !customer.active ||
      !customer.passwordHash ||
      !(await bcrypt.compare(input.password, customer.passwordHash))
    ) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return this.customerAuthResponse(customer);
  }

  /** Restaurant admin login used by the admin panel. Only ADMIN accounts may enter. */
  async loginAdmin(input: LoginInput): Promise<StaffAuthResponse> {
    const user = await this.findActiveStaff(input);

    if (user.role !== "ADMIN") {
      throw new ForbiddenException("This account does not have admin access");
    }

    return this.staffAuthResponse(user);
  }

  /** Staff login for POS, kitchen, and cashier devices. */
  async loginStaff(input: LoginInput): Promise<StaffAuthResponse> {
    return this.staffAuthResponse(await this.findActiveStaff(input));
  }

  /**
   * Unified login used by the single frontend login page and the Swagger OAuth2 flow.
   * Returns a staff token for staff accounts and a customer token for customers.
   */
  async loginAnyUser(input: LoginInput): Promise<StaffAuthResponse | CustomerAuthResponse> {
    const user = await this.users.findOne({
      where: { email: input.email.trim().toLowerCase() },
    });

    if (
      !user ||
      !user.active ||
      !user.passwordHash ||
      !(await bcrypt.compare(input.password, user.passwordHash))
    ) {
      throw new UnauthorizedException("Invalid email or password");
    }

    if (user.role === "CUSTOMER") {
      return this.customerAuthResponse(user);
    }

    return this.staffAuthResponse(user);
  }

  async getMe(payload: TokenPayload): Promise<MeResponse> {
    const user = await this.users.findOne({ where: { id: payload.sub } });

    if (!user || !user.active) {
      throw new UnauthorizedException("Account is not available");
    }

    if (payload.type === "CUSTOMER") {
      if (user.role !== "CUSTOMER") {
        throw new UnauthorizedException("Account is not available");
      }

      return { type: "CUSTOMER", customer: toCustomerDto(user) };
    }

    return { type: "STAFF", user: toUserDto(user) };
  }

  /** Tokens stay valid for days, so customer endpoints re-check that the account is still active. */
  async assertActiveCustomer(customerId: number): Promise<void> {
    const exists = await this.users.exists({
      where: { id: customerId, role: "CUSTOMER", active: true },
    });

    if (!exists) {
      throw new UnauthorizedException("Account is not available");
    }
  }

  /* ------------------------- Customer account changes ------------------------ */

  /** Updates name and/or phone. Email and password have their own endpoints. */
  async updateProfile(customerId: number, input: UpdateProfileInput): Promise<CustomerResponse> {
    const assignments: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) {
      assignments.push(`"name" = ?`);
      values.push(input.name);
    }
    if (input.phone !== undefined) {
      assignments.push(`"phone" = ?`);
      values.push(input.phone);
    }

    const rows: unknown[] = await this.users.query(
      `UPDATE "users" SET ${assignments.join(", ")}
       WHERE "id" = ? AND "role" = 'CUSTOMER' AND "active" = 1
       RETURNING "id"`,
      [...values, customerId],
    );

    if (rows.length === 0) {
      throw new UnauthorizedException("Account is not available");
    }

    return { customer: toCustomerDto(await this.users.findOneByOrFail({ id: customerId })) };
  }

  /**
   * Changes the sign-in email after re-checking the current password. The address must not be
   * used by another account. Other sessions stay signed in; the customer is notified, so those
   * sessions see the change too.
   */
  async changeEmail(customerId: number, input: ChangeEmailInput): Promise<CustomerResponse> {
    const customer = await this.findActiveCustomer(customerId);
    const verifiedHash = await this.verifyCurrentPassword(customer, input.currentPassword);

    if (customer.email === input.newEmail) {
      throw apiError(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Request validation failed", {
        details: [{ path: "newEmail", message: "This is already your email address" }],
      });
    }

    let rows: unknown[];

    try {
      // Atomic: only if the password is still the one just verified and nobody else owns the email.
      rows = await this.users.query(
        `UPDATE "users" SET "email" = ?
         WHERE "id" = ? AND "active" = 1 AND "password_hash" = ?
           AND NOT EXISTS (
             SELECT 1 FROM "users" AS "other" WHERE lower("other"."email") = ? AND "other"."id" <> ?
           )
         RETURNING "id"`,
        [input.newEmail, customerId, verifiedHash, input.newEmail, customerId],
      );
    } catch (error) {
      throw isUniqueViolation(error) ? this.emailTaken() : error;
    }

    if (rows.length === 0) {
      const taken = await this.users.exists({ where: { email: input.newEmail } });
      throw taken ? this.emailTaken() : this.credentialsChanged();
    }

    await this.notifications.publish(
      accountNotifications.emailChanged({
        userId: customerId,
        previousEmail: customer.email,
        newEmail: input.newEmail,
      }),
    );

    return { customer: toCustomerDto(await this.users.findOneByOrFail({ id: customerId })) };
  }

  /**
   * Changes the password after re-checking the current one, and signs out every other session by
   * incrementing the session version. Returns a fresh token so this device stays signed in, and
   * notifies the customer.
   */
  async changePassword(
    customerId: number,
    input: ChangePasswordInput,
  ): Promise<CustomerAuthResponse> {
    const customer = await this.findActiveCustomer(customerId);
    const verifiedHash = await this.verifyCurrentPassword(customer, input.currentPassword);
    const newHash = await bcrypt.hash(input.newPassword, 10);

    // Atomic compare-and-swap on the verified hash: of two simultaneous changes, only one wins.
    const rows: Array<{ token_version: number }> = await this.users.query(
      `UPDATE "users" SET "password_hash" = ?, "token_version" = "token_version" + 1
       WHERE "id" = ? AND "active" = 1 AND "password_hash" = ?
       RETURNING "token_version"`,
      [newHash, customerId, verifiedHash],
    );

    if (rows.length === 0) {
      throw this.credentialsChanged();
    }

    await this.notifications.publish(
      accountNotifications.passwordChanged({
        userId: customerId,
        tokenVersion: rows[0].token_version,
      }),
    );

    customer.passwordHash = newHash;
    customer.tokenVersion = rows[0].token_version;
    return this.customerAuthResponse(customer);
  }

  /** What the auth guard needs to accept a token: the account's current state. */
  findSessionUser(
    id: number,
  ): Promise<Pick<User, "id" | "role" | "active" | "tokenVersion"> | null> {
    return this.users.findOne({
      where: { id },
      select: { id: true, role: true, active: true, tokenVersion: true },
    });
  }

  /** Staff user list for the admin console. Customers are returned separately. */
  async listUsers(): Promise<UsersResponse> {
    const users = await this.users.find({
      where: { role: Not("CUSTOMER") },
      order: { createdAt: "ASC", id: "ASC" },
    });

    return { users: users.map(toUserDto) };
  }

  async listCustomers(): Promise<CustomersResponse> {
    const customers = await this.users.find({
      where: { role: "CUSTOMER" },
      order: { createdAt: "ASC", id: "ASC" },
    });

    return { customers: customers.map(toCustomerDto) };
  }

  private async findActiveStaff(input: LoginInput): Promise<User> {
    const user = await this.users.findOne({
      where: { email: input.email.trim().toLowerCase() },
    });

    if (
      !user ||
      !user.active ||
      user.role === "CUSTOMER" ||
      !user.passwordHash ||
      !(await bcrypt.compare(input.password, user.passwordHash))
    ) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return user;
  }

  private async findActiveCustomer(customerId: number): Promise<User> {
    const customer = await this.users.findOne({
      where: { id: customerId, role: "CUSTOMER", active: true },
    });

    if (!customer) {
      throw new UnauthorizedException("Account is not available");
    }

    return customer;
  }

  /** Returns the verified hash, so the following write can require it to be unchanged. */
  private async verifyCurrentPassword(user: User, password: string): Promise<string> {
    if (!user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      const message = "Your current password is incorrect";
      // 400 with a field detail (not 401), so clients show it on the form instead of signing out.
      throw accountError(HttpStatus.BAD_REQUEST, "INVALID_CURRENT_PASSWORD", message, {
        details: [{ path: "currentPassword", message }],
      });
    }

    return user.passwordHash;
  }

  private emailTaken() {
    return accountError(
      HttpStatus.CONFLICT,
      "EMAIL_TAKEN",
      "An account with this email already exists",
      { details: [{ path: "newEmail", message: "An account with this email already exists" }] },
    );
  }

  private credentialsChanged() {
    return accountError(
      HttpStatus.CONFLICT,
      "CREDENTIALS_CHANGED",
      "Your account was just updated from another session. Please try again.",
    );
  }

  private async staffAuthResponse(user: User): Promise<StaffAuthResponse> {
    return {
      accessToken: await this.sign({
        sub: user.id,
        type: "STAFF",
        role: user.role,
        ver: user.tokenVersion,
      }),
      user: toUserDto(user),
    };
  }

  private async customerAuthResponse(user: User): Promise<CustomerAuthResponse> {
    return {
      accessToken: await this.sign({
        sub: user.id,
        type: "CUSTOMER",
        role: "CUSTOMER",
        ver: user.tokenVersion,
      }),
      customer: toCustomerDto(user),
    };
  }

  private sign(payload: TokenPayload): Promise<string> {
    return this.jwtService.signAsync(payload);
  }
}
