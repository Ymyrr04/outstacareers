import { Check, X } from 'lucide-react';

/** Only hard requirements: 1 capital letter + 1 special character. No length limit. */
export const passwordMeetsRequirements = (pw: string) =>
  /[A-Z]/.test(pw) && /[^A-Za-z0-9]/.test(pw);

export const PASSWORD_REQUIREMENTS_MESSAGE = 'Password must include 1 capital letter and 1 special character.';

function scorePassword(pw: string): number {
  if (!pw) return -1;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

const LEVELS = [
  { label: 'Weak', bar: 'bg-destructive', text: 'text-destructive', filled: 1 },
  { label: 'Weak', bar: 'bg-destructive', text: 'text-destructive', filled: 1 },
  { label: 'Fair', bar: 'bg-amber-400', text: 'text-amber-600', filled: 2 },
  { label: 'Good', bar: 'bg-emerald-500', text: 'text-emerald-600', filled: 3 },
  { label: 'Strong', bar: 'bg-emerald-500', text: 'text-emerald-600', filled: 4 },
];

function RequirementItem({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-1.5 text-xs ${met ? 'text-foreground' : 'text-muted-foreground'}`}>
      {met ? (
        <Check className="w-3.5 h-3.5 text-emerald-600" />
      ) : (
        <X className="w-3.5 h-3.5 text-muted-foreground/70" />
      )}
      {children}
    </li>
  );
}

/**
 * Live guidance under the password fields: shows the required character rules
 * (1 capital, 1 special) and a suggested strength meter. Strength is a
 * suggestion only — any length is allowed as long as both rules are met.
 */
export const PasswordGuidance = ({ password }: { password: string }) => {
  const hasUpper = /[A-Z]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const score = scorePassword(password);
  const level = score >= 0 ? LEVELS[score] : null;

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        <RequirementItem met={hasUpper}>At least 1 capital letter (A–Z)</RequirementItem>
        <RequirementItem met={hasSpecial}>At least 1 special character (e.g. ! @ # $ %)</RequirementItem>
        <li className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="w-3.5 h-3.5 text-muted-foreground/50" />
          Any length — longer is stronger
        </li>
      </ul>
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1">
          {[1, 2, 3, 4].map((seg) => (
            <div
              key={seg}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                level && seg <= level.filled ? level.bar : 'bg-muted'
              }`}
            />
          ))}
        </div>
        <span className={`text-xs font-medium w-14 text-right ${level ? level.text : 'text-muted-foreground'}`}>
          {level ? level.label : '—'}
        </span>
      </div>
    </div>
  );
};
