/**
 * All user-facing strings (British English). UI components must pull text from
 * here so wording stays consistent and a second locale can slot in later.
 * Never use the em-dash character in these strings.
 */
export const t = {
  appName: 'Meshly',
  tagline: 'Private meetings, peer to peer.',
  heroSub: 'No sign-up. No servers in the middle. Free.',
  scaffoldNotice:
    'Application shell scaffolded. Screens arrive with task T1.1.',
  footer: {
    credit: 'Architected by Faisal Hanif',
    product: 'Free private meetings',
    about: 'About',
    privacy: 'Privacy',
    terms: 'Terms',
  },
} as const;
