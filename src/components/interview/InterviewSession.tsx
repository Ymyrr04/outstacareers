import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Mic, FileText, CheckSquare, Clock, ArrowRight, CheckCircle, AlertTriangle } from "lucide-react";
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

type InterviewStep = 'loading' | 'voice' | 'text' | 'multiple_choice' | 'submitting' | 'complete' | 'no_questions' | 'error';

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
  const [noAiMode, setNoAiMode] = useState(false);
  const [noAiReason, setNoAiReason] = useState<string | null>(null);

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
      
      // Handle case where no questions are available
      if (data?.no_questions) {
        setError(data.message || 'No interview questions available.');
        setCurrentStep('no_questions');
        return;
      }
      
      if (data?.error) throw new Error(data.error);

      // Check if we're in no-AI mode
      if (data?.no_ai_mode) {
        setNoAiMode(true);
        setNoAiReason(data.no_ai_reason || 'AI not available');
        toast({
          title: "Manual Interview Mode",
          description: "AI scoring is unavailable. Your responses will be reviewed manually by our team.",
        });
      }

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

      // Check if we have any questions at all
      if (voiceQs.length === 0 && textQs.length === 0 && mcQs.length === 0) {
        setError('No interview questions available for this position.');
        setCurrentStep('no_questions');
        return;
      }

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

      // Determine first step based on available questions
      if (voiceQs.length > 0) {
        setCurrentStep('voice');
      } else if (textQs.length > 0) {
        setCurrentStep('text');
      } else if (mcQs.length > 0) {
        setCurrentStep('multiple_choice');
      }
      setCurrentQuestionIndex(0);
    } catch (err) {
      console.error('Error generating questions:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate questions';
      setError(errorMessage);
      
      // Check if it's a credit-related error
      if (errorMessage.includes('credit') || errorMessage.includes('rate limit')) {
        toast({
          title: "Interview Unavailable",
          description: "Please contact support or try again later.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to start interview. Please try again.",
          variant: "destructive"
        });
      }
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

      // Trigger AI assessment (or skip if in no-AI mode)
      const { data, error: assessError } = await supabase.functions.invoke('assess-interview', {
        body: {
          session_id: sessionId,
          job_title: jobTitle,
          job_description: jobDescription,
          qualifications: qualifications,
          responsibilities: responsibilities,
          cv_text: cvText,
          applicant_name: applicantName,
          answers: answers,
          skip_ai_assessment: noAiMode
        }
      });

      if (assessError) throw assessError;
      
      // Handle manual review mode
      if (data?.manual_review) {
        console.log('Interview completed in manual review mode');
      }
      
      if (data?.error && !data?.manual_review) throw new Error(data.error);

      setCurrentStep('complete');
      
      setTimeout(() => {
        onComplete();
      }, 2000);
    } catch (err) {
      console.error('Error submitting interview:', err);
      
      // Even if AI assessment fails, the answers are saved, so complete the interview
      toast({
        title: "Interview Submitted",
        description: "Your responses have been saved. Our team will review them manually.",
      });
      
      setCurrentStep('complete');
      setTimeout(() => {
        onComplete();
      }, 2000);
    }
  };

  const getSectionLabel = () => {
    if (currentStep === 'voice') return 'Experience & Technical';
    if (currentStep === 'text') return 'Situational Scenarios';
    if (currentStep === 'multiple_choice') return 'Work Style Assessment';
    return '';
  };

  const getSectionDescription = () => {
    if (currentStep === 'voice') return 'Answer verbally about your experience. Aim for 60-90 seconds per question.';
    if (currentStep === 'text') return 'Describe how you would handle these workplace scenarios.';
    if (currentStep === 'multiple_choice') return 'Select the option that best describes your approach.';
    return '';
  };

  const getSectionIcon = () => {
    if (currentStep === 'voice') return <Mic className="w-5 h-5" />;
    if (currentStep === 'text') return <FileText className="w-5 h-5" />;
    if (currentStep === 'multiple_choice') return <CheckSquare className="w-5 h-5" />;
    return null;
  };

  const getEstimatedTime = () => {
    const remainingVoice = currentStep === 'voice' ? voiceQuestions.length - currentQuestionIndex : 0;
    const remainingText = currentStep === 'text' ? textQuestions.length - currentQuestionIndex : (currentStep === 'voice' ? textQuestions.length : 0);
    const remainingMc = currentStep === 'multiple_choice' ? mcQuestions.length - currentQuestionIndex : (currentStep !== 'complete' ? mcQuestions.length : 0);
    
    // Voice: ~1.5 min, Text: ~2 min, MC: ~0.5 min
    const minutes = Math.ceil(remainingVoice * 1.5 + remainingText * 2 + remainingMc * 0.5);
    return minutes;
  };

  if (currentStep === 'loading' || isGenerating) {
    return (
      <div className="text-center py-12 space-y-4">
        <div className="relative mx-auto w-16 h-16">
          <Loader2 className="w-16 h-16 animate-spin text-primary" />
        </div>
        <div>
          <h4 className="font-semibold text-lg mb-2">Preparing Your Interview</h4>
          <p className="text-sm text-muted-foreground">
            Generating personalized questions based on your profile...
          </p>
        </div>
        <div className="flex items-center justify-center gap-6 pt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Mic className="w-4 h-4" />
            <span>5 Voice</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FileText className="w-4 h-4" />
            <span>5 Written</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckSquare className="w-4 h-4" />
            <span>5 Choice</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Estimated time: 15-20 minutes</p>
      </div>
    );
  }

  if (currentStep === 'no_questions') {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 mx-auto text-amber-500 mb-4" />
        <h4 className="font-semibold text-lg mb-2">Interview Unavailable</h4>
        <p className="text-muted-foreground mb-4">
          {error || 'No interview questions are currently available for this position.'}
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          Your application has been submitted. Our recruitment team will contact you directly.
        </p>
        <Button onClick={onComplete}>Continue</Button>
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
          Please wait while we save your responses...
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
          Thank you for completing your interview. We'll review your responses and get back to you soon.
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
            <span>~{getEstimatedTime()} min left</span>
          </div>
        </div>
        
        {/* Section description */}
        <p className="text-xs text-center text-muted-foreground italic">
          {getSectionDescription()}
        </p>
        
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-muted-foreground text-center font-medium">
          Question {answeredQuestions + 1} of {totalQuestions}
        </p>
      </div>

      {/* Section Navigation */}
      <div className="flex items-center justify-center gap-2 text-xs">
        {voiceQuestions.length > 0 && (
          <>
            <span className={`px-2 py-1 rounded ${currentStep === 'voice' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              1. Voice
            </span>
            {(textQuestions.length > 0 || mcQuestions.length > 0) && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
          </>
        )}
        {textQuestions.length > 0 && (
          <>
            <span className={`px-2 py-1 rounded ${currentStep === 'text' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {voiceQuestions.length > 0 ? '2' : '1'}. Text
            </span>
            {mcQuestions.length > 0 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
          </>
        )}
        {mcQuestions.length > 0 && (
          <span className={`px-2 py-1 rounded ${currentStep === 'multiple_choice' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {voiceQuestions.length > 0 && textQuestions.length > 0 ? '3' : voiceQuestions.length > 0 || textQuestions.length > 0 ? '2' : '1'}. Personality
          </span>
        )}
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
