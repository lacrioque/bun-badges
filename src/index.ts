import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import auth from "@routes/auth.routes";
import badges from "@routes/badges.routes";
import assertions from "@routes/assertions.routes";
import issuers from "@routes/issuers.routes";
import verification from "@routes/verification.routes";
import status from "@routes/status.routes";
import { createOAuthRouter } from "@routes/oauth.routes";
import { OAuthController } from "@controllers/oauth.controller";
import { errorHandler } from "@middleware/error-handler";
import { createAuthMiddleware } from "@middleware/auth.middleware";
import { DatabaseService } from "@services/db.service";
import { createSwaggerUI } from "./swagger";

const app = new Hono();

// Initialize services and controllers
const db = new DatabaseService();
const oauthController = new OAuthController(db);

// Create the auth middleware
const authMiddleware = createAuthMiddleware(db);

// Middleware
app.use("*", logger());
app.use("*", cors());
app.use("*", secureHeaders());
app.use("*", errorHandler);

// Routes
app.route("/auth", auth);
app.route("/oauth", createOAuthRouter(oauthController));

// API routes with selective auth middleware
const api = new Hono();

// Apply auth middleware only to mutation operations
api.use("/badges", async (c, next) => {
  if (["POST", "PUT", "DELETE"].includes(c.req.method)) {
    return authMiddleware(c, next);
  }
  await next();
  return;
});

api.use("/assertions", async (c, next) => {
  if (["POST", "PUT", "DELETE"].includes(c.req.method)) {
    return authMiddleware(c, next);
  }
  await next();
  return;
});

api.use("/issuers", async (c, next) => {
  if (["POST", "PUT", "DELETE"].includes(c.req.method)) {
    return authMiddleware(c, next);
  }
  await next();
  return;
});

// Mount the API routes
api.route("/badges", badges);
api.route("/assertions", assertions);
api.route("/issuers", issuers);
api.route("/verify", verification);
api.route("/status", status);
app.route("/api", api);

// Mount Swagger UI
app.route("/docs", createSwaggerUI());

// Root route
app.get("/", (c) => c.json({ message: "Bun Badges API" }));

// Super simple health check endpoint with plain text
app.get("/health", () => {
  return new Response("OK", { status: 200 });
});

// Log server startup
const port = parseInt(process.env.PORT || "7777", 10);
const isDevEnv = process.env.NODE_ENV === "development";
console.log(
  `Server starting on port ${port} in ${process.env.NODE_ENV || "development"} mode...`,
);

if (isDevEnv && !process.env.DOCKER_CONTAINER) {
  console.log("\nDevelopment Tips:");
  console.log(
    '• For local database development, run: "bun run dev:docker" to use Docker Compose',
  );
  console.log(
    "• Access API documentation at: http://localhost:" + port + "/docs",
  );
  console.log(
    '• Try the Open Badges 3.0 example: "bun run examples/ob3-workflow.ts"\n',
  );
}

// Configure TLS if HTTPS is enabled
const useHttps = process.env.USE_HTTPS === "true";
const tlsConfig = useHttps
  ? {
      tls: {
        cert: process.env.TLS_CERT_FILE
          ? Bun.file(process.env.TLS_CERT_FILE)
          : undefined,
        key: process.env.TLS_KEY_FILE
          ? Bun.file(process.env.TLS_KEY_FILE)
          : undefined,
        passphrase: process.env.TLS_PASSPHRASE,
      },
    }
  : {};

// Log HTTPS status
if (useHttps) {
  console.log(`HTTPS enabled with certificate: ${process.env.TLS_CERT_FILE}`);
  console.log(`Key file: ${process.env.TLS_KEY_FILE}`);
  console.log(`Using port: ${port} for HTTPS server`);
} else {
  console.log("HTTPS is disabled. Running in HTTP mode.");
  console.log(`Using port: ${port} for HTTP server`);
}

// Export the app with optional TLS configuration
// When USE_HTTPS is not set, this behaves exactly like the original export
export default {
  port,
  fetch: app.fetch,
  ...tlsConfig,
};
