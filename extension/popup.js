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

// Runs inside the LinkedIn page. Heuristic scraper with graceful fallbacks.
function scrapeLinkedInProfile() {
  const text = (sel, root = document) => {
    const el = root.querySelector(sel);
    return el ? el.textContent.trim().replace(/\s+/g, " ") : null;
  };

  const pickFirst = (selectors) => {
    for (const s of selectors) {
      const v = text(s);
      if (v) return v;
    }
    return null;
  };

  const sectionByAnchor = (id) => {
    const anchor = document.querySelector(`#${id}`);
    return anchor ? anchor.closest("section") : null;
  };

  const sectionItems = (section, max = 10) => {
    if (!section) return [];
    const items = [];
    section.querySelectorAll("ul > li").forEach((li) => {
      if (items.length >= max) return;
      const spans = [...li.querySelectorAll('span[aria-hidden="true"]')]
        .map((s) => s.textContent.trim().replace(/\s+/g, " "))
        .filter(Boolean);
      if (spans.length) items.push(spans.slice(0, 4).join(" · "));
    });
    return items;
  };

  const topCard =
    document.querySelector("section:has(.pv-top-card)") ||
    document.querySelector(".pv-top-card")?.closest("section") ||
    document;

  const fullName = pickFirst([
    "h1.text-heading-xlarge",
    ".pv-text-details__left-panel h1",
    "h1",
  ]);

  const headline = pickFirst([
    ".text-body-medium.break-words",
    ".pv-text-details__left-panel .text-body-medium",
  ]);

  const location = pickFirst([
    ".text-body-small.inline.t-black--light.break-words",
    ".pv-text-details__left-panel .text-body-small.inline",
  ]);

  const aboutSection = sectionByAnchor("about");
  const about = aboutSection
    ? (
        aboutSection.querySelector('span[aria-hidden="true"]')?.textContent ||
        aboutSection.querySelector(".visually-hidden")?.textContent ||
        ""
      )
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 4000)
    : null;

  const experience = sectionItems(sectionByAnchor("experience"), 10);
  const education = sectionItems(sectionByAnchor("education"), 6);

  const skillsSection =
    sectionByAnchor("skills") || sectionByAnchor("skills-section");
  const skills = [];
  if (skillsSection) {
    skillsSection
      .querySelectorAll('span[aria-hidden="true"]')
      .forEach((s) => {
        const t = s.textContent.trim().replace(/\s+/g, " ");
        if (t && t.length < 60 && !skills.includes(t)) skills.push(t);
      });
  }

  const photo =
    document.querySelector("img.pv-top-card-profile-picture__image--show") ||
    document.querySelector(".pv-top-card-profile-picture__image") ||
    document.querySelector('button[aria-label*="profile photo" i] img') ||
    topCard.querySelector("img");

  // Current role/company from the first experience entry, else headline.
  let currentTitle = null;
  let currentCompany = null;
  if (experience.length) {
    const first = experience[0].split(" · ").map((s) => s.trim());
    if (first.length >= 2) {
      currentTitle = first[0];
      currentCompany = first[1];
    }
  }
  if (!currentCompany && headline && headline.includes(" at ")) {
    const parts = headline.split(" at ");
    currentTitle = currentTitle || parts[0].trim();
    currentCompany = parts[parts.length - 1].trim();
  }

  return {
    full_name: fullName,
    headline,
    current_title: currentTitle,
    current_company: currentCompany,
    location,
    linkedin_url: location ? null : null, // filled below from page URL
    profile_url: window.location.href.split("?")[0],
    about,
    experience,
    education,
    skills: skills.slice(0, 20),
    photo_url: photo ? photo.src : null,
    source: "linkedin-extension",
  };
}

let scraped = null;

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

  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeLinkedInProfile,
    });
  } catch (e) {
    setStatus("Could not read this page: " + e.message, "err");
    return;
  }

  scraped = results?.[0]?.result;
  if (!scraped || !scraped.full_name) {
    setStatus("Could not find a profile on this page.", "err");
    return;
  }
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
