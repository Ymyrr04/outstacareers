import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildJobPost } from './jobPostFormats';

const job = {
  id: 'abc-123',
  title: 'Executive Assistant',
  description: '<p>Support our <strong>CEO</strong> daily.</p>',
  responsibilities: ['Manage calendar', 'Handle email', 'Book travel', 'Prepare reports'],
  qualifications: ['2+ years experience'],
  rate: '$5/hr',
  region: 'global',
};
const link = 'https://outstahub.com/jobs/outsta/executive-assistant/abc-123';

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
});
