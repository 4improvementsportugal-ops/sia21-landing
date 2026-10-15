const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: {
    ...devices["Pixel 5"],
    headless: true,
    launchOptions: {
      args: ["--host-resolver-rules=MAP 4improvementsportugal-ops.github.io 127.0.0.1"]
    }
  },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1",
    port: 4173,
    reuseExistingServer: true
  }
});
