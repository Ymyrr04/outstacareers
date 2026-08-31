// Shared LinkedIn profile scraper. Loaded as a content script on LinkedIn
// pages and reused by the popup (via chrome.scripting.executeScript).
// Exposed as window.__outstaScrape.
(function () {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

  function meta(name) {
    const el =
      document.querySelector(`meta[property="${name}"]`) ||
      document.querySelector(`meta[name="${name}"]`);
    return el ? el.getAttribute("content") : null;
  }

  function topCard() {
    const h1 =
      document.querySelector("main h1") ||
      document.querySelector("h1.text-heading-xlarge") ||
      document.querySelector("h1");
    if (!h1) return { h1: null, card: document.querySelector("main") || document.body };
    let card = h1;
    for (let i = 0; i < 6 && card.parentElement; i++) {
      card = card.parentElement;
      if (card.tagName === "SECTION" || card.querySelectorAll("button, a").length >= 3) break;
    }
    return { h1, card };
  }

  // Find a <section> whose heading text matches (Experience, Education, Skills…)
  function sectionByHeading(label) {
    const anchor = document.querySelector(`#${label.toLowerCase()}`);
    if (anchor?.closest("section")) return anchor.closest("section");
    const sections = [...document.querySelectorAll("main section, section")];
    for (const s of sections) {
      const h = s.querySelector("h2, h3");
      if (h && clean(h.textContent).toLowerCase().startsWith(label.toLowerCase())) return s;
    }
    return null;
  }

  function sectionItems(section, max = 10) {
    if (!section) return [];
    const items = [];
    const lis = section.querySelectorAll("ul > li");
    lis.forEach((li) => {
      if (items.length >= max) return;
      if (li.querySelector("ul > li")) return; // skip wrappers with nested lists handled separately
      let parts = [...li.querySelectorAll('span[aria-hidden="true"]')]
        .map((s) => clean(s.textContent))
        .filter(Boolean);
      if (!parts.length) {
        const t = clean(li.textContent);
        if (t) parts = [t.slice(0, 200)];
      }
      // de-duplicate consecutive repeats LinkedIn renders for a11y
      const dedup = parts.filter((p, i) => p && p !== parts[i - 1]);
      if (dedup.length) items.push(dedup.slice(0, 4).join(" · "));
    });
    return items;
  }

  function scrapeLinkedInProfile() {
    const { h1, card } = topCard();

    let fullName = clean(h1?.textContent);
    if (!fullName) {
      fullName = clean((meta("og:title") || document.title || "").replace(/\s*[|\-–]\s*LinkedIn.*$/i, ""));
    }
    if (!fullName) return null;

    const isNoise = (t) =>
      !t ||
      t === fullName ||
      /connection|follower|contact info|mutual|open to|message|more|follow|save to pdf|profile/i.test(t);

    // Collect candidate text blocks inside the top card, in DOM order.
    const blocks = [];
    card.querySelectorAll("div, span, p").forEach((el) => {
      if (el.children.length > 0 && el.tagName !== "SPAN") return;
      const t = clean(el.textContent);
      if (!t || t.length > 300) return;
      if (blocks[blocks.length - 1] === t) return;
      blocks.push(t);
    });

    let headline =
      clean(card.querySelector(".text-body-medium.break-words")?.textContent) ||
      clean(card.querySelector("div.text-body-medium")?.textContent) ||
      null;

    let location =
      clean(card.querySelector(".text-body-small.inline.t-black--light.break-words")?.textContent) ||
      null;

    if (!headline) {
      const idx = blocks.findIndex((b) => b === fullName);
      headline = blocks.slice(idx + 1).find((b) => !isNoise(b) && b.length > 3) || null;
    }
    if (!location) {
      location =
        blocks.find(
          (b) =>
            b !== headline &&
            !isNoise(b) &&
            b.length < 90 &&
            /,/.test(b) &&
            !/\bat\b|@|\||•/.test(b)
        ) || null;
    }

    const desc = meta("og:description") || meta("description") || "";
    if (desc) {
      if (!headline) {
        const m = desc.match(/^\s*([^·]+)/);
        if (m) headline = clean(m[1]);
      }
      if (!location) {
        const m = desc.match(/Location:\s*([^·]+)/i);
        if (m) location = clean(m[1]);
      }
    }

    const aboutSection = sectionByHeading("About");
    let about = null;
    if (aboutSection) {
      const span = aboutSection.querySelector('span[aria-hidden="true"]');
      about = clean(span?.textContent || aboutSection.textContent).replace(/^About\s*/i, "").slice(0, 4000) || null;
    }

    const experience = sectionItems(sectionByHeading("Experience"), 10);
    const education = sectionItems(sectionByHeading("Education"), 6);

    const skills = [];
    const skillsSection = sectionByHeading("Skills");
    if (skillsSection) {
      skillsSection.querySelectorAll('span[aria-hidden="true"]').forEach((s) => {
        const t = clean(s.textContent);
        if (t && t.length < 60 && !/endorsement|show all/i.test(t) && !skills.includes(t)) skills.push(t);
      });
    }

    const photoEl =
      card.querySelector('img[class*="profile-photo"]') ||
      card.querySelector('button[aria-label*="photo" i] img') ||
      card.querySelector('img[class*="pv-top-card"]') ||
      card.querySelector("img");
    let photoUrl = photoEl?.src || null;
    if (!photoUrl || photoUrl.startsWith("data:")) {
      photoUrl = meta("og:image") || null;
      if (photoUrl && !/licdn|profile|media/i.test(photoUrl)) photoUrl = null;
    }

    // Current title/company
    let currentTitle = null;
    let currentCompany = null;

    // LinkedIn renders a "Current company: X" button in the top card
    const companyBtn = [...card.querySelectorAll("button, a, div")].find((el) =>
      /current company/i.test(el.getAttribute("aria-label") || "")
    );
    if (companyBtn) {
      currentCompany = clean(companyBtn.getAttribute("aria-label").replace(/current company:?/i, ""));
    }
    if (!currentCompany) {
      // First experience entry: "Title · Company · Dates"
      const first = (experience[0] || "").split(" · ").map(clean);
      if (first.length >= 2) {
        currentTitle = first[0] || null;
        currentCompany = (first[1] || "").replace(/\s*·.*$/, "").replace(/\s*(Full-time|Part-time|Contract|Freelance|Self-employed).*$/i, "") || null;
      }
    }
    if (headline && /\s(at|@)\s/i.test(headline)) {
      const parts = headline.split(/\s+at\s+|\s+@\s+/i);
      currentTitle = currentTitle || clean(parts[0]);
      currentCompany = currentCompany || clean(parts[parts.length - 1]);
    }
    if (!currentTitle && headline && headline.length < 120) currentTitle = headline;

    return {
      full_name: fullName,
      headline,
      current_title: currentTitle,
      current_company: currentCompany,
      location,
      profile_url: window.location.href.split("?")[0],
      about,
      experience,
      education,
      skills: skills.slice(0, 20),
      photo_url: photoUrl,
      source: "linkedin-extension",
    };
  }

  window.__outstaScrape = scrapeLinkedInProfile;
})();
