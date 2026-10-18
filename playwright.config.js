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
      // The production hostname on :4173 still reaches the local server.
      // Facebook and PostHog ingestion resolve nowhere, so a missed route
      // cannot deliver a pixel or a capture. The SDK host eu-assets is left
      // alone; specs fulfill every ingestion URL.
      args: [
        "--host-resolver-rules=" + [
          "MAP 4improvementsportugal-ops.github.io 127.0.0.1",
          "MAP facebook.com 0.0.0.0",
          "MAP www.facebook.com 0.0.0.0",
          "MAP connect.facebook.net 0.0.0.0",
          "MAP facebook.net 0.0.0.0",
          "MAP www.facebook.net 0.0.0.0",
          "MAP eu.i.posthog.com 0.0.0.0",
          "MAP us.i.posthog.com 0.0.0.0",
          "MAP app.posthog.com 0.0.0.0"
        ].join(", ")
      ]
    }
  },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1",
    port: 4173,
    reuseExistingServer: true
  }
});
