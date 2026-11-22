import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const origins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim());

  app.use(cookieParser());
  app.enableCors({ origin: origins, credentials: true });
  app.setGlobalPrefix("api/v1");
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle("DineGo API")
    .setDescription(
      [
        "DineGo restaurant management API.",
        "",
        "Phase 1 covers users, authentication, the public menu, the customer cart, dining tables, checkout with dummy payments, customer orders, in-app notifications, and health. Customers and staff share one users table;",
        "customers are identified by the `CUSTOMER` role.",
        "",
        "**Swagger login:** click **Authorize**, then enter an email and password from the demo accounts.",
        "Swagger requests a JWT and automatically sends it as a Bearer token for protected endpoints.",
        "The API also supports HttpOnly cookies and manually supplied Bearer tokens for other clients.",
      ].join("\n"),
    )
    .setVersion("1.0.0")
    .addServer("/", "Current host")
    .addOAuth2(
      {
        type: "oauth2",
        description:
          "Developer login. Enter your email in the username field. Client ID and client secret can be left blank. Use an admin account for admin endpoints or a customer account for customer endpoints.",
        flows: {
          password: {
            tokenUrl: "/api/v1/users/swagger-login",
            scopes: {
              api: "Access the DineGo API",
            },
          },
        },
      },
      "developer-login",
    )
    .addTag("Health", "Service and database health")
    .addTag("Users", "Customer registration, login, profiles, and admin lists")
    .addTag("Menu", "Public menu: categories and items to browse, filter, search, and sort")
    .addTag("Cart", "The signed-in customer's cart: add, change quantity, and remove items")
    .addTag("Tables", "Tables customers can choose for dine-in")
    .addTag("Floor", "Staff floor management: tables, layout, and table status")
    .addTag("Orders", "Checkout (dummy payment + order) and the customer's orders")
    .addTag("Payments", "Checkout quote and payment history. Dummy payments only")
    .addTag("Staff orders", "Order list and status changes for restaurant staff")
    .addTag(
      "Notifications",
      "The signed-in user's in-app notifications (customers and every staff role), kept for 7 days",
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup("api/docs", app, document, {
    customSiteTitle: "DineGo API Docs",
    swaggerOptions: {
      // Keep OAuth credentials in memory only; never persist passwords in localStorage.
      persistAuthorization: false,
      displayRequestDuration: true,
      docExpansion: "none",
      filter: true,
      tagsSorter: "alpha",
      withCredentials: true,
    },
  });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);

  Logger.log(`DineGo API listening on http://localhost:${port}/api/v1`, "Bootstrap");
  Logger.log(`Swagger docs available on http://localhost:${port}/api/docs`, "Swagger");
}

bootstrap().catch((error: unknown) => {
  Logger.error(error, "Bootstrap");
  process.exit(1);
});
