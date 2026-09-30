'use strict';

const brand = require('./brand');

module.exports = {

  brand,

  owners: {
    telegram: ['8594354663'],
    telegramUsername: 'bigmanj09',
    telegramUrl: 'https://t.me/bigmanj09',

    whatsapp: {
      name:         'bigmanjtech™',
      organization: 'bigtechs1',
      id:           '255777580820',
      report:       true,
      invisible:    false,
      co: [
        {
          name:         'bigmanjtech™',
          organization: 'bigtechs2',
          id:           '255636756591',
          report:       false,
          invisible:    false
        },
        {
          name:         'bigmanjtech™',
          organization: 'bigtechs3',
          id:           '255705517165',
          report:       false,
          invisible:    false
        }
      ]
    },

    names: ['bigmanj']
  },

  ownerPrivilege: {
    respondToOwnWhatsApp: true,
    fullAccessInPrivate:  true,
    bypassForceJoin:      true,
    bypassPremium:        true,
    bypassRateLimit:      true,
    canUseOwnerCommands:  true
  },

  links: {
    website:              'https://yourdomain.com',
    adminPanel:           'https://admin.yourdomain.com',
    telegramChannel:      'https://t.me/bigst4ckhub',
    telegramGroup:        'https://t.me/bigst4cksupport',
    whatsappChannel:      'https://whatsapp.com/channel/0029Vb8VpyiK0IBkFiIslc0Y',
    whatsappChannelJid:   '0029Vb8VpyiK0IBkFiIslc0Y@newsletter',
    support:              'https://t.me/bigmanj09',
    github:               brand.GITHUB_URL
  },

  forceJoin: {
    telegram: {
      channelId:  '-1003990829602',
      groupId:    '-1003915101849',
      channelUrl: 'https://t.me/bigst4ckhub',
      groupUrl:   'https://t.me/bigst4cksupport'
    }
  },

  prefixes: {
    telegram:         '/',
    whatsappDefault:  '!',
    whatsappAllowed:  ['!', '.', '#', '$', '%', '&', '+', '-', '/', '~'],
    allowMultiPrefix: false
  },

  features: {
    forceJoinTelegram:     true,
    autoFollowChannel:     true,
    enforceChannelFollow:  false,
    pairingEnabled:        true,
    websitePairingEnabled: true,
    adminPanelEnabled:     true,
    autoReconnect:         true,
    keepCommandLogs:       true
  },

  sessions: {
    oneNumberOneSession:       true,
    autoReplaceOnRepair:       false,
    deleteOnLoggedOut:         true,
    pairingCooldownSeconds:    60,
    codeRefreshIntervalSec:    50,
    maxSessionsPerUser:        3,
    reconnectBatchSize:        5,
    reconnectBatchDelayMs:     [3000, 10000]
  },

  limits: {
    maxSendSizeMB:      30,
    maxDownloadSizeMB:  100,
    maxBroadcastChars:  2000,
    rateLimitPerMinute: 20,
    adminRateLimit:     60
  },

  plans: {
    free: {
      name: 'Free',
      maxSessions: 1,
      premiumCommands: false
    },
    premium: {
      name: 'Premium',
      maxSessions: 5,
      premiumCommands: true
    }
  },

  msg: {
    footer: '© MINIST4CK by bigmanjtech™'
  },

  messages: {
    forceJoin: {
      telegram:
        '⟡ Join our channel and group to use MINIST4CK.\n' +
        '➩ Channel: {channel}\n' +
        '➩ Group: {group}\n\n' +
        'Tap the buttons below, then press Verify.'
    },
    pairing: {
      success:
        '♡ Paired successfully.\n' +
        '➩ Number: {number}\n' +
        '➩ Session: active',
      expired:
        '⏱ Pairing code expired.\n' +
        '➩ Tap below to get a new one.',
      invalid:
        '✗ Invalid number.\n' +
        '➩ Include country code, digits only.',
      already:
        '⟡ This number is already paired.\n' +
        '➩ Use delpair first to replace it.',
      cooldown:
        '⏱ Please wait {seconds}s before requesting a new code.'
    },
    errors: {
      generic:   '✗ Something went wrong.',
      timeout:   '✗ Request timed out.',
      rateLimit: '⏱ Too many requests. Slow down.',
      notFound:  '✗ Not found.',
      forbidden: '✗ You do not have permission.'
    },
    welcome: {
      whatsapp:
        '♡ Welcome to MINIST4CK.\n' +
        '➩ Type menu to see commands.'
    },
    prefix: {
      changed:  '♡ Prefix updated to {prefix}',
      reset:    '⟡ Prefix reset to default {prefix}',
      invalid:  '✗ That character is not allowed.',
      usage:    '➩ Usage: setprefix <character>'
    }
  },

  categories: {
    'main':         { symbol: '⟡', label: 'Main' },
    'ai-chart':     { symbol: '✦', label: 'AI Chart' },
    'ai-generator': { symbol: '✧', label: 'AI Generator' },
    'converter':    { symbol: '⇄', label: 'Converter' },
    'downloader':   { symbol: '▸', label: 'Downloader' },
    'funny':        { symbol: '☺', label: 'Funny' },
    'game':         { symbol: '⌬', label: 'Game' },
    'group':        { symbol: '▣', label: 'Group' },
    'information':  { symbol: '◉', label: 'Information' },
    'maker':        { symbol: '⎔', label: 'Maker' },
    'misc':         { symbol: '·', label: 'Misc' },
    'owner':        { symbol: '♡', label: 'Owner' },
    'profile':      { symbol: '⌘', label: 'Profile' },
    'search':       { symbol: '⊙', label: 'Search' },
    'tools':        { symbol: '⚙', label: 'Tools' }
  },

  categoryOrder: [
    'main',
    'downloader',
    'search',
    'information',
    'ai-generator',
    'ai-chart',
    'converter',
    'maker',
    'tools',
    'funny',
    'game',
    'group',
    'profile',
    'misc',
    'owner'
  ],

  admin: {
    requireIpWhitelist: false,
    sessionLifetimeHours: 24,
    auditLogRetentionDays: 30
  },

  ports: {
    website:        3000,
    sessionManager: 3001,
    admin:          3002
  }

};