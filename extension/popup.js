// OutSta Outreach Importer — popup logic.
// Scrapes the active LinkedIn profile tab and POSTs it to the import function.

const DEFAULT_FUNCTION_URL =
  "https://ohxtavjababtrcrkgndq.supabase.co/functions/v1/import-outreach-profile";

const $ = (id) => document.getElementById(id);

function setStatus(text, kind = "info") {
  const el = $("status");
  el.textContent = text || "";
  el.className = "status " + kind;
}

let scraped = null;

// Runs the shared scraper (scraper.js) inside the LinkedIn tab.
async function tryScrape(tabId, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      // Make sure the shared scraper is present (content script may not have run).
      await chrome.scripting.executeScript({ target: { tabId }, files: ["scraper.js"] });
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => (typeof window.__outstaScrape === "function" ? window.__outstaScrape() : null),
      });
      const data = results?.[0]?.result;
      if (data && data.full_name) return { data };
    } catch (e) {
      if (i === attempts - 1) return { error: "Could not read this page: " + e.message };
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  return { error: null };
}


async function init() {
  $("options-link").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  if (!/linkedin\.com\/in\//.test(url)) {
    $("not-profile").style.display = "block";
    setStatus("");
    return;
  }

  setStatus("Reading profile…");

  const { data, error } = await tryScrape(tab.id);
  if (error) {
    setStatus(error, "err");
    return;
  }
  if (!data) {
    setStatus("Could not find a profile on this page. Scroll to the top and try again.", "err");
    return;
  }

  scraped = data;
  scraped.linkedin_url = scraped.profile_url;
  delete scraped.profile_url;

  $("p-name").textContent = scraped.full_name;
  $("p-headline").textContent = scraped.headline || "";
  $("p-meta").textContent = [scraped.current_company, scraped.location]
    .filter(Boolean)
    .join(" — ");
  if (scraped.photo_url) {
    const img = $("p-photo");
    img.src = scraped.photo_url;
    img.style.display = "block";
  }
  const chips = $("p-chips");
  (scraped.skills || []).slice(0, 8).forEach((s) => {
    const c = document.createElement("span");
    c.className = "chip";
    c.textContent = s;
    chips.appendChild(c);
  });

  $("f-title").value = scraped.current_title || "";
  $("f-company").value = scraped.current_company || "";

  $("preview").style.display = "block";
  $("edit").style.display = "block";
  $("import-btn").style.display = "block";
  setStatus("");

  $("import-btn").addEventListener("click", doImport);
}

async function doImport() {
  const btn = $("import-btn");
  btn.disabled = true;
  setStatus("Importing…");

  const settings = await chrome.storage.local.get(["importKey", "functionUrl"]);
  if (!settings.importKey) {
    setStatus("Set your import key in Settings first.", "err");
    btn.disabled = false;
    chrome.runtime.openOptionsPage();
    return;
  }

  const payload = {
    ...scraped,
    current_title: $("f-title").value.trim() || scraped.current_title,
    current_company: $("f-company").value.trim() || scraped.current_company,
  };

  try {
    const res = await fetch(settings.functionUrl || DEFAULT_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-import-key": settings.importKey,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    setStatus(`Imported ${data.prospect?.full_name || "profile"} ✓`, "ok");
    btn.textContent = "Imported ✓";
  } catch (e) {
    setStatus(e.message, "err");
    btn.disabled = false;
  }
}

init();
