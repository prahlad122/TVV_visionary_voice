import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { pool } from "@/lib/db";

const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : (process.env.V0_RUNTIME_URL ??
          process.env.V0_BUILD_URL ??
          "http://localhost:3000")),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 12,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          if (
            !adminEmail ||
            newUser.email.trim().toLowerCase() !== adminEmail
          ) {
            throw new APIError("FORBIDDEN", {
              message: "Registration is restricted.",
            });
          }
          return { data: newUser };
        },
      },
    },
  },

  trustedOrigins: [
    ...(process.env.NODE_ENV === "development"
      ? [
          "http://localhost:3000",
          "http://127.0.0.1:3000",
          "http://192.168.1.5:3000",
          ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
          ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
          ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []),
          ...(process.env.V0_SANDBOX_URL ? [process.env.V0_SANDBOX_URL] : []),
        ]
      : []),
    ...(process.env.NODE_ENV === "production"
      ? [
          ...(process.env.VERCEL_URL
            ? [`https://${process.env.VERCEL_URL}`]
            : []),
          ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
            : []),
        ]
      : []),
  ],

  session: {
    // An admin session lasts at most 12 hours (extended while in use) before signing in again.
    expiresIn: 60 * 60 * 12,
    updateAge: 60 * 60,
  },

  ...(process.env.NODE_ENV === "development"
    ? {
        advanced: {
          defaultCookieAttributes: {
            sameSite: "lax" as const,
            secure: false,
          },
        },
      }
    : {}),
});
