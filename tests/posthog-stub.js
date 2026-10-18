/**
 * Local stand-in for eu-assets.i.posthog.com/static/array.js.
 * Speaks the snippet's _i queue and posts plain JSON to the configured
 * api_host. Tests fulfill that host. This file must not be loaded by a
 * landing page, and it must not request the real PostHog network.
 */
(function () {
  if (window.__SIA21_PH_STUB_LOADED) return;
  window.__SIA21_PH_STUB_LOADED = true;
  var stub = window.posthog;
  if (!stub) return;

  var queued = [];
  if (stub._i && stub._i.length) queued = stub._i.splice(0, stub._i.length);

  function attach(config) {
    config = config || {};
    stub.persistence = { props: {} };
    stub.sessionPersistence = { props: {} };
    stub.config = config;
    stub.capture = function (eventName, properties) {
      var event = { event: String(eventName || ""), properties: {} };
      var source = properties || {};
      Object.keys(source).forEach(function (key) {
        event.properties[key] = source[key];
      });
      if (typeof config.before_send === "function") {
        var next = null;
        try { next = config.before_send(event); } catch (e) { return; }
        if (!next) return;
        event = next;
      }
      var body = "";
      try { body = JSON.stringify(event); } catch (e2) { return; }
      var host = String(config.api_host || "https://eu.i.posthog.com").replace(/\/$/, "");
      try {
        fetch(host + "/i/v0/e/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
          keepalive: true,
          credentials: "omit"
        });
      } catch (e3) {}
    };
    stub.set_config = function (next) {
      if (!next) return;
      Object.keys(next).forEach(function (key) { config[key] = next[key]; });
    };
    stub.startSessionRecording = function () {};
    stub.stopSessionRecording = function () {};
    stub.sessionRecordingStarted = function () { return false; };
    stub.identify = function () {};
    stub.register = function () {};
    stub.get_distinct_id = function () { return "stub"; };
    stub.__loaded = true;
    if (typeof config.loaded === "function") {
      try { config.loaded(stub); } catch (e4) {}
    }
  }

  stub.init = function (_token, config) { attach(config || {}); };
  queued.forEach(function (entry) { attach((entry && entry[1]) || {}); });
})();
