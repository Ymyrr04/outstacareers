// Mapping of admin emails to display names
export const EMAIL_TO_NAME: Record<string, string> = {
  'czarina@outsta.io': 'Czarina',
  'kristine@outsta.io': 'Kristine',
  'eduardo@outsta.io': 'Eduardo',
  'mark@outsta.io': 'Mark',
  'liezl@outsta.io': 'Liezl',
  'jil@outsta.io': 'Jil',
  'yes@outsta.io': 'Yes',
  'adam@outsta.io': 'Adam',
};

// Mapping of admin emails to profile picture paths (relative imports)
export const EMAIL_TO_AVATAR: Record<string, string> = {
  'czarina@outsta.io': '/src/assets/team/cza.png',
  'kristine@outsta.io': '/src/assets/team/kristine.png',
  'eduardo@outsta.io': '/src/assets/team/eduardo.png',
  'mark@outsta.io': '/src/assets/team/mark.png',
  'liezl@outsta.io': '/src/assets/team/liezl-new.png',
};

// Mapping of admin user IDs (UUIDs) to emails for lookups
export const USER_ID_TO_EMAIL: Record<string, string> = {
  'b4d7fc55-af59-4b90-a3f7-c0a1a6dc9a65': 'czarina@outsta.io',
  'ffacad3c-d3a7-41a8-a30f-57eeac89c311': 'kristine@outsta.io',
  'b96366f0-e6a5-4529-9d67-bbbefae4357a': 'eduardo@outsta.io',
  '205a92f8-6af7-445b-b452-959199592b81': 'mark@outsta.io',
  'b87e8fe5-492b-4b4a-8b87-bb5f7939cd2f': 'liezl@outsta.io',
  'f2b48ca9-e2e9-4ee3-9f73-fc612ae195c4': 'jil@outsta.io',
  '8d30c059-4263-49af-9e1f-d5645ebc381f': 'yes@outsta.io',
};

/**
 * Resolves a user ID or email to an email address.
 */
const resolveToEmail = (identifier: string | undefined | null): string | null => {
  if (!identifier) return null;
  const normalized = identifier.toLowerCase();
  // Check if it's already an email
  if (normalized.includes('@')) return normalized;
  // Try to resolve UUID to email
  return USER_ID_TO_EMAIL[normalized] || null;
};

/**
 * Converts an admin email or user ID to a display name.
 * Returns the mapped name if available, otherwise extracts the username from email.
 */
export const getAdminDisplayName = (identifier: string | undefined | null, fallback: string = 'Unassigned'): string => {
  const email = resolveToEmail(identifier);
  if (!email) return fallback;
  return EMAIL_TO_NAME[email] || email.split('@')[0];
};

/**
 * Gets the profile picture URL for an admin email or user ID.
 * Returns undefined if no picture is mapped.
 */
export const getAdminAvatar = (identifier: string | undefined | null): string | undefined => {
  const email = resolveToEmail(identifier);
  if (!email) return undefined;
  return EMAIL_TO_AVATAR[email];
};
