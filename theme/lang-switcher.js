(function () {
  // Server-side rendered Font Awesome icon, cloned into the button.
  var iconTpl = document.getElementById("lang-icon");
  var rightButtons = document.querySelector(".right-buttons");
  if (!iconTpl || !rightButtons) return;

  // Work out the current page and which language it belongs to.
  var path = window.location.pathname;
  var normalized = path.endsWith("/") ? path + "index.html" : path;
  var isChinese = /\/cn\//.test("/" + normalized.replace(/^\/+/, ""));

  function clean(p) { return p.replace(/\/index\.html$/, "/"); }

  // Translate the current page path into the equivalent page in the other
  // language. English lives at the site root, Chinese under /cn/. mdBook emits
  // flat <page>.html files (and index.html for the landing page), so toggling
  // the language means inserting or removing a "/cn" segment right before the
  // final path segment. This stays correct under a GitHub Pages base path
  // (e.g. /learn-rust-in-500-lines/...).
  function target(toChinese) {
    if (toChinese) {
      if (isChinese) return clean(normalized);
      var i = normalized.lastIndexOf("/");
      return clean(normalized.slice(0, i) + "/cn" + normalized.slice(i));
    }
    return clean(normalized.replace("/cn/", "/"));
  }

  // --- toggle button -------------------------------------------------------
  var btn = document.createElement("button");
  btn.className = "icon-button";
  btn.id = "lang-toggle";
  btn.type = "button";
  btn.title = isChinese ? "切换语言" : "Switch language";
  btn.setAttribute("aria-haspopup", "menu");
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-controls", "lang-list");
  btn.appendChild(iconTpl.content.cloneNode(true));

  // --- popup menu ----------------------------------------------------------
  var list = document.createElement("ul");
  list.className = "lang-popup";
  list.id = "lang-list";
  list.setAttribute("role", "menu");
  list.setAttribute("aria-label", "Languages");

  var options = [
    { label: "English", toChinese: false },
    { label: "中文", toChinese: true },
  ];
  options.forEach(function (opt) {
    var li = document.createElement("li");
    li.setAttribute("role", "none");
    var item = document.createElement("button");
    item.className = "lang-option";
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.textContent = opt.label;
    if (opt.toChinese === isChinese) {
      item.classList.add("lang-selected");
      item.setAttribute("aria-current", "true");
    }
    item.addEventListener("click", function () {
      window.location.href = target(opt.toChinese);
    });
    li.appendChild(item);
    list.appendChild(li);
  });

  // --- open/close behaviour (mirrors mdBook's theme popup) ----------------
  function show() {
    list.style.display = "block";
    btn.setAttribute("aria-expanded", "true");
    var sel = list.querySelector(".lang-selected") || list.querySelector(".lang-option");
    if (sel) sel.focus();
  }
  function hide() {
    list.style.display = "none";
    btn.setAttribute("aria-expanded", "false");
    btn.focus();
  }
  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (list.style.display === "block") hide(); else show();
  });
  // Dismiss on outside click.
  document.addEventListener("click", function (e) {
    if (list.style.display !== "block") return;
    if (btn.contains(e.target) || list.contains(e.target)) return;
    hide();
  });
  // Dismiss on Escape.
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && list.style.display === "block") {
      e.preventDefault();
      hide();
    }
  });

  // Insert the globe as the first button (left of Print / Git), so the
  // top-right order reads: [Language] [Print] [GitHub].
  rightButtons.insertBefore(btn, rightButtons.firstChild);
  rightButtons.appendChild(list);
})();
