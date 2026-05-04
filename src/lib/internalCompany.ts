// OutSta is the internal company. Contractors assigned to this client are
// the internal team and should be excluded from external contractor counts
// and client analytics.
export const INTERNAL_CLIENT_ID = 'baadbf53-0ca9-4abb-9af1-28f41f415bf1';

export const isInternalContractor = (c: { client_id?: string | null } | null | undefined): boolean =>
  !!c && c.client_id === INTERNAL_CLIENT_ID;
