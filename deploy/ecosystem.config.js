module.exports = {
  apps: [
    {
      name: 'xpresspro-api',
      script: 'node',
      args: '--enable-source-maps artifacts/api-server/dist/artifacts/api-server/src/index.js',
      cwd: process.env.APP_HOME || process.cwd(),
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      error_file: './logs/pm2/xpresspro-err.log',
      out_file: './logs/pm2/xpresspro-out.log',
      merge_logs: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000
      }
    }
  ]
};

# Usage:
# Install pm2 globally: npm i -g pm2
# Start: pm2 start deploy/ecosystem.config.js
# Save: pm2 save
# Startup script: pm2 startup
