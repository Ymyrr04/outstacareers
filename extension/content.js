// OutSta Outreach — injects an "Import" button into the LinkedIn profile
// action bar (next to Message / Connect). Clicking it scrapes the profile
// and imports it straight into the Outreach tab.
(function () {
  const FUNCTION_URL =
    "https://ohxtavjababtrcrkgndq.supabase.co/functions/v1/import-outreach-profile";
  const BTN_ID = "outsta-import-btn";

  function scrape() {
    // scraper.js registers window.__outstaScrape
    if (typeof window.__outstaScrape === "function")
      return window.__outstaScrape();
    return null;
  }

  function findActionBar() {
    // The row that holds Message / Connect / More buttons in the top card.
    return (
      document.querySelector(".pv-top-card-v2-ctas") ||
      document.querySelector('[class*="pv-top-card"] [class*="ctas"]') ||
      (() => {
        const msgBtn = [...document.querySelectorAll("button")].find(
          (b) =>
            /^(message|connect|follow)/i.test(
              (b.getAttribute("aria-label") || b.textContent || "").trim()
            )
        );
        if (!msgBtn) return null;
        // The Connect button often sits inside a wrapper li/div — climb to
        // the container that holds all the action buttons.
        let el = msgBtn;
        for (let i = 0; i < 4 && el.parentElement; i++) {
          el = el.parentElement;
          if (el.querySelectorAll("button").length >= 2) break;
        }
        return el;
      })()
    );
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

    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.title = "Import this profile to OutSta Outreach";
    btn.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "gap:6px",
      "margin:8px 0 4px",
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

    // Place the button in its own row directly below the Connect / Message bar.
    bar.insertAdjacentElement("afterend", btn);
  }

  // LinkedIn is a SPA — re-inject on navigation and wait for lazy DOM.
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) lastUrl = location.href;
    inject();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Retry a few times while the profile top card lazy-loads.
  let tries = 0;
  const timer = setInterval(() => {
    inject();
    if (document.getElementById(BTN_ID) || ++tries > 20) clearInterval(timer);
  }, 1000);
})();
