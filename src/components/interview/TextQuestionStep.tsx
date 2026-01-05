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
  onAnswer: (textAnswer: string) => void;
}

export function TextQuestionStep({
  question,
  questionNumber,
  totalQuestions,
  onAnswer
}: TextQuestionStepProps) {
  const [answer, setAnswer] = useState("");

  const handleSubmit = () => {
    if (answer.trim().length >= 50) {
      onAnswer(answer.trim());
      setAnswer("");
    }
  };

  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;
  const minWords = 30;
  const isValid = answer.trim().length >= 50;

  return (
    <div className="space-y-6">
      {/* Question Card */}
      <div className="bg-muted/50 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
            {questionNumber}
          </div>
          <div className="flex-1">
            <p className="text-foreground font-medium text-lg leading-relaxed">
              {question.question_text}
            </p>
            <p className="text-xs text-muted-foreground mt-2 italic">
              Assessing: {question.question_context}
            </p>
          </div>
        </div>
      </div>

      {/* Answer Input */}
      <div className="space-y-3">
        <Textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type your answer here... Be specific and provide examples where possible."
          className="min-h-[180px] resize-none"
        />
        
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className={wordCount >= minWords ? 'text-green-600' : ''}>
            {wordCount} words {wordCount < minWords && `(minimum ${minWords})`}
          </span>
          <span>
            {answer.length} characters
          </span>
        </div>
      </div>

      {/* Submit Button */}
      <Button
        onClick={handleSubmit}
        disabled={!isValid}
        className="w-full"
      >
        <CheckCircle className="w-4 h-4 mr-2" />
        Submit Answer
      </Button>

      {/* Tips */}
      <div className="bg-primary/5 rounded-lg p-4">
        <p className="text-xs text-muted-foreground">
          <strong>Tips:</strong> Structure your answer with: (1) the situation, 
          (2) your actions, and (3) the outcome. Be specific about your role 
          and decisions. Aim for 50-150 words.
        </p>
      </div>
    </div>
  );
}
