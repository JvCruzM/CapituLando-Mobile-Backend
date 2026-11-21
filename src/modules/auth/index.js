import { Router } from "express";
import { authenticate } from "../../shared/middlewares/auth.js";
import {
  authRateLimiter,
  mailRateLimiter,
} from "../../shared/middlewares/rate-limiter.js";
import { authSchemas, validateBody } from "./schemas/auth.js";
import * as controller from "./controllers/auth.js";

export function createAuthRouter() {
  const router = Router();
  router.post(
    "/register",
    authRateLimiter,
    validateBody(authSchemas.register),
    controller.register,
  );
  router.post(
    "/login",
    authRateLimiter,
    validateBody(authSchemas.login),
    controller.login,
  );
  router.post(
    "/verify-email",
    authRateLimiter,
    validateBody(authSchemas.verify),
    controller.verifyEmail,
  );
  router.post(
    "/forgot-password",
    mailRateLimiter,
    validateBody(authSchemas.forgot),
    controller.forgotPassword,
  );
  router.post(
    "/resend-verification",
    mailRateLimiter,
    validateBody(authSchemas.forgot),
    controller.resendVerification,
  );
  router.post(
    "/reset-password",
    authRateLimiter,
    validateBody(authSchemas.reset),
    controller.resetPassword,
  );
  router.post(
    "/refresh",
    authRateLimiter,
    validateBody(authSchemas.refresh),
    controller.refresh,
  );
  router.get("/me", authenticate, controller.me);
  router.post(
    "/logout",
    authenticate,
    validateBody(authSchemas.logout),
    controller.logout,
  );
  router.post(
    "/change-email",
    authenticate,
    mailRateLimiter,
    validateBody(authSchemas.changeEmail),
    controller.changeEmail,
  );
  return router;
}
