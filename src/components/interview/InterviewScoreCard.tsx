import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/dateFormat";
import { 
  Briefcase, 
  Code, 
  MessageSquare, 
  Lightbulb, 
  TrendingUp,
  AlertTriangle,
  CheckCircle2
} from "lucide-react";

interface InterviewScoreCardProps {
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

export function InterviewScoreCard({ session }: InterviewScoreCardProps) {
  if (session.status !== 'completed') {
    return (
      <div className="bg-muted/30 rounded-lg p-4 text-center">
        <p className="text-sm text-muted-foreground">
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
  ];

  return (
    <div className="space-y-4">
      {/* Overall Score */}
      <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
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
          Completed: {formatDate(session.completed_at)}
        </p>
      )}
    </div>
  );
}
