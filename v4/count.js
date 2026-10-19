/* Counts the four figures once, when the strip enters the viewport.
   Final numbers stay in the HTML. No tracking calls. This does not wait
   for the human gate: it only reads layout and writes text. */
(function () {
  var root = document.querySelector("[data-count-root]");
  if (!root || !window.IntersectionObserver) return;
  var nodes = root.querySelectorAll(".stat-live");
  if (!nodes.length) return;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduce.matches) return;

  var started = false;
  var DURATION = 1350;

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function run() {
    if (started) return;
    started = true;
    var specs = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      specs.push({
        el: el,
        a: Number(el.getAttribute("data-to")),
        b: el.hasAttribute("data-to-b") ? Number(el.getAttribute("data-to-b")) : null,
        finalText: el.textContent
      });
      el.textContent = specs[i].b == null ? "0" : "0 a 0";
    }
    var t0 = 0;
    function frame(now) {
      if (!t0) t0 = now;
      var t = Math.min(1, (now - t0) / DURATION);
      var e = easeOut(t);
      for (var n = 0; n < specs.length; n++) {
        var spec = specs[n];
        if (t >= 1) {
          spec.el.textContent = spec.finalText;
          continue;
        }
        var left = Math.round(spec.a * e);
        if (spec.b == null) spec.el.textContent = String(left);
        else spec.el.textContent = left + " a " + Math.round(spec.b * e);
      }
      if (t < 1) window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  }

  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) {
        io.disconnect();
        run();
        return;
      }
    }
  }, { threshold: 0.35 });
  io.observe(root);
})();
