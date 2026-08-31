// Shared LinkedIn profile scraper. Loaded as a content script on LinkedIn
// pages and reused by the popup (via chrome.scripting.executeScript).
// Exposed as window.__outstaScrape.
(function () {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

  // Degree badges ("3rd", "· 2nd degree connection"), follower counts etc.
  const DEGREE_RE = /^[·•\-\s]*(1st|2nd|3rd|3rd\+)\b/i;
  const NOISE_RE =
    /(degree connection|connection[s]?$|followers?|mutual|contact info|open to|message|more|follow|save to pdf|view in recruiter|about this profile|status is|click to)/i;

  const isJunk = (t) =>
    !t ||
    t.length < 2 ||
    DEGREE_RE.test(t) ||
    NOISE_RE.test(t) ||
    /^\d+(\,\d+)*\+?\s*(followers|connections)/i.test(t);

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

  // Returns raw entries: { parts: [...], text: "a · b · c" }
  function sectionEntries(section, max = 10) {
    if (!section) return [];
    const out = [];
    const lis = section.querySelectorAll("ul > li");
    lis.forEach((li) => {
      if (out.length >= max) return;
      if (li.querySelector("ul > li")) return;
      let parts = [...li.querySelectorAll('span[aria-hidden="true"]')]
        .map((s) => clean(s.textContent))
        .filter(Boolean);
      if (!parts.length) {
        const t = clean(li.textContent);
        if (t) parts = [t.slice(0, 200)];
      }
      const dedup = parts.filter((p, i) => p && p !== parts[i - 1]);
      if (dedup.length) out.push({ parts: dedup, text: dedup.slice(0, 4).join(" · ") });
    });
    return out;
  }

  const EMPLOYMENT_RE = /(full-time|part-time|contract|freelance|self-employed|internship|permanent|seasonal|apprenticeship)/i;

  function cleanCompany(v) {
    let c = clean(v || "");
    if (!c) return null;
    c = c.split("·")[0].trim();
    c = c.replace(EMPLOYMENT_RE, "").replace(/[·•\-–,\s]+$/, "").trim();
    if (!c || isJunk(c) || c.length > 120) return null;
    return c;
  }

  function scrapeLinkedInProfile() {
    const { h1, card } = topCard();

    let fullName = clean(h1?.textContent);
    if (!fullName) {
      fullName = clean(
        (meta("og:title") || document.title || "").replace(/\s*[|\-–]\s*LinkedIn.*$/i, "")
      );
    }
    // Strip trailing degree badge from the name if LinkedIn glued it in
    fullName = clean(fullName.replace(/\s*[·•]?\s*(1st|2nd|3rd\+?)\s*$/i, ""));
    if (!fullName) return null;

    const isNoise = (t) => !t || t === fullName || isJunk(t);

    // Candidate text blocks inside the top card, in DOM order.
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
    if (isNoise(headline)) headline = null;

    let location =
      clean(card.querySelector(".text-body-small.inline.t-black--light.break-words")?.textContent) ||
      null;
    if (isNoise(location)) location = null;

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
        if (m && !isNoise(clean(m[1]))) headline = clean(m[1]);
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
      about =
        clean(span?.textContent || aboutSection.textContent)
          .replace(/^About\s*/i, "")
          .slice(0, 4000) || null;
    }

    const expEntries = sectionEntries(sectionByHeading("Experience"), 10);
    const experience = expEntries.map((e) => e.text);
    const education = sectionEntries(sectionByHeading("Education"), 6).map((e) => e.text);

    const skills = [];
    const skillsSection = sectionByHeading("Skills");
    if (skillsSection) {
      skillsSection.querySelectorAll('span[aria-hidden="true"]').forEach((s) => {
        const t = clean(s.textContent);
        if (t && t.length < 60 && !/endorsement|show all/i.test(t) && !skills.includes(t))
          skills.push(t);
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

    // ---- Current title / company -------------------------------------
    let currentTitle = null;
    let currentCompany = null;

    // 1) Top-card "Current company: X" control
    const companyBtn = [...card.querySelectorAll("button, a, div")].find((el) =>
      /current company/i.test(el.getAttribute("aria-label") || "")
    );
    if (companyBtn) {
      currentCompany = cleanCompany(
        (companyBtn.getAttribute("aria-label") || "").replace(/current company:?/i, "")
      );
    }
    // 2) Top-card company logo/link text (newer layouts)
    if (!currentCompany) {
      const link = [...card.querySelectorAll('a[href*="/company/"]')]
        .map((a) => clean(a.textContent))
        .find((t) => t && !isJunk(t));
      currentCompany = cleanCompany(link);
    }
    // 3) First experience entry: usually [Title, Company · Type, Dates, Location]
    if (expEntries.length) {
      const p = expEntries[0].parts;
      if (!currentTitle && p[0] && !isJunk(p[0])) currentTitle = clean(p[0]);
      if (!currentCompany && p[1]) currentCompany = cleanCompany(p[1]);
      // Grouped-company layout: [Company, Type/Dates, Title...]
      if (!currentCompany && p[0]) currentCompany = cleanCompany(p[0]);
    }
    // 4) Headline "Title at Company"
    if (headline && /\s(at|@)\s/i.test(headline)) {
      const parts = headline.split(/\s+at\s+|\s+@\s+/i);
      currentTitle = currentTitle || clean(parts[0]);
      currentCompany = currentCompany || cleanCompany(parts[parts.length - 1]);
    }
    // 5) og:description often reads "Experience: Acme · Location: ..."
    if (!currentCompany && desc) {
      const m = desc.match(/Experience:\s*([^·]+)/i);
      if (m) currentCompany = cleanCompany(m[1]);
    }
    if (!currentTitle && headline && headline.length < 120) currentTitle = headline;
    if (currentTitle && isJunk(currentTitle)) currentTitle = null;

    return {
      full_name: fullName,
      headline: isJunk(headline) ? null : headline,
      current_title: currentTitle,
      current_company: currentCompany,
      location: isJunk(location) ? null : location,
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
