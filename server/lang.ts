import type { Request } from 'express';

export type Lang = 'en' | 'es';
export const isLang = (value: unknown): value is Lang => value === 'en' || value === 'es';

// The web app sends the language chosen in its selector as Accept-Language; without one, English.
export const langOf = (req: Request): Lang =>
  req.get('accept-language')?.trim().toLowerCase().startsWith('es') ? 'es' : 'en';
