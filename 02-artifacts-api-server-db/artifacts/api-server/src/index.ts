import app from "./app";
import { adminSeedStatus } from "./lib/store";
import { logger } from "./lib/logger";
import { startSweeper } from "./lib/sweeper";
import { assertRequiredEnv } from "./lib/env";

const { port } = assertRequiredEnv();

if (adminSeedStatus.provisioned) {
  logger.info(
    { adminEmail: adminSeedStatus.email },
    "[admin] Admin account provisioned from environment.",
  );
} else {
  logger.warn(
    { reason: adminSeedStatus.reason },
    "[admin] No admin account provisioned. Set ADMIN_EMAIL and ADMIN_PASSWORD as Replit Secrets to enable admin login.",
  );
}

// --------------------------------------------------------------------------
// Crash guards
// --------------------------------------------------------------------------
// Without these, one unhandled promise rejection or thrown error anywhere
// in the app kills the entire Node process — Railway then shows the request
// as "crashed" and restarts the container, dropping in-flight requests.
//
// These handlers log the error with full context and keep the process
// alive for transient/recoverable errors (a failed fetch, a bad DB query
// that wasn't awaited correctly, etc). This is NOT a way to "fix" broken
// code — a bug that throws will keep throwing every time it's hit. What
// this buys you is that ONE bad request can't take down the whole server
// for every other user.
//
// We deliberately do NOT exit on uncaughtException/unhandledRejection.
// If the process reaches a truly unrecoverable state (e.g. out of memory),
// Railway's healthcheck will detect the server stopped responding and
// restart it anyway — that's the correct backstop, not a hard process.exit
// here that would turn every transient error into a restart.
process.on("uncaughtException", (err) => {
  logger.error({ err: err.message, stack: err.stack }, "[crash-guard] uncaughtException — process kept alive");
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error({ err: err.message, stack: err.stack }, "[crash-guard] unhandledRejection — process kept alive");
});

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startSweeper();
});

// --------------------------------------------------------------------------
// Graceful shutdown
// --------------------------------------------------------------------------
// Railway sends SIGTERM before stopping/restarting a container (deploys,
// scaling, healthcheck failures). Without handling it, in-flight requests
// get cut off mid-response. This stops accepting new connections, lets
// existing requests finish (up to a timeout), then exits cleanly.
let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "[shutdown] received signal, closing gracefully");

  const forceExitTimer = setTimeout(() => {
    logger.warn("[shutdown] graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 10_000);

  server.close((closeErr) => {
    clearTimeout(forceExitTimer);
    if (closeErr) {
      logger.error({ err: closeErr.message }, "[shutdown] error during close");
      process.exit(1);
    }
    logger.info("[shutdown] closed all connections, exiting cleanly");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
