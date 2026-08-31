// Shared LinkedIn profile scraper. Used by popup.js (via executeScript)
// and duplicated logic-wise by content.js (which loads this file too).
// Exposed as window.__outstaScrape so both contexts can call it.
(function () {
  function scrapeLinkedInProfile() {
    const text = (sel, root = document) => {
      const el = root.querySelector(sel);
      return el ? el.textContent.trim().replace(/\s+/g, " ") : null;
    };

    const meta = (name) => {
      const el =
        document.querySelector(`meta[property="${name}"]`) ||
        document.querySelector(`meta[name="${name}"]`);
      return el ? el.getAttribute("content") : null;
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

    // ---- Name: DOM first, then og:title ("Meagan Brown | LinkedIn") ----
    let fullName = pickFirst([
      "h1.text-heading-xlarge",
      ".pv-text-details__left-panel h1",
      "main h1",
      "h1",
    ]);
    if (!fullName) {
      const ogTitle = meta("og:title") || document.title || "";
      fullName = ogTitle.replace(/\s*[|\-–]\s*LinkedIn.*$/i, "").trim() || null;
    }

    // ---- Headline: DOM, then meta description ----
    let headline = pickFirst([
      ".text-body-medium.break-words",
      ".pv-text-details__left-panel .text-body-medium",
      "div.text-body-medium",
    ]);

    // meta description format:
    // "Senior Human Resources Consultant · Experience: X · Education: Y · Location: Fairfax · 500+ connections..."
    let location = pickFirst([
      ".text-body-small.inline.t-black--light.break-words",
      ".pv-text-details__left-panel .text-body-small.inline",
      "span.text-body-small.inline",
    ]);

    const desc = meta("og:description") || meta("description");
    if (desc) {
      if (!headline) {
        const m = desc.match(/^\s*([^·]+)/);
        if (m) headline = m[1].trim();
      }
      if (!location) {
        const m = desc.match(/Location:\s*([^·]+)/i);
        if (m) location = m[1].trim();
      }
    }

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
      document.querySelector(".pv-top-card--photo img") ||
      document.querySelector('img[class*="profile-photo"]') ||
      document.querySelector('img[class*="pv-top-card"]');

    let photoUrl = photo ? photo.src : null;
    if (!photoUrl || photoUrl.includes("data:image")) {
      photoUrl = meta("og:image") || null;
      // og:image is sometimes the generic LinkedIn logo — drop those
      if (photoUrl && !/profile|media\/|licdn/i.test(photoUrl)) photoUrl = null;
    }

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
    if (!currentCompany && headline && /\s(at|@)\s/i.test(headline)) {
      const parts = headline.split(/\s+at\s+|\s+@\s+/i);
      currentTitle = currentTitle || parts[0].trim();
      currentCompany = parts[parts.length - 1].trim();
    }

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
