import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import bcrypt from "bcryptjs";
import { Not, Repository } from "typeorm";
import type {
  CustomerAuthResponse,
  CustomerRegisterInput,
  CustomersResponse,
  LoginInput,
  MeResponse,
  StaffAuthResponse,
  TokenPayload,
  UsersResponse,
} from "@dinego/shared";
import { User } from "./entities/user.entity.js";
import { toCustomerDto, toUserDto } from "./users.mapper.js";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  /** Customer self-registration. Customers are users with the CUSTOMER role. */
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

    return this.customerAuthResponse(await this.users.save(customer));
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

  private async staffAuthResponse(user: User): Promise<StaffAuthResponse> {
    return {
      accessToken: await this.sign({ sub: user.id, type: "STAFF", role: user.role }),
      user: toUserDto(user),
    };
  }

  private async customerAuthResponse(user: User): Promise<CustomerAuthResponse> {
    return {
      accessToken: await this.sign({ sub: user.id, type: "CUSTOMER", role: "CUSTOMER" }),
      customer: toCustomerDto(user),
    };
  }

  private sign(payload: TokenPayload): Promise<string> {
    return this.jwtService.signAsync(payload);
  }
}
