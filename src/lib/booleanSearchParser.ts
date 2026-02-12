/**
 * Boolean Search Parser
 * 
 * Parses search queries with Boolean operators (AND, OR, NOT) into
 * structured filter objects for SQL-based filtering via Supabase.
 * 
 * Examples:
 *   "React AND Node" → must contain both "React" and "Node"
 *   "React OR Vue" → must contain either "React" or "Vue"
 *   "React AND NOT Angular" → must contain "React" but not "Angular"
 *   "NOT freelance" → must not contain "freelance"
 *   '"project manager"' → exact phrase match
 *   "React" → simple search (no operators)
 */

export type BooleanClause = {
  type: 'AND' | 'OR' | 'NOT';
  term: string;
};

export interface ParsedBooleanQuery {
  /** Whether the query uses Boolean operators */
  isBoolean: boolean;
  /** For simple (non-boolean) queries, the raw term */
  simpleTerm?: string;
  /** Parsed clauses for Boolean queries */
  clauses: BooleanClause[];
}

/**
 * Tokenize input respecting quoted phrases
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === ' ' && !inQuotes) {
      if (current.trim()) tokens.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) tokens.push(current.trim());
  
  return tokens;
}

/**
 * Remove surrounding quotes from a term
 */
function unquote(term: string): string {
  if (term.startsWith('"') && term.endsWith('"') && term.length > 1) {
    return term.slice(1, -1);
  }
  return term;
}

/**
 * Parse a search string into Boolean clauses
 */
export function parseBooleanSearch(query: string): ParsedBooleanQuery {
  if (!query || !query.trim()) {
    return { isBoolean: false, simpleTerm: '', clauses: [] };
  }

  const trimmed = query.trim();
  const tokens = tokenize(trimmed);
  
  // Check if query contains Boolean operators
  const hasOperators = tokens.some(t => 
    t.toUpperCase() === 'AND' || 
    t.toUpperCase() === 'OR' || 
    t.toUpperCase() === 'NOT'
  );

  if (!hasOperators) {
    return { isBoolean: false, simpleTerm: trimmed, clauses: [] };
  }

  const clauses: BooleanClause[] = [];
  let currentOperator: 'AND' | 'OR' | 'NOT' = 'AND';
  let expectingNot = false;
  let isFirst = true;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const upper = token.toUpperCase();

    if (upper === 'AND') {
      currentOperator = 'AND';
      expectingNot = false;
      continue;
    }
    if (upper === 'OR') {
      currentOperator = 'OR';
      expectingNot = false;
      continue;
    }
    if (upper === 'NOT') {
      expectingNot = true;
      continue;
    }

    // It's a search term
    const term = unquote(token);
    if (!term) continue;

    if (expectingNot) {
      clauses.push({ type: 'NOT', term });
      expectingNot = false;
    } else if (isFirst) {
      // First term is implicitly AND
      clauses.push({ type: 'AND', term });
    } else {
      clauses.push({ type: currentOperator, term });
    }
    
    isFirst = false;
    currentOperator = 'AND'; // Reset to default
  }

  return { isBoolean: clauses.length > 0, clauses };
}

/**
 * The searchable columns for applicant Boolean search
 */
const SEARCH_COLUMNS = ['full_name', 'email', 'job_title', 'phone', 'cv_text', 'location'];

/**
 * Build a Supabase-compatible ilike filter string for a single term across multiple columns
 */
function buildTermFilter(term: string): string {
  return SEARCH_COLUMNS
    .map(col => `${col}.ilike.%${term}%`)
    .join(',');
}

/**
 * Apply parsed Boolean query to a Supabase query builder.
 * 
 * Strategy:
 * - AND terms: each must match in at least one column → chained .or() calls
 * - OR terms: grouped together into one .or() call
 * - NOT terms: each uses .not() for every column (none should match)
 */
export function applyBooleanFilter(
  query: any, // Supabase query builder
  parsed: ParsedBooleanQuery
): any {
  if (!parsed.isBoolean) {
    // Simple search - use original behavior but expanded to more columns
    if (parsed.simpleTerm && parsed.simpleTerm.trim()) {
      const term = parsed.simpleTerm.trim();
      query = query.or(
        `full_name.ilike.%${term}%,email.ilike.%${term}%,job_title.ilike.%${term}%,phone.ilike.%${term}%`
      );
    }
    return query;
  }

  // Group clauses by type
  const andClauses = parsed.clauses.filter(c => c.type === 'AND');
  const orClauses = parsed.clauses.filter(c => c.type === 'OR');
  const notClauses = parsed.clauses.filter(c => c.type === 'NOT');

  // Apply AND clauses - each term must match at least one column
  for (const clause of andClauses) {
    query = query.or(buildTermFilter(clause.term));
  }

  // Apply OR clauses - combine all OR terms into one big .or()
  if (orClauses.length > 0) {
    const orFilters = orClauses
      .map(clause => buildTermFilter(clause.term))
      .join(',');
    query = query.or(orFilters);
  }

  // Apply NOT clauses - for each NOT term, none of the key columns should match
  // We use ilike negation on the most relevant columns
  for (const clause of notClauses) {
    const term = clause.term;
    // Use .not() on key text columns. If any column contains the term, exclude the row.
    // We need to do: NOT (col1 ILIKE term OR col2 ILIKE term OR ...)
    // Supabase approach: chain .not() for an or filter
    query = query.not(
      'full_name', 'ilike', `%${term}%`
    ).not(
      'email', 'ilike', `%${term}%`
    ).not(
      'job_title', 'ilike', `%${term}%`
    ).not(
      'cv_text', 'ilike', `%${term}%`
    );
  }

  return query;
}
