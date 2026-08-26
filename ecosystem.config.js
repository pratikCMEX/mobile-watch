module.exports = {
  apps: [
    {
      name: "server",
      script: "./node_modules/.bin/ts-node",
      args: "app/app.ts",
      watch: true,
      ignore_watch: [
        "node_modules",
        "uploads",
        "uploads/**/*",
        "dist",
        "logs",
        "*.log",
        ".git",
      ],
      instances: 1,
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
