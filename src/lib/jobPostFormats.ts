import {
  DEFAULT_PHP_RATE, displayJobRate, formatUsdRate, hoursRange, parseLegacyUsdHourly, usesPhpConversion, type JobPay,
} from './jobRate';

export type JobPostPlatform = 'general' | 'indeed' | 'facebook' | 'threads' | 'linkedin';

export interface JobPostInput extends JobPay {
  id: string;
  title: string;
  description?: string | null;
  responsibilities?: string[] | null;
  qualifications?: string[] | null;
  rate?: string | null;
  region?: string | null;
}

export interface JobPostOptions {
  workHours?: string;
  phpPerUsd?: number;
  /** Indeed only: show the monthly estimate in this country's currency. */
  country?: PayCountry;
}

export interface PayCountry {
  currency: string;
  symbol?: string | null;
  perUsd: number;
}

export interface JobPost {
  text: string;
  html?: string;
  charLimit: number | null;
}

export const CHAR_LIMITS: Record<JobPostPlatform, number | null> = {
  general: null,
  indeed: null,
  facebook: null,
  threads: 500,
  linkedin: 3000,
};

export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clean = (items?: string[] | null) => (items ?? []).map((s) => stripHtml(s)).filter(Boolean);
const bullets = (items: string[]) => items.map((i) => `• ${i}`).join('\n');

export const jobApplyLink = (job: Pick<JobPostInput, 'id'>) =>
  `https://outstahub.com/job/${job.id}`;

export function jobPostRate(job: JobPostInput, phpPerUsd = DEFAULT_PHP_RATE): string {
  return displayJobRate(job, usesPhpConversion(job.region), phpPerUsd) || 'Competitive compensation';
}

const roundMonthly = (n: number, perUsd: number) => {
  const step = perUsd > 1000 ? 10000 : 100;
  return Math.round(n / step) * step;
};

/** Monthly estimate in a chosen country's currency; Philippines keeps the existing peso output. */
export function countryPayRate(job: JobPostInput, country: PayCountry): string {
  if (country.currency.toUpperCase() === 'PHP') {
    return displayJobRate(job, true, country.perUsd) || 'Competitive compensation';
  }
  let lo: number | null = null;
  let hi: number | null = null;
  let hours = hoursRange(job.hours_option);
  if (job.rate_min != null && Number.isFinite(Number(job.rate_min))) {
    lo = Number(job.rate_min);
    hi = job.rate_type === 'range' && job.rate_max != null ? Number(job.rate_max) : lo;
  } else if (job.rate) {
    lo = hi = parseLegacyUsdHourly(job.rate);
    hours = null; // old jobs have no stored hours
  }
  const usd = job.rate_min != null ? formatUsdRate(job) : job.rate || null;
  if (lo == null || hi == null || !hours || !(country.perUsd > 0)) return usd || 'Competitive compensation';
  const min = roundMonthly(lo * hours[0] * 4 * country.perUsd, country.perUsd);
  const max = roundMonthly(hi * hours[1] * 4 * country.perUsd, country.perUsd);
  const f = (n: number) =>
    country.symbol ? `${country.symbol}${n.toLocaleString('en-US')}` : `${country.currency.toUpperCase()} ${n.toLocaleString('en-US')}`;
  return min === max ? `${f(min)}/month` : `${f(min)} - ${f(max)}/month`;
}

interface Parts {
  title: string;
  description: string;
  responsibilities: string[];
  qualifications: string[];
  link: string;
  rate: string;
  workHours: string;
}

function parts(job: JobPostInput, opts: JobPostOptions, platform: JobPostPlatform): Parts {
  return {
    title: job.title.trim(),
    description: stripHtml(job.description),
    responsibilities: clean(job.responsibilities),
    qualifications: clean(job.qualifications),
    link: jobApplyLink(job),
    rate: platform === 'indeed' && opts.country ? countryPayRate(job, opts.country) : jobPostRate(job, opts.phpPerUsd),
    workHours: (opts.workHours ?? '').trim(),
  };
}

