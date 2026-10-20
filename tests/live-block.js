/**
 * Stop Playwright from reaching Meta, the CAPI endpoint, or a live Stripe
 * Payment Link. Register this before any local fulfill route: the last
 * matching route wins, so a spec can still fulfill a stub without the
 * request leaving the browser. A URL that no later route handles is aborted.
 */
function metaRequest(url) {
  var host = String(url.hostname || "");
  if (host === "facebook.com" || host.slice(-13) === ".facebook.com") return true;
  if (host === "facebook.net" || host.slice(-13) === ".facebook.net") return true;
  var path = String(url.pathname || "");
  if (/\/capi(?:\/|$)/i.test(path) || /conversionsapi/i.test(path)) return true;
  return false;
}

function stripeRequest(url) {
  return String(url.hostname || "") === "buy.stripe.com";
}

async function blockLiveTargets(target) {
  await target.route(metaRequest, function (route) { return route.abort(); });
  await target.route(stripeRequest, function (route) { return route.abort(); });
}

module.exports = {
  blockLiveTargets: blockLiveTargets,
  metaRequest: metaRequest,
  stripeRequest: stripeRequest
};
