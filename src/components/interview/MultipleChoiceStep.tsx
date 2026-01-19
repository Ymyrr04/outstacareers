import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CheckCircle } from "lucide-react";

interface MultipleChoiceOption {
  id: string;
  label: string;
  value: string;
}

interface MultipleChoiceQuestion {
  id: string;
  question_text: string;
  question_context: string;
  options: MultipleChoiceOption[];
}

interface MultipleChoiceStepProps {
  question: MultipleChoiceQuestion;
  questionNumber: number;
  totalQuestions: number;
  onAnswer: (selectedOptionId: string) => void;
}

export function MultipleChoiceStep({
  question,
  questionNumber,
  totalQuestions,
  onAnswer
}: MultipleChoiceStepProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const handleSubmit = () => {
    if (selectedOption) {
      onAnswer(selectedOption);
      setSelectedOption(null);
    }
  };

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

      {/* Options */}
      <RadioGroup
        value={selectedOption || undefined}
        onValueChange={setSelectedOption}
        className="space-y-3"
      >
        {question.options.map((option) => (
          <div
            key={option.id}
            className={`flex items-start space-x-4 p-5 rounded-lg border-2 transition-all cursor-pointer ${
              selectedOption === option.id
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-muted/50'
            }`}
            onClick={() => setSelectedOption(option.id)}
          >
            <RadioGroupItem 
              value={option.id} 
              id={`option-${option.id}`}
              className="mt-1 h-5 w-5"
            />
            <Label 
              htmlFor={`option-${option.id}`}
              className="flex-1 cursor-pointer font-normal leading-relaxed text-lg"
            >
              <span className="font-semibold text-primary mr-2">
                {option.id.toUpperCase()}.
              </span>
              {option.label}
            </Label>
          </div>
        ))}
      </RadioGroup>

      {/* Submit Button */}
      <Button
        onClick={handleSubmit}
        disabled={!selectedOption}
        className="w-full text-lg py-6"
      >
        <CheckCircle className="w-5 h-5 mr-2" />
        Submit Answer
      </Button>

      {/* Tips */}
      <div className="bg-primary/5 rounded-lg p-4">
        <p className="text-base text-muted-foreground">
          <strong>Note:</strong> There are no right or wrong answers. 
          Choose the option that best reflects how you typically approach 
          work situations. Be honest for the best fit assessment.
        </p>
      </div>
    </div>
  );
}
