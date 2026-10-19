export interface TemplateQuestion {
  question: string;
  answer: string;
}

export function templateQuestions(questions: TemplateQuestion[]): string[] {
  return questions.map(({ question }) => question.trim()).filter(Boolean);
}

export function loadTemplateQuestions(questions: string[]): TemplateQuestion[] {
  return questions.map(question => ({ question, answer: '' }));
}

export function questionAnswersHtml(questions: TemplateQuestion[]): string {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br />');
  const items = questions.filter(({ question }) => question.trim()).map(({ question, answer }) =>
    `<li>${escape(question.trim())} — ${answer.trim() ? `<strong>${escape(answer.trim())}</strong>` : 'Not answered'}</li>`);
  return items.length ? `<p><strong>Screening questions</strong></p><ul>${items.join('')}</ul>` : '';
}