function longForm(p: Parts, description: string, emoji: boolean): string[] {
  const h = (e: string, t: string) => (emoji ? `${e} ${t}` : t);
  const blocks: string[] = [];
  if (description) blocks.push(`${h('📝', 'Job Description')}\n${description}`);
  if (p.responsibilities.length) blocks.push(`${h('✅', 'Key Responsibilities')}\n${bullets(p.responsibilities)}`);
  if (p.qualifications.length) blocks.push(`${h('🎯', 'Qualifications')}\n${bullets(p.qualifications)}`);
  blocks.push(
    `${h('📩', 'How to apply Instructions:')}\nIf you’re interested for this position, kindly apply through this link:\n${p.link}`,
  );
  blocks.push(`${h('⚠️', 'Important:')}\n• Upload your Updated CV\n• Upload your CV in PDF Format and in English`);
  const details = ['Work Arrangement: Full-Time Independent Contractor', `Rate: ${p.rate}`];
  if (p.workHours) details.push(`Work Hours: ${p.workHours}`);
  details.push('Location: Remote');
  blocks.push(details.join('\n'));
  return blocks;
}

function indeedHtml(p: Parts): string {
  const out: string[] = [`<p><strong>${esc(p.title)}</strong></p>`];
  const list = (items: string[]) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
  if (p.description) {
    out.push('<p><strong>Job Description</strong></p>');
    out.push(...p.description.split(/\n{2,}/).map((para) => `<p>${esc(para).replace(/\n/g, '<br>')}</p>`));
  }
  if (p.responsibilities.length) out.push('<p><strong>Key Responsibilities</strong></p>', list(p.responsibilities));
  if (p.qualifications.length) out.push('<p><strong>Qualifications</strong></p>', list(p.qualifications));
  out.push(
    '<p><strong>How to apply Instructions:</strong></p>',
    `<p>If you’re interested for this position, kindly apply through this link:<br><a href="${esc(p.link)}">${esc(p.link)}</a></p>`,
    '<p><strong>Important:</strong></p>',
    list(['Upload your Updated CV', 'Upload your CV in PDF Format and in English']),
  );
  const details = ['Work Arrangement: Full-Time Independent Contractor', `Rate: ${p.rate}`];
  if (p.workHours) details.push(`Work Hours: ${p.workHours}`);
  details.push('Location: Remote');
  out.push(`<p>${details.map(esc).join('<br>')}</p>`);
  return out.join('\n');
}

function threads(p: Parts, limit: number): string {
  const build = (n: number) => {
    const lines = [p.title, `Rate: ${p.rate}`];
    if (p.workHours) lines.push(`Work Hours: ${p.workHours}`);
    const r = p.responsibilities.slice(0, n);
    const head = lines.join('\n');
    const tail = `Apply: ${p.link}\nUpload your CV in PDF and in English.`;
    return [head, r.length ? bullets(r) : '', tail].filter(Boolean).join('\n\n');
  };
  for (let n = Math.min(3, p.responsibilities.length); n >= 0; n--) {
    const t = build(n);
    if (t.length <= limit) return t;
  }
  // Still too long: shorten the title, never the link.
  const base = build(0);
  const over = base.length - limit;
  const title = p.title.slice(0, Math.max(0, p.title.length - over - 1)).trimEnd() + '…';
  return build.call(null, 0).replace(p.title, title);
}

export function buildJobPost(platform: JobPostPlatform, job: JobPostInput, opts: JobPostOptions = {}): JobPost {
  const p = parts(job, opts, platform);
  const charLimit = CHAR_LIMITS[platform];
  switch (platform) {
    case 'threads':
      return { text: threads(p, charLimit!), charLimit };
    case 'facebook':
      return {
        text: [`We’re hiring: ${p.title}`, ...longForm(p, p.description, true), '#Hiring #RemoteJobs'].join('\n\n'),
        charLimit,
      };
    case 'linkedin': {
      const make = (d: string) =>
        [`We’re hiring: ${p.title}`, ...longForm(p, d, false), '#Hiring #RemoteWork'].join('\n\n');
      let text = make(p.description);
      if (text.length > charLimit!) {
        const room = p.description.length - (text.length - charLimit!) - 1;
        text = make(room > 0 ? p.description.slice(0, room).trimEnd() + '…' : '');
        if (text.length > charLimit!) text = text.slice(0, charLimit! - 1) + '…';
      }
      return { text, charLimit };
    }
    case 'indeed':
      return { text: [p.title, ...longForm(p, p.description, false)].join('\n\n'), html: indeedHtml(p), charLimit };
    default:
      return { text: [p.title, ...longForm(p, p.description, false)].join('\n\n'), charLimit };
  }
}
