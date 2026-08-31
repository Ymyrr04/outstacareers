// OutSta Outreach — injects an "Import" button into the LinkedIn profile
// action bar (next to Message / Connect). Clicking it scrapes the profile
// and imports it straight into the Outreach tab.
(function () {
  const FUNCTION_URL =
    "https://ohxtavjababtrcrkgndq.supabase.co/functions/v1/import-outreach-profile";
  const BTN_ID = "outsta-import-btn";
  const ROW_ID = "outsta-import-row";

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
