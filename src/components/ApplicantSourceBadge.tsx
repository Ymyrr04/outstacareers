import { Badge } from '@/components/ui/badge';
import { Radio } from 'lucide-react';

interface ApplicantSourceBadgeProps {
  source: string | null;
}

const sourceColors: Record<string, string> = {
  'onlinejobs.ph': 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  'linkedin': 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  'indeed': 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  'facebook': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  'threads': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'referral': 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  'company_website': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
  'other': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const sourceLabels: Record<string, string> = {
  'onlinejobs.ph': 'OnlineJobs.ph',
  'linkedin': 'LinkedIn',
  'indeed': 'Indeed',
  'facebook': 'Facebook',
  'referral': 'Referral',
  'company_website': 'Company Website',
  'other': 'Other',
};

export function ApplicantSourceBadge({ source }: ApplicantSourceBadgeProps) {
  if (!source) return null;

  // Check if source is a custom "Other" value (format: "Other: custom text")
  const isCustomOther = source.startsWith('Other:');
  const normalizedSource = source.toLowerCase().replace(/[.\s]/g, '_');
  
  const colorClass = isCustomOther 
    ? sourceColors.other 
    : (sourceColors[normalizedSource] || sourceColors.other);
  
  // For custom other sources, show the custom text; otherwise use label mapping
  const label = isCustomOther 
    ? source.replace('Other: ', '')
    : (sourceLabels[normalizedSource] || source);

  return (
    <Badge variant="outline" className={`${colorClass} border-0`}>
      <Radio className="w-3 h-3 mr-1" />
      {label}
    </Badge>
  );
}
