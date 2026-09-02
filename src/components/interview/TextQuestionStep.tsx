import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle } from "lucide-react";

interface TextQuestion {
  id: string;
  question_text: string;
  question_context: string;
}

interface TextQuestionStepProps {
  question: TextQuestion;
  questionNumber: number;
  totalQuestions: number;
  onAnswer: (textAnswer: string, pasteDetected: boolean, pastedContent: string | null) => void;
  allowPaste?: boolean;
}

export function TextQuestionStep({
  question,
  questionNumber,
  totalQuestions,
  onAnswer,
  allowPaste = false
}: TextQuestionStepProps) {
  const [answer, setAnswer] = useState("");
  const [pasteDetected, setPasteDetected] = useState(false);
  const [pastedContent, setPastedContent] = useState<string | null>(null);
  const [pasteAttempts, setPasteAttempts] = useState(0);

  const handleSubmit = () => {
    if (answer.trim().length >= 50) {
      onAnswer(answer.trim(), pasteDetected, pastedContent);
      setAnswer("");
      setPasteDetected(false);
      setPastedContent(null);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (allowPaste) return; // pasting allowed — let it through unflagged
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    if (text) {
      setPasteDetected(true);
      setPastedContent(prev => prev ? `${prev}\n---\n${text}` : text);
      setPasteAttempts(prev => prev + 1);
    }
  };

  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;
  const minWords = 30;
  const isValid = answer.trim().length >= 50;

  return (
    <div className="space-y-6">
      {/* Question Card */}
      <div className="bg-muted/50 rounded-lg p-6">
        <div className="flex items-start gap-5">
          <div className="flex-shrink-0 w-14 h-14 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-2xl shadow-md">
            {questionNumber}
          </div>
          <div className="flex-1 select-none" onCopy={(e) => e.preventDefault()}>
            <p className="text-foreground font-medium text-2xl leading-relaxed pointer-events-none">
              {question.question_text}
            </p>
          </div>
        </div>
      </div>

      {/* Answer Input */}
      <div className="space-y-3">
        <Textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onPaste={handlePaste}
          placeholder="Type your answer here... Be specific and provide examples where possible."
          className="min-h-[200px] resize-none text-xl leading-relaxed p-4"
        />
        
        <div className="flex items-center justify-between text-base text-muted-foreground">
          <span className={wordCount >= minWords ? 'text-green-600' : ''}>
            {wordCount} words {wordCount < minWords && `(minimum ${minWords})`}
          </span>
          <span>
            {answer.length} characters
          </span>
        </div>

        {pasteAttempts > 0 && (
          <p className="text-sm text-destructive font-medium">
            ⚠️ Pasting is not allowed. Please type your answer. ({pasteAttempts} attempt{pasteAttempts > 1 ? 's' : ''} detected)
          </p>
        )}
      </div>

      {/* Submit Button */}
      <Button
        onClick={handleSubmit}
        disabled={!isValid}
        className="w-full text-lg py-6"
      >
        <CheckCircle className="w-5 h-5 mr-2" />
        Submit Answer
      </Button>

      {/* Tips */}
      <div className="bg-primary/5 rounded-lg p-4">
        <p className="text-base text-muted-foreground">
          <strong>Tips:</strong> Structure your answer with: (1) the situation, 
          (2) your actions, and (3) the outcome. Be specific about your role 
          and decisions. Aim for 50-150 words.
        </p>
      </div>
    </div>
  );
}
