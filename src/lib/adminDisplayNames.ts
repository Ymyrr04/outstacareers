// Mapping of admin emails to display names
export const EMAIL_TO_NAME: Record<string, string> = {
  'czarina@outsta.io': 'Czarina',
  'kristine@outsta.io': 'Kristine',
  'eduardo@outsta.io': 'Eduardo',
  'mark@outsta.io': 'Mark',
  'liezl@outsta.io': 'Liezl',
};

// Mapping of admin emails to profile picture paths (relative imports)
export const EMAIL_TO_AVATAR: Record<string, string> = {
  'czarina@outsta.io': '/src/assets/team/cza.png',
  'kristine@outsta.io': '/src/assets/team/kristine.png',
  'eduardo@outsta.io': '/src/assets/team/eduardo.png',
  'mark@outsta.io': '/src/assets/team/mark.png',
  'liezl@outsta.io': '/src/assets/team/liezl-new.png',
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

/**
 * Gets the profile picture URL for an admin email.
 * Returns undefined if no picture is mapped.
 */
export const getAdminAvatar = (email: string | undefined | null): string | undefined => {
  if (!email) return undefined;
  const normalized = email.toLowerCase();
  return EMAIL_TO_AVATAR[normalized];
};
