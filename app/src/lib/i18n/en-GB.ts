/**
 * All user-facing strings (British English). UI components must pull text from
 * here so wording stays consistent and a second locale can slot in later.
 * Never use the em-dash character in these strings.
 */
export const t = {
  appName: 'Meshly',
  tagline: 'Private meetings, peer to peer.',
  heroSub: 'No sign-up. No servers in the middle. Free.',

  home: {
    hero: 'Private meetings, peer to peer.',
    heroSub: 'No sign-up. No servers in the middle. Free.',
    nameLabel: 'Your name',
    namePlaceholder: 'Ada Lovelace',
    startMeeting: 'Start a meeting',
    or: 'or',
    joinLinkLabel: 'Join with a link',
    joinLinkPlaceholder: 'Paste a meeting link',
    join: 'Join',
    joinInvalid: 'That does not look like a Meshly link.',
    qrJoin: 'Join with a QR code',
    startSteps: ['Adding security', 'Creating room', 'Connecting'],
    startFailed: 'Could not create the meeting. Please try again.',
    features: {
      direct: {
        title: 'Direct and encrypted',
        body: 'Audio, video and chat flow straight between devices. Signalling is encrypted end to end.',
      },
      pwa: {
        title: 'In your browser or as an app',
        body: 'Nothing to install for guests. Install Meshly for an app-like window.',
      },
      ai: {
        title: 'Bring your own AI notes',
        body: 'Use your own OpenAI, Anthropic, Gemini or compatible key for transcripts and summaries.',
      },
    },
    how: {
      title: 'How it works',
      steps: [
        'Start a meeting and share one link.',
        'Guests knock; you let them in.',
        'Talk, share, record, take AI notes. Nothing touches our servers.',
      ],
    },
    installCard: {
      title: 'Get the Meshly app',
      body: 'Opens instantly and works like a native app.',
      dismiss: 'Not now',
    },
  },

  prejoin: {
    previewLabel: 'Camera preview',
    micOn: 'Microphone on',
    micOff: 'Microphone off',
    cameraOn: 'Camera on',
    cameraOff: 'Camera off',
    mic: 'Microphone',
    camera: 'Camera',
    speaker: 'Speaker',
    nameLabel: 'Your name',
    startMeeting: 'Start meeting',
    askToJoin: 'Ask to join',
    joinWithoutCamera: 'Join without camera',
    permissionPrompt:
      'Meshly needs your camera and microphone. Your video goes directly to other participants.',
    permissionBlocked:
      "Camera is blocked. Allow it in your browser's site settings, then try again.",
    copyLink: 'Copy link',
    copied: 'Copied',
    shareLink: 'Share',
    linkCardTitle: 'Share this link',
    linkCardBody: 'Anyone with the link can ask to join.',
  },

  lobby: {
    waiting: 'Waiting for the host to let you in',
    hostAway: 'The host is not here yet',
    denied: 'The host did not let you in',
    full: (n: number) => `This meeting is full (${n} people).`,
    locked: 'This meeting is locked.',
    cancel: 'Cancel',
  },

  call: {
    copyLink: 'Copy link',
    shareQr: 'QR code',
    shareQrHint: 'Guests can scan this to join.',
    recording: 'Recording',
    aiNotes: 'AI notes',
    mic: 'Microphone',
    camera: 'Camera',
    shareScreen: 'Share screen',
    raiseHand: 'Raise hand',
    lowerHand: 'Lower hand',
    reactions: 'Reactions',
    chat: 'Chat',
    people: 'People',
    notes: 'Notes',
    more: 'More',
    leave: 'Leave',
    endForAll: 'End for everyone',
    record: 'Record',
    lockMeeting: 'Lock meeting',
    youLeft: 'You left the meeting',
    hostEnded: 'The host ended the meeting.',
    removed: 'You were removed from the meeting.',
    you: 'you',
    others: (n: number) => `and ${n} others`,
    gridLayout: 'Grid layout',
    speakerLayout: 'Speaker layout',
    settings: 'Settings',
    about: 'About',
    switchCamera: 'Switch camera',
    sound: 'Tap to turn on sound',
    mutedHint: 'You are muted',
  },

  chat: {
    placeholder: 'Message',
    send: 'Send',
    unread: (n: number) => `${n} unread`,
  },

  people: {
    knocking: 'Asking to join',
    knockToast: (name: string) => `${name} is asking to join`,
    admit: 'Admit',
    deny: 'Deny',
    admitAll: 'Admit all',
    participants: 'In the meeting',
    askToMute: 'Ask to mute',
    remove: 'Remove',
    pin: 'Pin',
  },

  postcall: {
    left: 'You left the meeting',
    ended: 'The host ended the meeting.',
    removed: 'You were removed from the meeting.',
    duration: (mins: number) => (mins < 1 ? 'Under a minute' : `${mins} min`),
    saveRecording: 'Save recording',
    downloadNotes: 'Download notes (Markdown)',
    rejoin: 'Rejoin',
    newMeeting: 'Start a new meeting',
    home: 'Home',
  },

  settings: {
    title: 'Settings',
    audioVideo: 'Audio and video',
    aiNotes: 'AI notes',
    appearance: 'Appearance',
    advanced: 'Advanced',
    about: 'About',
    theme: 'Theme',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    relayOnly: 'Relay only (hide your IP address)',
    connectionDetails: 'Show connection details',
    transports: 'Signalling transports',
    version: 'Version',
  },

  errors: {
    incompleteLink:
      'This meeting link is incomplete. Ask the host to send the full link.',
    unsupportedBrowser:
      'Your browser cannot make Meshly calls. Try the latest Chrome, Edge, Safari or Firefox.',
    inAppBrowser:
      'For camera access and to install the app, open this link in your browser.',
    noRelay:
      'Cannot reach the meeting network. Check your internet connection.',
    retry: 'Retry',
    offline: 'You are offline. Meshly will reconnect when you are back online.',
    newerVersion:
      'Someone in this meeting is using a newer version of Meshly. Refresh to update.',
    notFound: 'Page not found.',
    backHome: 'Back to home',
    slotsFull: 'All 6 camera slots are in use. You can still talk and listen.',
  },

  install: {
    button: 'Install app',
    sheetTitle: 'Install Meshly',
    iosSteps: 'Tap Share, then Add to Home Screen.',
    iosWrongBrowser: 'To install, open this page in Safari.',
    macSafari: 'Open the File menu and choose Add to Dock.',
    installed: 'Meshly installed',
  },

  update: {
    ready: 'A new version of Meshly is ready',
    action: 'Update',
  },

  about: {
    title: 'About Meshly',
  },

  footer: {
    credit: 'Architected by Faisal Hanif',
    product: 'Free private meetings',
    about: 'About',
    privacy: 'Privacy',
    terms: 'Terms',
  },
} as const;

export type Strings = typeof t;
