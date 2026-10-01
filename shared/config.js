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
    website:            'https://yourdomain.com',
    adminPanel:         'https://admin.yourdomain.com',
    telegramChannel:    'https://t.me/bigst4ckhub',
    telegramGroup:      'https://t.me/bigst4cksupport',
    whatsappChannel:    'https://whatsapp.com/channel/0029Vb8VpyiK0IBkFiIslc0Y',
    whatsappChannelJid: '0029Vb8VpyiK0IBkFiIslc0Y@newsletter',
    support:            'https://t.me/bigmanj09',
    github:             brand.GITHUB_URL
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
    keepCommandLogs:       true,
    allowSignup:           true,
    allowMultipleSessions: true
  },

  sessions: {
    oneNumberOneSession:    true,
    autoReplaceOnRepair:    false,
    deleteOnLoggedOut:      true,
    pairingCooldownSeconds: 60,
    codeRefreshIntervalSec: 50,
    maxSessionsPerUser:     -1,
    reconnectBatchSize:     5,
    reconnectBatchDelayMs:  [3000, 10000],
    allowLabels:            true,
    maxLabelLength:         20
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
      name:            'Free',
      maxSessions:     -1,
      premiumCommands: false,
      dailyCoins:      10
    },
    premium: {
      name:            'Premium',
      maxSessions:     -1,
      premiumCommands: true,
      dailyCoins:      50
    }
  },

  tiers: {
    superOwner: {
      source:            'config',
      bypassCoins:       true,
      bypassPremium:     true,
      bypassRateLimit:   true,
      bypassForceJoin:   true,
      canRunOwnerCmds:   true,
      canAddPremium:     true,
      canDelPremium:     true,
      canAddCoin:        true,
      canDelCoin:        true,
      canBroadcast:      true,
      canEval:           true,
      canRestart:        true,
      canAccessAdmin:    true,
      canKillSessions:   true,
      maxSessions:       -1
    },

    sessionOwner: {
      source:            'pair',
      bypassCoins:       false,
      bypassPremium:     false,
      bypassRateLimit:   false,
      bypassForceJoin:   false,
      canRunOwnerCmds:   false,
      canManageOwnUsers: true,
      canAddCoin:        true,
      canDelCoin:        true,
      canAddPremium:     false,
      canDelPremium:     false,
      canBroadcast:      false,
      canEval:           false,
      canRestart:        false,
      canAccessAdmin:    false,
      canKillSessions:   false,
      maxSessions:       -1
    },

    premiumUser: {
      source:            'grant',
      bypassCoins:       true,
      bypassPremium:     true,
      bypassRateLimit:   false,
      bypassForceJoin:   false,
      canRunOwnerCmds:   false,
      canAddPremium:     false,
      canBroadcast:      false,
      canAccessAdmin:    false,
      maxSessions:       -1
    },

    freeUser: {
      source:            'default',
      bypassCoins:       false,
      bypassPremium:     false,
      bypassRateLimit:   false,
      bypassForceJoin:   false,
      canRunOwnerCmds:   false,
      canAddPremium:     false,
      canBroadcast:      false,
      canAccessAdmin:    false,
      maxSessions:       -1
    }
  },

  coins: {
    enabled:         true,
    model:           'hybrid',
    startingBalance: 50,
    dailyBonus:      10,
    referralBonus:   25,

    cost: {
      'play':        5,
      'song':        5,
      'video':       8,
      'insta':       5,
      'tiktok':      5,
      'ai-generate': 10,
      'imagine':     10,
      'sticker':     2,
      'translate':   3,
      'tts':         4
    },

    freeCommands: [
      'ping', 'menu', 'help', 'uptime', 'profile',
      'id', 'owner', 'welcome', 'setprefix', 'prefix',
      'resetprefix', 'report', 'pay', 'myplan'
    ]
  },

  payment: {
    enabled:             true,
    currency:            'TZS',
    premiumPrice:        500,
    premiumDurationDays: 30,
    timeoutMinutes:      5,

    providers: {
      sonicpesa: {
        enabled:     true,
        env:         'production',
        apiUrl:      'https://api.sonicpesa.com/api/v1/payment/create_order',
        apiKey:      process.env.SONICPESA_API_KEY,
        secretKey:   process.env.SONICPESA_SECRET_KEY,
        timeoutMs:   45000,
        webhookPath: '/api/payment/webhook'
      },

      telegram: {
        enabled:     true,
        botUrl:      'https://t.me/yourpaymentbot',
        ownerHandle: 'https://t.me/bigmanj09'
      },

      manual: {
        enabled:  true,
        whatsapp: 'https://wa.me/255777580820',
        telegram: 'https://t.me/bigmanj09'
      }
    },

    notifications: {
      telegramOwnerId: '8594354663',
      notifyOnPayment: true,
      notifyOnPair:    false,
      notifyOnFail:    true
    }
  },

  premiumFeatures: {
    botPersonalization: [
      'setbotname',
      'setbotpic',
      'setbotabout',
      'setbotstatus',
      'custommenu',
      'customwelcome',
      'resetbot'
    ],
    automation: [
      'autoreply',
      'autosticker',
      'autovoice',
      'chatbot',
      'schedulemsg',
      'autoresponder',
      'keywordreply',
      'statuscustom'
    ],
    power: [
      'analytics',
      'backup',
      'restore',
      'ghostmode',
      'invisibleread',
      'typingindicator',
      'recordingindicator',
      'priorityqueue'
    ]
  },

  auth: {
    passwordMinLength:    8,
    requireUppercase:     true,
    requireLowercase:     true,
    requireNumber:        true,
    requireSymbol:        false,
    bcryptRounds:         10,
    sessionLifetimeHours: 24,
    allowDuplicateNames:  true,
    usernameMinLength:    3,
    usernameMaxLength:    20,
    telegramPrefix:       'tg_'
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
    pairingFlow: {
      askName:
        '♡ Pairing — step 1 of 2\n\n' +
        '➩ What should we call you?\n\n' +
        'Send your name (e.g. Joshua)\n' +
        'Or /cancel to abort',
      askNumber:
        '⟡ Nice to meet you, {name}\n\n' +
        '➩ Now send your WhatsApp number\n' +
        '➩ Include country code\n' +
        '➩ Example: 255745123456\n\n' +
        'Or /cancel to abort',
      codeReady:
        '♡ Pairing code for {name}\n\n' +
        '`{code}`\n\n' +
        '➩ Code refreshes automatically\n' +
        '➩ Valid for {minutes} minutes\n\n' +
        '➩ Open WhatsApp → Linked Devices\n' +
        '➩ Link with phone number\n' +
        '➩ Enter the code above',
      cancelled:
        '⟡ Pairing cancelled',
      nameTooLong:
        '✗ Name too long (max 30 characters)',
      nameTooShort:
        '✗ Name too short',
      numberInvalid:
        '✗ Invalid number\n' +
        '➩ Include country code, digits only\n' +
        '➩ Example: 255745123456'
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
      changed: '♡ Prefix updated to {prefix}',
      reset:   '⟡ Prefix reset to default {prefix}',
      invalid: '✗ That character is not allowed.',
      usage:   '➩ Usage: setprefix <character>'
    },
    payment: {
      enterNumber:
        '♡ Premium — {amount} {currency}\n' +
        '➩ Enter your payment number below\n' +
        '➩ Example: 255745123456\n\n' +
        'Reply cancel to abort',
      pending:
        '⟡ Check your phone\n' +
        '➩ USSD popup will appear\n' +
        '➩ Enter your PIN to confirm',
      success:
        '♡ Payment received\n' +
        '➩ Amount: {amount} {currency}\n' +
        '➩ Premium active for {days} days',
      failed:
        '✗ Payment failed\n' +
        '➩ Try again with pay',
      cancelled:
        '⟡ Payment cancelled',
      expired:
        '⏱ Payment expired\n' +
        '➩ Try again with pay',
      timeout:
        '⏱ No response in {minutes} minutes\n' +
        '➩ Payment cancelled'
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
    'premium':      { symbol: '✧', label: 'Premium' },
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
    'premium',
    'misc',
    'owner'
  ],

  admin: {
    requireIpWhitelist:    false,
    sessionLifetimeHours:  24,
    auditLogRetentionDays: 30
  },

  ports: {
    website:        3000,
    sessionManager: 3001,
    admin:          3002
  }

};