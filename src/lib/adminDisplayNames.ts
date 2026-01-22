// Mapping of admin emails to display names
export const EMAIL_TO_NAME: Record<string, string> = {
  'czarina@outsta.io': 'Czarina',
  'kristine@outsta.io': 'Kristine',
  'eduardo@outsta.io': 'Eduardo',
  'mark@outsta.io': 'Mark',
  'liezl@outsta.io': 'Liezl',
};

/**
 * Converts an admin email to a display name.
 * Returns the mapped name if available, otherwise extracts the username from email.
 */
export const getAdminDisplayName = (email: string | undefined | null, fallback: string = 'Unassigned'): string => {
  if (!email) return fallback;
  const normalized = email.toLowerCase();
  return EMAIL_TO_NAME[normalized] || email.split('@')[0];
};
