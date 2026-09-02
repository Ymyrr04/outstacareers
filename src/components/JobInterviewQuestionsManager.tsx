import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Plus, X, Mic, FileText, Sparkles, Loader2, GripVertical } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CustomQuestion {
  id?: string;
  question_text: string;
  question_context: string;
  question_type: 'voice' | 'text';
  question_order: number;
  allow_paste?: boolean;
}

interface JobInterviewQuestionsManagerProps {
  jobId?: string; // undefined for new jobs, provided for existing jobs
  jobTitle: string;
  jobDescription: string;
  qualifications: string[];
  responsibilities: string[];
  onQuestionsChange?: (questions: CustomQuestion[]) => void;
  initialQuestions?: CustomQuestion[];
}

const JobInterviewQuestionsManager = ({
  jobId,
  jobTitle,
  jobDescription,
  qualifications,
  responsibilities,
  onQuestionsChange,
  initialQuestions = []
}: JobInterviewQuestionsManagerProps) => {
  const [questions, setQuestions] = useState<CustomQuestion[]>(initialQuestions);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Fetch existing questions when jobId changes
  useEffect(() => {
    if (jobId) {
      fetchExistingQuestions();
    }
  }, [jobId]);

  // Notify parent of changes
  useEffect(() => {
    onQuestionsChange?.(questions);
  }, [questions, onQuestionsChange]);

  const fetchExistingQuestions = async () => {
    if (!jobId) return;

    const { data, error } = await supabase
      .from('job_interview_questions')
      .select('*')
      .eq('job_id', jobId)
      .order('question_order');

    if (error) {
      console.error('Error fetching questions:', error);
      return;
    }

    if (data) {
      setQuestions(data.map(q => ({
        id: q.id,
        question_text: q.question_text,
        question_context: q.question_context || '',
        question_type: q.question_type as 'voice' | 'text',
        question_order: q.question_order,
        allow_paste: (q as any).allow_paste || false
      })));
    }
  };

  const addQuestion = (type: 'voice' | 'text') => {
    const newQuestion: CustomQuestion = {
      question_text: '',
      question_context: '',
      question_type: type,
      question_order: questions.length
    };
    setQuestions([...questions, newQuestion]);
  };

  const updateQuestion = (index: number, updates: Partial<CustomQuestion>) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], ...updates };
    setQuestions(newQuestions);
  };

  const removeQuestion = (index: number) => {
    const newQuestions = questions.filter((_, i) => i !== index);
    // Re-order remaining questions
    setQuestions(newQuestions.map((q, i) => ({ ...q, question_order: i })));
  };

  const generateAIQuestions = async () => {
    if (!jobTitle) {
      toast({
        title: 'Missing Information',
        description: 'Please enter a job title first.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-interview-questions', {
        body: {
          job_title: jobTitle,
          job_description: jobDescription,
          qualifications: qualifications.filter(q => q.trim()),
          responsibilities: responsibilities.filter(r => r.trim()),
          cv_text: 'Generic candidate for question template generation',
          applicant_name: 'Candidate'
        }
      });

      if (error) throw error;

      const generatedQuestions: CustomQuestion[] = [];
      let order = 0;

      // Add voice questions
      if (data.voice_questions) {
        data.voice_questions.slice(0, 3).forEach((q: any) => {
          generatedQuestions.push({
            question_text: q.question_text,
            question_context: q.question_context || '',
            question_type: 'voice',
            question_order: order++
          });
        });
      }

      // Add text questions
      if (data.text_questions) {
        data.text_questions.slice(0, 3).forEach((q: any) => {
          generatedQuestions.push({
            question_text: q.question_text,
            question_context: q.question_context || '',
            question_type: 'text',
            question_order: order++
          });
        });
      }

      setQuestions(generatedQuestions);
      toast({
        title: 'Questions Generated',
        description: `Generated ${generatedQuestions.length} interview questions. You can edit or remove them.`,
      });
    } catch (error) {
      console.error('Error generating questions:', error);
      toast({
        title: 'Generation Failed',
        description: 'Failed to generate questions. Please try again or add manually.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const saveQuestions = async () => {
    if (!jobId) {
      toast({
        title: 'Save Later',
        description: 'Questions will be saved when the job is created.',
      });
      return;
    }

    setIsSaving(true);

    try {
      // Delete existing questions for this job
      await supabase
        .from('job_interview_questions')
        .delete()
        .eq('job_id', jobId);

      // Insert new questions
      if (questions.length > 0) {
        const questionsToInsert = questions
          .filter(q => q.question_text.trim())
          .map((q, index) => ({
            job_id: jobId,
            question_text: q.question_text,
            question_context: q.question_context || null,
            question_type: q.question_type,
            question_order: index,
            allow_paste: q.question_type === 'text' ? (q.allow_paste || false) : false
          }));

        if (questionsToInsert.length > 0) {
          const { error } = await supabase
            .from('job_interview_questions')
            .insert(questionsToInsert);

          if (error) throw error;
        }
      }

      toast({
        title: 'Questions Saved',
        description: `${questions.filter(q => q.question_text.trim()).length} questions saved.`,
      });
    } catch (error) {
      console.error('Error saving questions:', error);
      toast({
        title: 'Save Failed',
        description: 'Failed to save questions. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const voiceQuestions = questions.filter(q => q.question_type === 'voice');
  const textQuestions = questions.filter(q => q.question_type === 'text');

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="questions" className="border rounded-lg">
        <AccordionTrigger className="px-4 py-3 hover:no-underline">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="font-medium">Custom Interview Questions</span>
            {questions.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {questions.length} questions
              </Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add custom questions that will be used for this role's interview. If no custom questions are added, AI will generate questions based on the job description and each applicant's CV.
            </p>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addQuestion('voice')}
              >
                <Mic className="w-4 h-4 mr-1" />
                Add Voice Question
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addQuestion('text')}
              >
                <FileText className="w-4 h-4 mr-1" />
                Add Text Question
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={generateAIQuestions}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-1" />
                )}
                Generate with AI
              </Button>
            </div>

            {/* Questions list */}
            {questions.length > 0 && (
              <div className="space-y-4">
                {/* Voice Questions */}
                {voiceQuestions.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Mic className="w-4 h-4 text-orange-500" />
                      <Label className="text-sm font-medium">Voice Questions ({voiceQuestions.length})</Label>
                    </div>
                    {questions.map((q, index) => {
                      if (q.question_type !== 'voice') return null;
                      return (
                        <Card key={index} className="border-orange-200/50">
                          <CardContent className="py-3 space-y-2">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 space-y-2">
                                <Textarea
                                  value={q.question_text}
                                  onChange={(e) => updateQuestion(index, { question_text: e.target.value })}
                                  placeholder="Enter your voice interview question..."
                                  rows={2}
                                  className="text-sm"
                                />
                                <Input
                                  value={q.question_context}
                                  onChange={(e) => updateQuestion(index, { question_context: e.target.value })}
                                  placeholder="Context: What skill/trait does this assess? (optional)"
                                  className="text-sm"
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeQuestion(index)}
                                className="px-2 text-muted-foreground hover:text-destructive"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {/* Text Questions */}
                {textQuestions.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" />
                      <Label className="text-sm font-medium">Text Questions ({textQuestions.length})</Label>
                    </div>
                    {questions.map((q, index) => {
                      if (q.question_type !== 'text') return null;
                      return (
                        <Card key={index} className="border-blue-200/50">
                          <CardContent className="py-3 space-y-2">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 space-y-2">
                                <Textarea
                                  value={q.question_text}
                                  onChange={(e) => updateQuestion(index, { question_text: e.target.value })}
                                  placeholder="Enter your situational/text interview question..."
                                  rows={2}
                                  className="text-sm"
                                />
                                <Input
                                  value={q.question_context}
                                  onChange={(e) => updateQuestion(index, { question_context: e.target.value })}
                                  placeholder="Context: What skill/trait does this assess? (optional)"
                                  className="text-sm"
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeQuestion(index)}
                                className="px-2 text-muted-foreground hover:text-destructive"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {questions.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No custom questions added. AI will generate personalized questions for each applicant.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Save button for existing jobs */}
            {jobId && questions.length > 0 && (
              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={saveQuestions}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : null}
                  Save Questions
                </Button>
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default JobInterviewQuestionsManager;