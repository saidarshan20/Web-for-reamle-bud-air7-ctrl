import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  webServer: process.env.OFFLINE_BROWSER_TESTS ? undefined : {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:8080",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://127.0.0.1:8080",
    launchOptions: process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : undefined,
  },
});
