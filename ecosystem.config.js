/**
 * PM2 process configuration — XpressPro FX / NeXTrade
 *
 * Usage:
 *   pm2 start ecosystem.config.js           # start all services
 *   pm2 reload ecosystem.config.js          # zero-downtime reload
 *   pm2 stop all                            # stop everything
 *   pm2 save                                # persist list across reboots
 *   pm2 startup                             # generate systemd unit
 *   pm2 logs xpressfx-api                   # tail API logs
 *   pm2 install pm2-logrotate               # add automatic log rotation
 *
 * Rollback:
 *   git checkout <sha>
 *   npm ci
 *   npm run build:all
 *   pm2 reload ecosystem.config.js
 */

module.exports = {
  apps: [
    {
      name: "xpressfx-api",
      script: "node",
      args: "--enable-source-maps artifacts/api-server/dist/artifacts/api-server/src/index.js",

      // All secrets must be supplied via the OS environment (e.g. loaded from
      // /etc/xpressfx.env via systemd EnvironmentFile= or pm2 dotenv support).
      // NEVER hardcode secrets here.
      env: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
      },

      // Restart policy — crash → wait 3 s → retry, up to 10 times, then stop
      // and alert. Use min_uptime to distinguish a crash-loop from a slow start.
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      min_uptime: "10s",
      exp_backoff_restart_delay: 100,

      // Cluster mode OFF — app relies on in-memory store; multiple workers
      // would each hold a separate store (split-brain). One process only.
      instances: 1,
      exec_mode: "fork",

      // Watch OFF — use explicit deploys, not file-change restarts.
      watch: false,

      // Logging — PM2 captures stdout/stderr.
      out_file: "/var/log/xpfx/api-out.log",
      error_file: "/var/log/xpfx/api-error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
