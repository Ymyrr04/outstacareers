import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Briefcase, 
  Code, 
  MessageSquare, 
  Lightbulb, 
  Users,
  AlertTriangle,
  CheckCircle2,
  Mic,
  FileText,
  ListChecks,
  Loader2,
  PlayCircle
} from 'lucide-react';

interface InterviewQuestion {
  id: string;
  question_text: string;
  question_context: string | null;
  section: string;
  question_order: number;
  options: { id: string; text: string }[] | null;
}

interface InterviewAnswer {
  id: string;
  question_id: string;
  text_answer: string | null;
  voice_recording_url: string | null;
  voice_duration_seconds: number | null;
  selected_option_id: string | null;
  ai_score: number | null;
  ai_feedback: string | null;
  answered_at: string;
}

interface InterviewResultsViewProps {
  sessionId: string;
  session: {
    experience_score: number | null;
    technical_score: number | null;
    communication_score: number | null;
    situational_score: number | null;
    personality_score: number | null;
    overall_score: number | null;
    ai_summary: string | null;
    ai_strengths: string[] | null;
    ai_concerns: string[] | null;
    status: string;
    completed_at: string | null;
  };
}

export function InterviewResultsView({ sessionId, session }: InterviewResultsViewProps) {
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [answers, setAnswers] = useState<InterviewAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // Fetch questions and answers in parallel
      const [questionsRes, answersRes] = await Promise.all([
        supabase
          .from('interview_questions')
          .select('*')
          .eq('session_id', sessionId)
          .order('question_order'),
        supabase
          .from('interview_answers')
          .select('*')
          .eq('session_id', sessionId)
      ]);

      if (questionsRes.data) {
        setQuestions(questionsRes.data.map(q => ({
          ...q,
          options: q.options as { id: string; text: string }[] | null
        })));
      }
      if (answersRes.data) {
        setAnswers(answersRes.data);
      }
      
      setLoading(false);
    };

    fetchData();
  }, [sessionId]);

  if (session.status !== 'completed') {
    return (
      <div className="bg-muted/30 rounded-lg p-6 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-muted-foreground" />
        <p className="text-muted-foreground">
          {session.status === 'in_progress' 
            ? 'Interview in progress...' 
            : 'Interview not completed'}
        </p>
      </div>
    );
  }

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-muted-foreground';
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBg = (score: number | null) => {
    if (score === null) return 'bg-muted';
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const scoreItems = [
    { label: 'Experience', score: session.experience_score, icon: Briefcase },
    { label: 'Technical', score: session.technical_score, icon: Code },
    { label: 'Communication', score: session.communication_score, icon: MessageSquare },
    { label: 'Situational', score: session.situational_score, icon: Lightbulb },
    { label: 'Personality', score: session.personality_score, icon: Users },
  ];

  const getAnswerForQuestion = (questionId: string) => {
    return answers.find(a => a.question_id === questionId);
  };

  const getSectionLabel = (section: string) => {
    switch (section) {
      case 'experience': return 'Experience & Technical';
      case 'situational': return 'Situational';
      case 'personality': return 'Personality';
      default: return section;
    }
  };

  const getSectionIcon = (section: string) => {
    switch (section) {
      case 'experience': return <Mic className="w-4 h-4" />;
      case 'situational': return <FileText className="w-4 h-4" />;
      case 'personality': return <ListChecks className="w-4 h-4" />;
      default: return null;
    }
  };

  const experienceQuestions = questions.filter(q => q.section === 'experience');
  const situationalQuestions = questions.filter(q => q.section === 'situational');
  const personalityQuestions = questions.filter(q => q.section === 'personality');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="experience" className="flex items-center gap-1">
            <Mic className="w-3 h-3" />
            Voice
          </TabsTrigger>
          <TabsTrigger value="situational" className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            Text
          </TabsTrigger>
          <TabsTrigger value="personality" className="flex items-center gap-1">
            <ListChecks className="w-3 h-3" />
            MCQ
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Overall Score */}
          <div className="flex items-center justify-between p-4 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
            <div>
              <p className="text-sm text-muted-foreground">Overall Interview Score</p>
              <p className={`text-3xl font-bold ${getScoreColor(session.overall_score)}`}>
                {session.overall_score ?? '—'}/100
              </p>
            </div>
            <div className="w-20 h-20 relative">
              <svg className="w-20 h-20 transform -rotate-90">
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  className="text-muted"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={`${(session.overall_score ?? 0) * 2.26} 226`}
                  className={getScoreColor(session.overall_score)}
                />
              </svg>
              <span className={`absolute inset-0 flex items-center justify-center text-lg font-bold ${getScoreColor(session.overall_score)}`}>
                {session.overall_score ?? '—'}
              </span>
            </div>
          </div>

          {/* Individual Scores */}
          <div className="grid grid-cols-1 gap-3">
            {scoreItems.map(({ label, score, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3">
                <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm w-28">{label}</span>
                <div className="flex-1">
                  <Progress 
                    value={score ?? 0} 
                    className="h-2"
                  />
                </div>
                <span className={`text-sm font-medium w-10 text-right ${getScoreColor(score)}`}>
                  {score ?? '—'}
                </span>
              </div>
            ))}
          </div>

          {/* AI Summary */}
          {session.ai_summary && (
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">AI Summary</p>
              <p className="text-sm text-muted-foreground">{session.ai_summary}</p>
            </div>
          )}

          {/* Strengths & Concerns */}
          <div className="grid grid-cols-2 gap-4 border-t pt-4">
            {session.ai_strengths && session.ai_strengths.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  Strengths
                </p>
                <ul className="text-xs space-y-1">
                  {session.ai_strengths.map((strength, i) => (
                    <li key={i} className="text-muted-foreground">• {strength}</li>
                  ))}
                </ul>
              </div>
            )}
            {session.ai_concerns && session.ai_concerns.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                  Concerns
                </p>
                <ul className="text-xs space-y-1">
                  {session.ai_concerns.map((concern, i) => (
                    <li key={i} className="text-muted-foreground">• {concern}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Completed At */}
          {session.completed_at && (
            <p className="text-xs text-muted-foreground text-right">
              Completed: {new Date(session.completed_at).toLocaleDateString()}
            </p>
          )}
        </TabsContent>

        {/* Experience/Voice Tab */}
        <TabsContent value="experience" className="space-y-4 mt-4">
          <div className="flex items-center gap-2 mb-4">
            <Mic className="w-5 h-5 text-purple-600" />
            <h4 className="font-semibold">Experience & Technical (Voice Answers)</h4>
            <Badge variant="outline">{experienceQuestions.length} questions</Badge>
          </div>
          
          {experienceQuestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No voice questions recorded.</p>
          ) : (
            <div className="space-y-4">
              {experienceQuestions.map((question, idx) => {
                const answer = getAnswerForQuestion(question.id);
                return (
                  <div key={question.id} className="p-4 bg-muted/30 rounded-lg border">
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 flex items-center justify-center text-xs font-medium">
                        {idx + 1}
                      </span>
                      <div className="flex-1 space-y-3">
                        <p className="text-sm font-medium">{question.question_text}</p>
                        {question.question_context && (
                          <p className="text-xs text-muted-foreground italic">{question.question_context}</p>
                        )}
                        
                        {answer?.voice_recording_url ? (
                          <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
                            <PlayCircle className="w-5 h-5 text-purple-600" />
                            <audio controls className="flex-1 h-10" src={answer.voice_recording_url}>
                              Your browser does not support audio.
                            </audio>
                            {answer.voice_duration_seconds && (
                              <span className="text-xs text-muted-foreground">
                                {Math.floor(answer.voice_duration_seconds / 60)}:{String(answer.voice_duration_seconds % 60).padStart(2, '0')}
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">No recording available</p>
                        )}

                        {answer?.ai_feedback && (
                          <div className="text-xs bg-purple-50 dark:bg-purple-950/30 p-2 rounded">
                            <span className="font-medium">AI Feedback:</span> {answer.ai_feedback}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Situational/Text Tab */}
        <TabsContent value="situational" className="space-y-4 mt-4">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-blue-600" />
            <h4 className="font-semibold">Situational Questions (Text Answers)</h4>
            <Badge variant="outline">{situationalQuestions.length} questions</Badge>
          </div>
          
          {situationalQuestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No situational questions recorded.</p>
          ) : (
            <div className="space-y-4">
              {situationalQuestions.map((question, idx) => {
                const answer = getAnswerForQuestion(question.id);
                return (
                  <div key={question.id} className="p-4 bg-muted/30 rounded-lg border">
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-medium">
                        {idx + 1}
                      </span>
                      <div className="flex-1 space-y-3">
                        <p className="text-sm font-medium">{question.question_text}</p>
                        {question.question_context && (
                          <p className="text-xs text-muted-foreground italic">{question.question_context}</p>
                        )}
                        
                        {answer?.text_answer ? (
                          <div className="p-3 bg-background rounded-lg">
                            <p className="text-sm whitespace-pre-wrap">{answer.text_answer}</p>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">No answer provided</p>
                        )}

                        {answer?.ai_feedback && (
                          <div className="text-xs bg-blue-50 dark:bg-blue-950/30 p-2 rounded">
                            <span className="font-medium">AI Feedback:</span> {answer.ai_feedback}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Personality/MCQ Tab */}
        <TabsContent value="personality" className="space-y-4 mt-4">
          <div className="flex items-center gap-2 mb-4">
            <ListChecks className="w-5 h-5 text-green-600" />
            <h4 className="font-semibold">Personality & Interpersonal (Multiple Choice)</h4>
            <Badge variant="outline">{personalityQuestions.length} questions</Badge>
          </div>
          
          {personalityQuestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No personality questions recorded.</p>
          ) : (
            <div className="space-y-4">
              {personalityQuestions.map((question, idx) => {
                const answer = getAnswerForQuestion(question.id);
                const selectedOption = question.options?.find(o => o.id === answer?.selected_option_id);
                
                return (
                  <div key={question.id} className="p-4 bg-muted/30 rounded-lg border">
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 flex items-center justify-center text-xs font-medium">
                        {idx + 1}
                      </span>
                      <div className="flex-1 space-y-3">
                        <p className="text-sm font-medium">{question.question_text}</p>
                        
                        <div className="space-y-2">
                          {question.options?.map((option) => (
                            <div 
                              key={option.id}
                              className={`p-2 rounded text-sm ${
                                option.id === answer?.selected_option_id
                                  ? 'bg-green-100 dark:bg-green-900/50 border border-green-300 dark:border-green-700'
                                  : 'bg-background'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {option.id === answer?.selected_option_id && (
                                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                                )}
                                <span>{option.text}</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {!selectedOption && (
                          <p className="text-xs text-muted-foreground italic">No answer selected</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
