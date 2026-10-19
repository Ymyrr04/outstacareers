import { describe, expect, test } from 'bun:test';
import { loadTemplateQuestions, questionAnswersHtml, templateQuestions } from './stageNoteTemplates';

describe('reusable note questions', () => {
  test('save keeps questions, never candidate answers', () => {
    expect(templateQuestions([{ question: ' Client experience? ', answer: 'Candidate A has 5 years' }]))
      .toEqual(['Client experience?']);
  });
  test('loading a template starts with fresh answers', () => {
    expect(loadTemplateQuestions(['Client experience?'])).toEqual([{ question: 'Client experience?', answer: '' }]);
  });
  test('answered custom questions save the answer safely', () => {
    expect(questionAnswersHtml([{ question: 'Experience?', answer: '<script> & 5 years' }]))
      .toContain('<strong>&lt;script&gt; &amp; 5 years</strong>');
  });
  test('unanswered questions are marked Not answered', () => {
    expect(questionAnswersHtml([{ question: 'Start date?', answer: '' }])).toContain('Start date? — Not answered');
  });
});