import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Mic, FileText, Clock, ArrowRight, CheckCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { VoiceQuestionStep } from "./VoiceQuestionStep";
import { TextQuestionStep } from "./TextQuestionStep";
import { WrapUpStep, type WrapUpResponses } from "./WrapUpStep";

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
  /** Admin preview: runs the full flow without writing anything to the database. */
  previewMode?: boolean;
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
  allow_paste?: boolean;
}

interface Answer {
  question_id: string;
  question_text: string;
  question_context: string;
  section: 'voice' | 'text';
  voice_recording_url?: string;
  voice_duration_seconds?: number;
  text_answer?: string;
  paste_detected?: boolean;
  pasted_content?: string | null;
}

type InterviewStep = 'loading' | 'voice' | 'text' | 'wrapup' | 'submitting' | 'complete' | 'no_questions' | 'error';

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
  onBack,
  previewMode = false
}: InterviewSessionProps) {
  const [currentStep, setCurrentStep] = useState<InterviewStep>('loading');
  const [voiceQuestions, setVoiceQuestions] = useState<VoiceQuestion[]>([]);
  const [textQuestions, setTextQuestions] = useState<TextQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [isGenerating, setIsGenerating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noAiMode, setNoAiMode] = useState(false);
  const [noAiReason, setNoAiReason] = useState<string | null>(null);

  // Calculate progress
  const totalQuestions = voiceQuestions.length + textQuestions.length;
  const answeredQuestions = answers.length;
  const progress = totalQuestions > 0 ? (answeredQuestions / totalQuestions) * 100 : 0;

  // Get current section questions
  const getCurrentQuestions = () => {
    if (currentStep === 'voice') return voiceQuestions;
    if (currentStep === 'text') return textQuestions;
    return [];
  };

  const currentQuestions = getCurrentQuestions();
  const currentQuestion = currentQuestions[currentQuestionIndex];

  useEffect(() => {
    loadOrGenerateQuestions();
  }, []);

  const loadOrGenerateQuestions = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      if (previewMode) {
        await generateQuestions();
        return;
      }

      // First, check if questions already exist for this session (resume case)
      const { data: existingQuestions, error: fetchError } = await supabase
        .from('interview_questions')
        .select('*')
        .eq('session_id', sessionId)
        .order('question_order', { ascending: true });

      if (fetchError) {
        console.error('Error fetching existing questions:', fetchError);
      }

      if (existingQuestions && existingQuestions.length > 0) {
        // Questions already exist - load them (filter out any legacy MC questions)
        const voiceQs = existingQuestions
          .filter(q => q.section === 'voice')
          .map(q => ({
            id: q.id,
            question_text: q.question_text,
            question_context: q.question_context || ''
          }));
        const textQs = existingQuestions
          .filter(q => q.section === 'text')
          .map(q => ({
            id: q.id,
            question_text: q.question_text,
            question_context: q.question_context || '',
            allow_paste: (q as any).allow_paste === true
          }));

        setVoiceQuestions(voiceQs);
        setTextQuestions(textQs);

        // Check for existing answers to resume from correct position
        const { data: existingAnswers } = await supabase
          .from('interview_answers')
          .select('question_id')
          .eq('session_id', sessionId);

        const answeredQuestionIds = new Set((existingAnswers || []).map(a => a.question_id));

        // Find first unanswered question
        let startStep: InterviewStep = 'voice';
        let startIndex = 0;

        const unansweredVoice = voiceQs.findIndex(q => !answeredQuestionIds.has(q.id));
        if (unansweredVoice !== -1) {
          startStep = 'voice';
          startIndex = unansweredVoice;
        } else if (voiceQs.length > 0) {
          const unansweredText = textQs.findIndex(q => !answeredQuestionIds.has(q.id));
          if (unansweredText !== -1) {
            startStep = 'text';
            startIndex = unansweredText;
          } else {
            setCurrentStep('complete');
            setIsGenerating(false);
            return;
          }
        } else {
          if (textQs.length > 0) {
            const unansweredText = textQs.findIndex(q => !answeredQuestionIds.has(q.id));
            if (unansweredText !== -1) {
              startStep = 'text';
              startIndex = unansweredText;
            } else {
              setCurrentStep('complete');
              setIsGenerating(false);
              return;
            }
          }
        }

        setCurrentStep(startStep);
        setCurrentQuestionIndex(startIndex);
        setIsGenerating(false);
        return;
      }

      // No existing questions - generate new ones
      await generateQuestions();
    } catch (err) {
      console.error('Error in loadOrGenerateQuestions:', err);
      await generateQuestions();
    }
  };

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
      
      if (data?.no_questions) {
        setError(data.message || 'No interview questions available.');
        setCurrentStep('no_questions');
        return;
      }
      
      if (data?.error) throw new Error(data.error);

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

      setVoiceQuestions(voiceQs);
      setTextQuestions(textQs);

      if (voiceQs.length === 0 && textQs.length === 0) {
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
          question_context: q.question_context ?? null,
          allow_paste: false
        })),
        ...textQs.map((q: TextQuestion, i: number) => ({
          session_id: sessionId,
          section: 'text',
          question_order: i + 1,
          question_text: q.question_text,
          question_context: q.question_context ?? null,
          allow_paste: q.allow_paste === true
        }))
      ];

      if (!previewMode && allQuestionsToInsert.length > 0) {
        const { data: insertedQuestions, error: insertError } = await supabase
          .from('interview_questions')
          .insert(allQuestionsToInsert)
          .select();

        if (insertError) {
          console.error('Failed to save questions:', insertError);

        } else if (insertedQuestions) {
          const voiceDbQuestions = insertedQuestions.filter(q => q.section === 'voice').sort((a, b) => a.question_order - b.question_order);
          const textDbQuestions = insertedQuestions.filter(q => q.section === 'text').sort((a, b) => a.question_order - b.question_order);

          setVoiceQuestions(voiceDbQuestions.map(q => ({
            id: q.id,
            question_text: q.question_text,
            question_context: q.question_context || ''
          })));
          setTextQuestions(textDbQuestions.map(q => ({
            id: q.id,
            question_text: q.question_text,
            question_context: q.question_context || '',
            allow_paste: (q as any).allow_paste === true
          })));
        }
      }

      // Determine first step
      if (voiceQs.length > 0) {
        setCurrentStep('voice');
      } else if (textQs.length > 0) {
        setCurrentStep('text');
      }
      setCurrentQuestionIndex(0);
    } catch (err) {
      console.error('Error generating questions:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate questions';
      setError(errorMessage);
      
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

  const saveAnswerToDb = async (answer: Answer) => {
    if (previewMode) return true;
    try {
      const { error: answerError } = await supabase
        .from('interview_answers')
        .insert({
          session_id: sessionId,
          question_id: answer.question_id,
          voice_recording_url: answer.voice_recording_url || null,
          voice_duration_seconds: answer.voice_duration_seconds || null,
          text_answer: answer.text_answer || null,
          selected_option_id: null,
          paste_detected: answer.paste_detected || false,
          pasted_content: answer.pasted_content || null
        });

      if (answerError) {
        console.error('Failed to save answer to database:', answerError);
        return false;
      }
      console.log('Answer saved successfully:', answer.question_id);
      return true;
    } catch (err) {
      console.error('Error saving answer:', err);
      return false;
    }
  };

  const handleVoiceAnswer = async (recordingUrl: string, durationSeconds: number) => {
    if (!currentQuestion) return;

    const answer: Answer = {
      question_id: currentQuestion.id,
      question_text: currentQuestion.question_text,
      question_context: currentQuestion.question_context,
      section: 'voice',
      voice_recording_url: recordingUrl,
      voice_duration_seconds: durationSeconds
    };

    await saveAnswerToDb(answer);
    setAnswers(prev => [...prev, answer]);
    moveToNextQuestion();
  };

  const handleTextAnswer = async (textAnswer: string, pasteDetected: boolean = false, pastedContent: string | null = null) => {
    if (!currentQuestion) return;

    const answer: Answer = {
      question_id: currentQuestion.id,
      question_text: currentQuestion.question_text,
      question_context: currentQuestion.question_context,
      section: 'text',
      text_answer: textAnswer,
      paste_detected: pasteDetected,
      pasted_content: pastedContent
    };

    await saveAnswerToDb(answer);
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
      } else {
        // All question sections complete — show final wrap-up questions
        setCurrentStep('wrapup');
      }
    }
  };

  const handleWrapUpSubmit = async (responses: WrapUpResponses) => {
    if (previewMode) {
      console.log('[preview] wrap-up responses', responses);
      submitInterview();
      return;
    }
    try {
      await supabase
        .from('interview_sessions')
        .update({ wrapup_responses: responses as any })
        .eq('id', sessionId);
    } catch (e) {
      console.error('Failed to save wrap-up responses', e);
    }
    submitInterview();
  };

  const submitInterview = async () => {
    setCurrentStep('submitting');

    if (previewMode) {
      setTimeout(() => setCurrentStep('complete'), 800);
      return;
    }

    try {
      console.log(`Submitting interview with ${answers.length} answers (already saved to DB)`);


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
    if (currentStep === 'text') return 'Situational Scenario';
    return '';
  };

  const getSectionDescription = () => {
    if (currentStep === 'voice') return 'Answer verbally about your experience. Aim for 60-90 seconds per question.';
    if (currentStep === 'text') {
      const q = textQuestions[currentQuestionIndex] as TextQuestion | undefined;
      return q?.allow_paste
        ? 'Describe how you would handle this workplace scenario. You may type or paste your answer.'
        : 'Describe how you would handle this workplace scenario. Type your answer — pasting is not allowed.';
    }
    return '';
  };

  const getSectionIcon = () => {
    if (currentStep === 'voice') return <Mic className="w-5 h-5" />;
    if (currentStep === 'text') return <FileText className="w-5 h-5" />;
    return null;
  };

  const getEstimatedTime = () => {
    const remainingVoice = currentStep === 'voice' ? voiceQuestions.length - currentQuestionIndex : 0;
    const remainingText = currentStep === 'text' ? textQuestions.length - currentQuestionIndex : (currentStep === 'voice' ? textQuestions.length : 0);
    
    // Voice: ~1.5 min, Text: ~2 min
    const minutes = Math.ceil(remainingVoice * 1.5 + remainingText * 2);
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
            <span>3 Voice</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FileText className="w-4 h-4" />
            <span>1 Written</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Estimated time: 7-10 minutes</p>
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

  if (currentStep === 'wrapup') {
    return <WrapUpStep onSubmit={handleWrapUpSubmit} previewMode={previewMode} />;
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
        <div className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2 text-primary font-medium">
            {getSectionIcon()}
            <span className="text-xl">{getSectionLabel()}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-5 h-5" />
            <span>~{getEstimatedTime()} min left</span>
          </div>
        </div>
        
        {/* Section description */}
        <p className="text-base text-center text-muted-foreground italic">
          {getSectionDescription()}
        </p>
        
        <Progress value={progress} className="h-2" />
        <p className="text-base text-muted-foreground text-center font-medium">
          Question {answeredQuestions + 1} of {totalQuestions}
        </p>
      </div>

      {/* Section Navigation */}
      <div className="flex items-center justify-center gap-2 text-base">
        {voiceQuestions.length > 0 && (
          <>
            <span className={`px-3 py-1.5 rounded ${currentStep === 'voice' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              1. Voice
            </span>
            {textQuestions.length > 0 && <ArrowRight className="w-5 h-5 text-muted-foreground" />}
          </>
        )}
        {textQuestions.length > 0 && (
          <span className={`px-3 py-1.5 rounded ${currentStep === 'text' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {voiceQuestions.length > 0 ? '2' : '1'}. Text
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
            allowPaste={(currentQuestion as TextQuestion).allow_paste === true}
          />
        )}
      </div>
    </div>
  );
}
