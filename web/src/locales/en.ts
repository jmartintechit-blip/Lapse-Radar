// English is the source of truth: es.ts must provide every key with the same shape (checked by tsc).
// Plain strings, or functions when the text holds a value. Server messages are matched by their English text.
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const en = {
  // shell
  language: 'Language',
  useTheme: (next: 'light' | 'dark') => `Use ${next} theme`,
  loading: 'Loading…',
  privacy: 'Privacy',
  backHome: 'Back to home',
  notFound: 'Page not found',
  titles: {
    '/': 'Lapse Radar: know what expires before it breaks',
    '/login': 'Sign in · Lapse Radar',
    '/signup': 'Create account · Lapse Radar',
    '/dashboard': 'Dashboard · Lapse Radar',
    '/privacy': 'Privacy · Lapse Radar',
    '/forgot-password': 'Forgot password · Lapse Radar',
    '/reset-password': 'Reset password · Lapse Radar',
    '/confirm': 'Confirm email · Lapse Radar',
    notFound: 'Page not found · Lapse Radar',
  },
  offline: 'Cannot reach the server, check your connection',
  generic: 'Something went wrong, try again',
  serverMessages: {} as Record<string, string>,

  // home
  heroLine1: 'Know what expires',
  heroLine2: 'before it breaks.',
  lead: 'One panel for TLS certificates, domains and tokens. Days left at a glance, automatic checks, and one alert per threshold, never a flood.',
  account: 'Account',
  goDashboard: 'Go to dashboard',
  tryDemo: 'Try the read-only demo',
  createAccount: 'Create account',
  signIn: 'Sign in',
  howTitle: 'How it works',
  step1: 'Add what can lapse.',
  step1Text: 'A host for its TLS certificate, a domain, or any token or licence with a date.',
  step2: 'Checks run for you.',
  step2Text:
    'Certificates and registered domains are checked automatically; you can also check on demand.',
  step3: 'Get told once.',
  step3Text:
    'An alert at 30, 14, 7 and 1 days and at expiry, in the app and by email, without repeats.',
  apiStatus: (status: 'loading' | 'ok' | 'error') => `API status: ${status}`,
  pauseRadar: 'Pause radar animation',
  playRadar: 'Play radar animation',

  // sign in / up
  email: 'Email',
  password: 'Password',
  passwordHint: '10 to 128 characters.',
  haveAccount: 'Already registered?',
  newHere: 'New here?',
  forgotLink: 'Forgot your password?',

  // forgot / reset / confirm
  forgotTitle: 'Forgot your password?',
  forgotIntro: 'Enter your email and we will send you a link to choose a new password.',
  sendLink: 'Send the link',
  forgotDone:
    'If an account exists for that address, a link is on its way. It works once and expires in 1 hour.',
  resetTitle: 'Choose a new password',
  newPassword: 'New password',
  resetSubmit: 'Save new password',
  resetDone: 'Your password was changed and every session was closed. You can sign in now.',
  noToken: 'This link is incomplete. Ask for a new one.',
  askNewLink: 'Ask for a new link',
  confirmTitle: 'Confirm your email',
  confirmIntro: 'Press the button to finish.',
  confirmSubmit: 'Confirm',
  confirmDone: 'Done. Your email is confirmed.',

  // dashboard
  dashboard: 'Dashboard',
  signedInAs: (email: string) => `Signed in as ${email}`,
  signOut: 'Sign out',
  yourItems: 'Your items',
  tryAgain: 'Try again',
  loadingItems: 'Loading items…',
  nothingTracked: 'Nothing tracked yet. Add a domain, a TLS host or a token to see its days left.',
  tableCaption: 'Tracked items and their expiry',
  colItem: 'Item',
  colType: 'Type',
  colExpires: 'Expires',
  colStatus: 'Status',
  colActions: 'Actions',
  demoReadOnly: 'The demo account is read-only.',
  readOnlyDemo: 'Read-only in the demo',
  updated: (label: string) => `${label} updated`,
  deleted: (label: string) => `${label} deleted`,
  itemFallback: 'Item',
  added: (label: string) => `${label} added`,
  kinds: { tls: 'TLS certificate', domain: 'Domain', manual: 'Manual' },
  kindManualOption: 'Manual (token, licence…)',
  chips: {
    expired: 'Expired',
    critical: 'Critical',
    soon: 'Soon',
    ok: 'OK',
    pending: 'Not checked',
    error: 'Check failed',
  },
  checkFailed: 'Check failed',
  notCheckedYet: 'Not checked yet',
  expiredToday: 'expired today',
  expiredAgo: (n: number) => `expired ${plural(n, 'day', 'days')} ago`,
  daysLeft: (n: number) => `${plural(n, 'day', 'days')} left`,
  lastCheck: (error: string) => `Last check: ${error}`,
  addItem: 'Add an item',
  addItemButton: 'Add item',
  type: 'Type',
  hostName: 'Host name',
  label: 'Label',
  labelOptional: 'Label (optional)',
  expiresOn: 'Expires on',
  notes: 'Notes',
  editItem: (label: string) => `Edit ${label}`,
  save: 'Save',
  cancel: 'Cancel',
  confirmDelete: (label: string) => `Confirm delete ${label}`,
  keep: 'Keep',
  checkNow: 'Check now',
  checking: 'Checking…',
  edit: 'Edit',
  delete: 'Delete',

  // alerts
  alertsTitle: (unread: number) => `Alerts${unread > 0 ? ` (${unread} unread)` : ''}`,
  loadingAlerts: 'Loading alerts…',
  noAlerts: 'No alerts yet. They appear when an item gets close to its expiry date.',
  markAllRead: 'Mark all as read',
  markRead: 'Mark as read',
  allMarked: 'All alerts marked as read',
  oneMarked: 'Alert marked as read',
  newPrefix: 'New: ',
  alertText: (label: string, days: number) =>
    days === 0
      ? `${label} has expired`
      : `${label} expires in ${plural(days, 'day', 'days')} or less`,

  // settings
  settingsTitle: 'Alert settings',
  loadingSettings: 'Loading settings…',
  settingsReadOnly: 'Read-only in the demo account.',
  thresholdsLabel: 'Alert me when this many days are left (comma separated)',
  thresholdsHint: 'Whole numbers separated by commas, for example 30, 14, 7, 1.',
  emailAlerts: 'Also send alerts by email',
  saveSettings: 'Save settings',
  settingsSaved: 'Settings saved.',
  settingsAnnounce: 'Alert settings saved',

  // account section
  accountTitle: 'Your account',
  emailVerified: 'Your email address is confirmed.',
  emailNotVerified:
    'Your email address is not confirmed yet. Alerts are not sent by email until you confirm it.',
  resendConfirmation: 'Send the confirmation email again',
  confirmationSent: 'Email sent. Check your inbox.',
  changePassword: 'Change password',
  currentPassword: 'Current password',
  passwordChanged: 'Password changed. Your other sessions were closed.',
  changeEmail: 'Change email',
  newEmail: 'New email',
  changeEmailSent: 'We sent a link to the new address. The email changes when you open it.',

  // delete account
  deleteTitle: 'Delete account',
  deleteOpen: 'Delete my account…',
  deleteWarn: 'This permanently removes your account, items and alerts. It cannot be undone.',
  deleteConfirmPassword: 'Confirm with your password',
  deleteSubmit: 'Permanently delete my account',

  // privacy page
  privacyIntro:
    'Lapse Radar is a portfolio project, not a commercial service. This page says plainly what it keeps.',
  privacyStoredTitle: 'What is stored',
  privacyStored: [
    'Your email address and a salted scrypt hash of your password (never the password).',
    'The items you add (host names, labels, notes, expiry dates) and the alerts made from them.',
    'A session: only a hash of the cookie token is stored, and the cookie is used for nothing else. There are no analytics, advertising or tracking cookies.',
    'Short-lived counters for abuse limits, keyed by your IP address (IPv6: its /64 prefix) or email. They are purged after about a day.',
    'One-time links for confirming your email and resetting your password: only a hash of each link is stored, and it is deleted when used or expired.',
    'Your language choice, to write the emails in it.',
  ],
  privacySeenTitle: 'Who else sees it',
  privacySeen: [
    'Netlify hosts the site and runs the code; Neon hosts the database.',
    'Resend delivers the emails (alerts and account links). It receives the recipient address and the text.',
    'Checks connect from the server to the hosts you add (TLS on port 443, and public RDAP registries for domains).',
  ],
  privacyControlTitle: 'Your control',
  privacyControl:
    'You can turn alert emails off in the alert settings, change your password or email in your account section, and delete your account from the dashboard. Deleting removes your account, sessions, items, alerts and pending links at once.',
};

export type Dict = typeof en;
