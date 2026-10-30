import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildJobPost, countryPayRate } from './jobPostFormats';

const job = {
  id: 'abc-123',
  title: 'Executive Assistant',
  description: '<p>Support our <strong>CEO</strong> daily.</p>',
  responsibilities: ['Manage calendar', 'Handle email', 'Book travel', 'Prepare reports'],
  qualifications: ['2+ years experience'],
  rate: '$5/hr',
  region: 'global',
};
const link = 'https://outstahub.com/job/abc-123';

describe('buildJobPost', () => {
  it('general layout follows the required order', () => {
    const { text } = buildJobPost('general', job, { workHours: '40 hrs/week' });
    const order = ['Executive Assistant', 'Job Description', 'Support our CEO daily.', 'Key Responsibilities', '• Manage calendar',
      'Qualifications', 'How to apply Instructions:', 'If you’re interested for this position, kindly apply through this link:', link,
      'Important:', '• Upload your Updated CV', '• Upload your CV in PDF Format and in English',
      'Work Arrangement: Full-Time Independent Contractor', 'Rate: $5/hr', 'Work Hours: 40 hrs/week', 'Location: Remote'];
    let pos = -1;
    for (const s of order) { const i = text.indexOf(s, pos + 1); assert.ok(i > pos, `missing/out of order: ${s}`); pos = i; }
    assert.ok(!text.includes('<'));
  });

  it('threads stays within 500 characters and keeps the link', () => {
    const long = { ...job, responsibilities: Array(3).fill('x'.repeat(200)) };
    const { text, charLimit } = buildJobPost('threads', long, { workHours: '40 hrs/week' });
    assert.strictEqual(charLimit, 500);
    assert.ok(text.length <= 500);
    assert.ok(text.includes(`Apply: ${link}`));
    assert.ok(text.includes('Upload your CV in PDF and in English.'));
  });

  it('linkedin stays within 3,000 characters', () => {
    const { text } = buildJobPost('linkedin', { ...job, description: 'word '.repeat(2000) });
    assert.ok(text.length <= 3000);
    assert.ok(text.startsWith('We’re hiring: Executive Assistant'));
    assert.ok(text.endsWith('#Hiring #RemoteWork'));
    assert.ok(text.includes('…'));
    assert.ok(text.includes(link));
  });

  it('skips empty sections and uses Competitive compensation', () => {
    const { text, html } = buildJobPost('indeed', { ...job, description: '<p> </p>', responsibilities: [], qualifications: [''], rate: null });
    assert.ok(!text.includes('Job Description'));
    assert.ok(!text.includes('Key Responsibilities'));
    assert.ok(!text.includes('Qualifications'));
    assert.ok(!text.includes('Work Hours'));
    assert.ok(text.includes('Rate: Competitive compensation'));
    assert.ok(html && html.includes('<ul>') && !html.includes('Key Responsibilities'));
  });

  it('bolds the detail labels in the Indeed HTML', () => {
    const { html } = buildJobPost('indeed', job, { workHours: '8am - 5pm EST' });
    assert.ok(html && html.includes('<strong>Work Arrangement:</strong>'));
    assert.ok(html && html.includes('<strong>Rate:</strong>'));
    assert.ok(html && html.includes('<strong>Work Hours:</strong> 8am - 5pm EST'));
    assert.ok(html && html.includes('<strong>Location:</strong> Remote'));
  });
});

describe('countryPayRate (Indeed country selector)', () => {
  const base = { id: 'x', title: 'T', rate_type: 'fixed', rate_min: 5, rate_max: 5, hours_option: '40-50', region: 'latam' };
  it('COP over 1,000/USD rounds to nearest 10,000 with code prefix', () => {
    assert.strictEqual(countryPayRate(base, { currency: 'COP', symbol: null, perUsd: 4012.3 }), 'COP 3,210,000 - COP 4,010,000/month');
  });
  it('MXN rounds to nearest 100', () => {
    assert.strictEqual(countryPayRate(base, { currency: 'MXN', perUsd: 18.37 }), 'MXN 14,700 - MXN 18,400/month');
  });
  it('no hours shows USD hourly', () => {
    assert.strictEqual(countryPayRate({ ...base, hours_option: null }, { currency: 'MXN', perUsd: 18 }), '$5/hour');
  });
  it('Philippines matches the existing peso output regardless of job region', () => {
    assert.strictEqual(countryPayRate(base, { currency: 'PHP', symbol: '₱', perUsd: 56 }), '₱44,800 - ₱56,000/month');
  });
  it('USD - no conversion shows the hourly rate even for Philippines jobs', () => {
    assert.strictEqual(countryPayRate({ ...base, region: 'philippines', rate_type: 'range', rate_max: 6 }, { currency: 'USD', perUsd: 1 }), '$5–$6/hour');
  });
});

describe('Indeed rate disclaimer', () => {
  const j = { id: 'x', title: 'T', rate_type: 'fixed', rate_min: 5, rate_max: 5, hours_option: '40-50', region: 'latam' };
  it('shows under a converted rate', () => {
    const t = buildJobPost('indeed', j, { country: { currency: 'COP', perUsd: 3164 } }).text;
    assert.ok(t.includes('/month\nNote: This estimate uses the exchange rate'));
  });
  it('hidden for USD', () => {
    assert.ok(!buildJobPost('indeed', j, { country: { currency: 'USD', perUsd: 1 } }).text.includes('Note: This estimate'));
  });
});
