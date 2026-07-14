module.exports = {
  apps: [
    {
      name: 'quotation-api',
      script: 'server.js',
      instances: 'max',        // one process per CPU core
      exec_mode: 'cluster',    // share port across all instances
      watch: false,
      max_memory_restart: '1G', // restart if a process leaks past 1GB
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 3000,     // wait 3s before restarting after a crash
      max_restarts: 10,        // give up after 10 rapid crashes
    },
  ],
};
