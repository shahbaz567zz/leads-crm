module.exports = {
  apps: [
    {
      name: "CollegeTpoint-Leads-CRM",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3004",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3004,
      },
      max_memory_restart: "500M",
      autorestart: true,
    },
  ],
};