import { describe, it as test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { loadTemplateQuestions, questionAnswersHtml, templateQuestions } from './stageNoteTemplates';

describe('reusable note questions', () => {
  test('save keeps questions, never candidate answers', () => {
    deepStrictEqual(templateQuestions([{ question: ' Client experience? ', answer: 'Candidate A has 5 years' }]), ['Client experience?']);
  });
  test('loading a template starts with fresh answers', () => {
    deepStrictEqual(loadTemplateQuestions(['Client experience?']), [{ question: 'Client experience?', answer: '' }]);
  });
  test('answered custom questions save the answer safely', () => {
    ok(questionAnswersHtml([{ question: 'Experience?', answer: '<script> & 5 years' }]).includes('<strong>&lt;script&gt; &amp; 5 years</strong>'));
  });
  test('unanswered questions are marked Not answered', () => {
    ok(questionAnswersHtml([{ question: 'Start date?', answer: '' }]).includes('Start date? — Not answered'));
  });
});