// OutSta Outreach — adds an "Import to OutSta" item to the profile's
// "⋯ More" dropdown menu (works on every profile, no Recruiter/Sales Nav
// needed), plus a fallback button row below the action bar. Clicking it
// scrapes the profile and imports it straight into the Outreach tab.
(function () {
  const FUNCTION_URL =
    "https://ohxtavjababtrcrkgndq.supabase.co/functions/v1/import-outreach-profile";
  const BTN_ID = "outsta-import-btn";
  const ROW_ID = "outsta-import-row";
  const MENU_ITEM_ID = "outsta-import-menu-item";

  function scrape() {
    // scraper.js registers window.__outstaScrape
    if (typeof window.__outstaScrape === "function")
      return window.__outstaScrape();
    return null;
  }

  function findActionBar() {
    const knownBar =
      document.querySelector(".pv-top-card-v2-ctas") ||
      document.querySelector('[class*="pv-top-card"] [class*="ctas"]');
    if (knownBar) return knownBar;

    // LinkedIn serves several profile headers. Some use buttons, others use
    // anchors or nested role=button controls (including "View in Recruiter").
    const heading =
      document.querySelector("h1.text-heading-xlarge") ||
      document.querySelector("main h1");
    const profileCard = heading?.closest("section") || heading?.parentElement?.parentElement;
    if (!profileCard) return null;

    const actionPattern = /^(message|connect|follow|pending|more|view in recruiter)\b/i;
    const controls = [...profileCard.querySelectorAll('button, a, [role="button"]')].filter(
      (el) => {
        const label = (el.getAttribute("aria-label") || el.textContent || "")
          .trim()
          .replace(/\s+/g, " ");
        return actionPattern.test(label) && el.offsetParent !== null;
      }
    );
    if (!controls.length) return null;

    // Find the smallest shared row containing at least two visible actions.
    let candidate = controls[0];
    for (let depth = 0; depth < 7 && candidate.parentElement; depth++) {
      candidate = candidate.parentElement;
      const contained = controls.filter((control) => candidate.contains(control));
      if (contained.length >= 2) return candidate;
    }

    return controls[0].parentElement;
  }

  function setBtnState(btn, state, label) {
    const span = btn.querySelector(".outsta-label");
    if (state === "busy") {
      btn.disabled = true;
      if (span) span.textContent = label || "Importing…";
    } else if (state === "ok") {
      btn.disabled = true;
      if (span) span.textContent = "Imported ✓";
      btn.style.background = "#0e9f6e";
    } else if (state === "err") {
      btn.disabled = false;
      if (span) span.textContent = label || "Retry import";
      btn.style.background = "#b91c1c";
    } else {
      btn.disabled = false;
      if (span) span.textContent = "Import to OutSta";
    }
  }

  async function doImport(btn) {
    setBtnState(btn, "busy");

    const settings = await chrome.storage.local.get(["importKey", "functionUrl"]);
    if (!settings.importKey) {
      setBtnState(btn, "err", "Set API key in extension options");
      return;
    }

    const data = scrape();
    if (!data || !data.full_name) {
      setBtnState(btn, "err", "Profile not loaded yet — try again");
      setTimeout(() => setBtnState(btn, "idle"), 3000);
      return;
    }
    data.linkedin_url = data.profile_url;
    delete data.profile_url;

    try {
      const res = await fetch(settings.functionUrl || FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-import-key": settings.importKey,
        },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      setBtnState(btn, "ok");
    } catch (e) {
      setBtnState(btn, "err", e.message.slice(0, 40));
      setTimeout(() => setBtnState(btn, "idle"), 4000);
    }
  }

  function inject() {
    if (!/^\/in\//.test(window.location.pathname)) return;
    if (document.getElementById(BTN_ID)) return;

    const bar = findActionBar();
    if (!bar) return;

    const row = document.createElement("div");
    row.id = ROW_ID;
    row.style.cssText = [
      "display:flex",
      "align-items:center",
      "width:100%",
      "margin:8px 0 4px",
      "position:relative",
      "z-index:20",
    ].join(";");

    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.title = "Import this profile to OutSta Outreach";
    btn.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "gap:6px",
      "margin:0",
      "border:none",
      "border-radius:16px",
      "padding:6px 16px",
      "font-family:inherit",
      "font-size:14px",
      "font-weight:600",
      "cursor:pointer",
      "background:#0ABEDF",
      "color:#062630",
      "height:32px",
    ].join(";");

    const img = document.createElement("img");
    img.src = chrome.runtime.getURL("icon.png");
    img.width = 18;
    img.height = 18;
    img.style.borderRadius = "4px";
    btn.appendChild(img);

    const label = document.createElement("span");
    label.className = "outsta-label";
    label.textContent = "Import to OutSta";
    btn.appendChild(label);

    btn.addEventListener("click", () => doImport(btn));

    // Place the button in a dedicated row below either profile-header variant.
    row.appendChild(btn);
    bar.insertAdjacentElement("afterend", row);
  }

  // ---- "⋯ More" dropdown menu injection -------------------------------
  // The More button exists on every profile (no Recruiter/Sales Nav
  // needed). LinkedIn renders the dropdown lazily on click, so we watch
  // for clicks on More buttons, then insert our item once the menu opens.
  function buildMenuItem() {
    const item = document.createElement("div");
    item.id = MENU_ITEM_ID;
    item.setAttribute("role", "button");
    item.tabIndex = 0;
    item.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:8px",
      "padding:8px 16px",
      "cursor:pointer",
      "font-size:14px",
      "font-weight:600",
      "color:#0ABEDF",
      "background:transparent",
    ].join(";");

    const img = document.createElement("img");
    img.src = chrome.runtime.getURL("icon.png");
    img.width = 18;
    img.height = 18;
    img.style.borderRadius = "4px";
    item.appendChild(img);

    const label = document.createElement("span");
    label.className = "outsta-label";
    label.textContent = "Import to OutSta";
    item.appendChild(label);

    const run = () => doImport(item);
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      run();
    });
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        run();
      }
    });
    return item;
  }

  function tryInjectMenuItem() {
    if (!/^\/in\//.test(window.location.pathname)) return;
    if (document.getElementById(MENU_ITEM_ID)) return;
    // LinkedIn dropdowns render into a global overlay; find an open menu.
    const menus = document.querySelectorAll(
      '.artdeco-dropdown__content-inner, [role="menu"], [class*="dropdown__content"]'
    );
    for (const menu of menus) {
      if (menu.offsetParent === null) continue; // hidden
      if (menu.querySelector("#" + MENU_ITEM_ID)) continue;
      const item = buildMenuItem();
      item.id = MENU_ITEM_ID;
      menu.appendChild(item);
      return;
    }
  }

  // Detect clicks on any "More" / "More actions" control, then wait a tick
  // for the dropdown to render before injecting.
  document.addEventListener(
    "click",
    (e) => {
      const control = e.target.closest?.('button, a, [role="button"]');
      if (!control) return;
      const label = (control.getAttribute("aria-label") || control.textContent || "")
        .trim()
        .replace(/\s+/g, " ");
      if (!/^more\b/i.test(label)) return;
      let tries = 0;
      const poll = setInterval(() => {
        tryInjectMenuItem();
        if (++tries >= 10) clearInterval(poll);
      }, 150);
    },
    true
  );

  // ---- SPA navigation handling -----------------------------------------
  // LinkedIn is a SPA — re-inject on navigation and wait for lazy DOM.
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      document.getElementById(ROW_ID)?.remove();
    }
    inject();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Keep a lightweight retry because LinkedIn can replace the top card after
  // initial load or navigate to a profile without a full page refresh.
  const timer = setInterval(() => {
    inject();
  }, 1000);
})();
