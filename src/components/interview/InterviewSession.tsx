import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Mic, FileText, CheckSquare, Clock, ArrowRight, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { VoiceQuestionStep } from "./VoiceQuestionStep";
import { TextQuestionStep } from "./TextQuestionStep";
import { MultipleChoiceStep } from "./MultipleChoiceStep";

interface InterviewSessionProps {
  sessionId: string;
  jobId?: string;
  jobTitle: string;
  jobDescription: string | null;
  qualifications: string[] | null;
  responsibilities: string[] | null;
  cvText: string;
  applicantName: string;
  onComplete: () => void;
  onBack: () => void;
}

interface VoiceQuestion {
  id: string;
  question_text: string;
  question_context: string;
}

interface TextQuestion {
  id: string;
  question_text: string;
  question_context: string;
}

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

interface Answer {
  question_id: string;
  question_text: string;
  question_context: string;
  section: 'voice' | 'text' | 'multiple_choice';
  voice_recording_url?: string;
  voice_duration_seconds?: number;
  text_answer?: string;
  selected_option_id?: string;
  options?: MultipleChoiceOption[];
}

type InterviewStep = 'loading' | 'voice' | 'text' | 'multiple_choice' | 'submitting' | 'complete';

export function InterviewSession({
  sessionId,
  jobId,
  jobTitle,
  jobDescription,
  qualifications,
  responsibilities,
  cvText,
  applicantName,
  onComplete,
  onBack
}: InterviewSessionProps) {
  const [currentStep, setCurrentStep] = useState<InterviewStep>('loading');
  const [voiceQuestions, setVoiceQuestions] = useState<VoiceQuestion[]>([]);
  const [textQuestions, setTextQuestions] = useState<TextQuestion[]>([]);
  const [mcQuestions, setMcQuestions] = useState<MultipleChoiceQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [isGenerating, setIsGenerating] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calculate progress
  const totalQuestions = voiceQuestions.length + textQuestions.length + mcQuestions.length;
  const answeredQuestions = answers.length;
  const progress = totalQuestions > 0 ? (answeredQuestions / totalQuestions) * 100 : 0;

  // Get current section questions
  const getCurrentQuestions = () => {
    if (currentStep === 'voice') return voiceQuestions;
    if (currentStep === 'text') return textQuestions;
    if (currentStep === 'multiple_choice') return mcQuestions;
    return [];
  };

  const currentQuestions = getCurrentQuestions();
  const currentQuestion = currentQuestions[currentQuestionIndex];

  useEffect(() => {
    generateQuestions();
  }, []);

  const generateQuestions = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-interview-questions', {
        body: {
          job_id: jobId,
          job_title: jobTitle,
          job_description: jobDescription,
          qualifications: qualifications,
          responsibilities: responsibilities,
          cv_text: cvText,
          applicant_name: applicantName
        }
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      // Add IDs to questions
      const voiceQs = (data.voice_questions || []).map((q: any, i: number) => ({
        ...q,
        id: `voice-${i}`
      }));
      const textQs = (data.text_questions || []).map((q: any, i: number) => ({
        ...q,
        id: `text-${i}`
      }));
      const mcQs = (data.multiple_choice_questions || []).map((q: any, i: number) => ({
        ...q,
        id: `mc-${i}`
      }));

      setVoiceQuestions(voiceQs);
      setTextQuestions(textQs);
      setMcQuestions(mcQs);

      // Save questions to database and get actual IDs
      const allQuestionsToInsert = [
        ...voiceQs.map((q: VoiceQuestion, i: number) => ({
          session_id: sessionId,
          section: 'voice',
          question_order: i + 1,
          question_text: q.question_text,
          question_context: q.question_context
        })),
        ...textQs.map((q: TextQuestion, i: number) => ({
          session_id: sessionId,
          section: 'text',
          question_order: i + 1,
          question_text: q.question_text,
          question_context: q.question_context
        })),
        ...mcQs.map((q: MultipleChoiceQuestion, i: number) => ({
          session_id: sessionId,
          section: 'multiple_choice',
          question_order: i + 1,
          question_text: q.question_text,
          question_context: q.question_context,
          options: q.options
        }))
      ];

      if (allQuestionsToInsert.length > 0) {
        const { data: insertedQuestions, error: insertError } = await supabase
          .from('interview_questions')
          .insert(allQuestionsToInsert)
          .select();

        if (insertError) {
          console.error('Failed to save questions:', insertError);
        } else if (insertedQuestions) {
          // Update local questions with actual database IDs
          const voiceDbQuestions = insertedQuestions.filter(q => q.section === 'voice').sort((a, b) => a.question_order - b.question_order);
          const textDbQuestions = insertedQuestions.filter(q => q.section === 'text').sort((a, b) => a.question_order - b.question_order);
          const mcDbQuestions = insertedQuestions.filter(q => q.section === 'multiple_choice').sort((a, b) => a.question_order - b.question_order);

          setVoiceQuestions(voiceDbQuestions.map((q, i) => ({
            id: q.id,
            question_text: q.question_text,
            question_context: q.question_context || ''
          })));
          setTextQuestions(textDbQuestions.map((q, i) => ({
            id: q.id,
            question_text: q.question_text,
            question_context: q.question_context || ''
          })));
          setMcQuestions(mcDbQuestions.map((q, i) => ({
            id: q.id,
            question_text: q.question_text,
            question_context: q.question_context || '',
            options: (q.options as unknown as MultipleChoiceOption[]) || []
          })));
        }
      }

      setCurrentStep('voice');
      setCurrentQuestionIndex(0);
    } catch (err) {
      console.error('Error generating questions:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate questions');
      toast({
        title: "Error",
        description: "Failed to generate interview questions. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleVoiceAnswer = (recordingUrl: string, durationSeconds: number) => {
    if (!currentQuestion) return;

    const answer: Answer = {
      question_id: currentQuestion.id,
      question_text: currentQuestion.question_text,
      question_context: currentQuestion.question_context,
      section: 'voice',
      voice_recording_url: recordingUrl,
      voice_duration_seconds: durationSeconds
    };

    setAnswers(prev => [...prev, answer]);
    moveToNextQuestion();
  };

  const handleTextAnswer = (textAnswer: string) => {
    if (!currentQuestion) return;

    const answer: Answer = {
      question_id: currentQuestion.id,
      question_text: currentQuestion.question_text,
      question_context: currentQuestion.question_context,
      section: 'text',
      text_answer: textAnswer
    };

    setAnswers(prev => [...prev, answer]);
    moveToNextQuestion();
  };

  const handleMcAnswer = (selectedOptionId: string) => {
    if (!currentQuestion || !('options' in currentQuestion)) return;

    const answer: Answer = {
      question_id: currentQuestion.id,
      question_text: currentQuestion.question_text,
      question_context: currentQuestion.question_context,
      section: 'multiple_choice',
      selected_option_id: selectedOptionId,
      options: (currentQuestion as MultipleChoiceQuestion).options
    };

    setAnswers(prev => [...prev, answer]);
    moveToNextQuestion();
  };

  const moveToNextQuestion = () => {
    const currentQuestions = getCurrentQuestions();
    
    if (currentQuestionIndex < currentQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      // Move to next section
      if (currentStep === 'voice' && textQuestions.length > 0) {
        setCurrentStep('text');
        setCurrentQuestionIndex(0);
      } else if ((currentStep === 'voice' || currentStep === 'text') && mcQuestions.length > 0) {
        setCurrentStep('multiple_choice');
        setCurrentQuestionIndex(0);
      } else {
        // All sections complete
        submitInterview();
      }
    }
  };

  const submitInterview = async () => {
    setCurrentStep('submitting');

    try {
      // Save answers to database
      for (const answer of answers) {
        const { error: answerError } = await supabase
          .from('interview_answers')
          .insert({
            session_id: sessionId,
            question_id: answer.question_id,
            voice_recording_url: answer.voice_recording_url || null,
            voice_duration_seconds: answer.voice_duration_seconds || null,
            text_answer: answer.text_answer || null,
            selected_option_id: answer.selected_option_id || null
          });

        if (answerError) {
          console.error('Failed to save answer:', answerError);
        }
      }

      // Trigger AI assessment
      const { data, error: assessError } = await supabase.functions.invoke('assess-interview', {
        body: {
          session_id: sessionId,
          job_title: jobTitle,
          job_description: jobDescription,
          qualifications: qualifications,
          responsibilities: responsibilities,
          cv_text: cvText,
          applicant_name: applicantName,
          answers: answers
        }
      });

      if (assessError) throw assessError;
      if (data?.error) throw new Error(data.error);

      setCurrentStep('complete');
      
      setTimeout(() => {
        onComplete();
      }, 2000);
    } catch (err) {
      console.error('Error submitting interview:', err);
      toast({
        title: "Submission Error",
        description: "Failed to submit interview. Please try again.",
        variant: "destructive"
      });
      setCurrentStep('multiple_choice');
    }
  };

  const getSectionLabel = () => {
    if (currentStep === 'voice') return 'Experience & Technical Interview';
    if (currentStep === 'text') return 'Situational Questions';
    if (currentStep === 'multiple_choice') return 'Personality Assessment';
    return '';
  };

  const getSectionIcon = () => {
    if (currentStep === 'voice') return <Mic className="w-5 h-5" />;
    if (currentStep === 'text') return <FileText className="w-5 h-5" />;
    if (currentStep === 'multiple_choice') return <CheckSquare className="w-5 h-5" />;
    return null;
  };

  if (currentStep === 'loading' || isGenerating) {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary mb-4" />
        <h4 className="font-semibold text-lg mb-2">Preparing Your Interview</h4>
        <p className="text-sm text-muted-foreground">
          Generating personalized questions based on your CV and the job requirements...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={generateQuestions}>Try Again</Button>
      </div>
    );
  }

  if (currentStep === 'submitting') {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary mb-4" />
        <h4 className="font-semibold text-lg mb-2">Submitting Your Interview</h4>
        <p className="text-sm text-muted-foreground">
          Please wait while we process your responses...
        </p>
      </div>
    );
  }

  if (currentStep === 'complete') {
    return (
      <div className="text-center py-12">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h4 className="font-semibold text-xl mb-2">Interview Complete!</h4>
        <p className="text-muted-foreground">
          Thank you for completing your interview. We'll review your responses shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-primary font-medium">
            {getSectionIcon()}
            <span>{getSectionLabel()}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>~{Math.ceil((totalQuestions - answeredQuestions) * 1.5)} min left</span>
          </div>
        </div>
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-muted-foreground text-center">
          Question {answeredQuestions + 1} of {totalQuestions}
        </p>
      </div>

      {/* Section Navigation */}
      <div className="flex items-center justify-center gap-2 text-xs">
        <span className={`px-2 py-1 rounded ${currentStep === 'voice' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          1. Voice
        </span>
        <ArrowRight className="w-3 h-3 text-muted-foreground" />
        <span className={`px-2 py-1 rounded ${currentStep === 'text' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          2. Text
        </span>
        <ArrowRight className="w-3 h-3 text-muted-foreground" />
        <span className={`px-2 py-1 rounded ${currentStep === 'multiple_choice' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          3. Personality
        </span>
      </div>

      {/* Current Question */}
      <div className="min-h-[300px]">
        {currentStep === 'voice' && currentQuestion && (
          <VoiceQuestionStep
            question={currentQuestion as VoiceQuestion}
            questionNumber={currentQuestionIndex + 1}
            totalQuestions={voiceQuestions.length}
            onAnswer={handleVoiceAnswer}
          />
        )}

        {currentStep === 'text' && currentQuestion && (
          <TextQuestionStep
            question={currentQuestion as TextQuestion}
            questionNumber={currentQuestionIndex + 1}
            totalQuestions={textQuestions.length}
            onAnswer={handleTextAnswer}
          />
        )}

        {currentStep === 'multiple_choice' && currentQuestion && (
          <MultipleChoiceStep
            question={currentQuestion as MultipleChoiceQuestion}
            questionNumber={currentQuestionIndex + 1}
            totalQuestions={mcQuestions.length}
            onAnswer={handleMcAnswer}
          />
        )}
      </div>
    </div>
  );
}
