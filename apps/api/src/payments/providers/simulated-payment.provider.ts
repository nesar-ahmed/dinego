import { randomUUID } from "node:crypto";
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { DUMMY_PAYMENT_TOKENS } from "@dinego/shared";
import {
  PaymentProvider,
  PaymentProviderUnavailableError,
  type ChargeRequest,
  type ChargeResult,
} from "./payment-provider.js";

const DECLINE_MESSAGES: Record<string, string> = {
  card_declined: "Your card was declined.",
  insufficient_funds: "Your card has insufficient funds.",
  expired_card: "Your card has expired.",
};

/**
 * The DUMMY payment provider, and the only one DineGo has. No money moves, no payment gateway is
 * contacted, and no network request is made: the outcome is decided by the test token
 * (DUMMY_PAYMENT_TOKENS in @dinego/shared). Any other token is declined.
 */
@Injectable()
export class SimulatedPaymentProvider extends PaymentProvider implements OnModuleInit {
  readonly name = "simulated";
  private readonly logger = new Logger("Payments");

  onModuleInit(): void {
    this.logger.log("Dummy payments: no real money is charged and no gateway is contacted");
  }

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const token = request.paymentToken;

    if (token === DUMMY_PAYMENT_TOKENS.outage) {
      throw new PaymentProviderUnavailableError("Simulated payment provider outage");
    }

    const providerRef = `sim_ch_${randomUUID().replace(/-/g, "")}`;
    const declineCode = (DUMMY_PAYMENT_TOKENS.declined as Record<string, string>)[token];

    if (declineCode) {
      return {
        status: "FAILED",
        providerRef,
        failureCode: declineCode,
        failureMessage: DECLINE_MESSAGES[declineCode] ?? "Your payment was declined.",
      };
    }

    if (!(DUMMY_PAYMENT_TOKENS.approved as readonly string[]).includes(token)) {
      return {
        status: "FAILED",
        providerRef: null,
        failureCode: "invalid_payment_token",
        failureMessage: "This payment token is not valid. Please re-enter your payment details.",
      };
    }

    return { status: "SUCCEEDED", providerRef };
  }
}
