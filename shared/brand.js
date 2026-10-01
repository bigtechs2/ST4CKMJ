'use strict';

module.exports = {

  BOT_NAME:     'MINIST4CK',
  BOT_TAGLINE:  'automation that just works',
  BOT_VERSION:  '1.0.0',
  BOT_EMOJI:    '⟡',

  AUTHOR_NAME:  'bigmanj',
  AUTHOR_HANDLE: '@bigmanj',

  PROJECT_NAME: 'ST4CKMJ',
  GITHUB_USER:  'bigtechs2',
  GITHUB_REPO:  'ST4CKMJ',
  GITHUB_URL:   'https://github.com/bigtechs2/ST4CKMJ',
  AUTHOR_URL:   'https://github.com/bigtechs2',

  SYM: {
    bullet:   '·',
    arrow:    '➩',
    pointer:  '▸',
    diamond:  '⟡',
    heart:    '♡',
    star:     '✦',
    spark:    '✧',
    circle:   '◉',
    square:   '▣',
    check:    '✓',
    cross:    '✗',
    timer:    '⏱',
    dot:      '‧',
    gear:     '⚙',
    loop:     '⇄',
    target:   '⊙',
    box:      '⎔',
    game:     '⌬',
    smile:    '☺',
    command:  '⌘',

    info:     'ⓘ',
    search:   '⌕',
    more:     '⋯',
    moreVert: '⋮',
    moreDiag: '⋰',
    moreDiagR:'⋱'
  },

  NUM: {
    normal: ['⓪','①','②','③','④','⑤','⑥','⑦','⑧','⑨'],
    black:  ['⓿','❶','❷','❸','❹','❺','❻','❼','❽','❾'],
    alpha:  ['Ⓐ','Ⓑ','Ⓒ','Ⓓ','Ⓔ','Ⓕ','Ⓖ','Ⓗ','Ⓘ','Ⓙ','Ⓚ','Ⓛ','Ⓜ','Ⓝ','Ⓞ','Ⓟ','Ⓠ','Ⓡ','Ⓢ','Ⓣ','Ⓤ','Ⓥ','Ⓦ','Ⓧ','Ⓨ','Ⓩ']
  },

  INSECTS: [
    '𓆡','𓆏','𓆉','𓆦','𓃥','𓃠','𓃰','𓃘','𓃗',
    '𓃵','𓃸','𓃭','𓃯','𓃙','𓃟','𓄀','𓄁','𓄂',
    '𓄃','𓃚','𓃩','𓃦','𓃡','𓃖','𓃕','𓃜','𓃝',
    '𓆙','𓆚','𓆗','𓆌','𓆈','𓃽','𓃾','𓃿','𓃴',
    '𓆔','𓆍','𓆞','𓅉','𓄿','𓅴','𓅳',
    '𓀉','𓀇','𓀐','𓀓','𓀯','𓀱','𓀼','𓁑','𓁕','𓂾','𓉣'
  ],

  FOOTER: {
    whatsapp: '© MINIST4CK by bigmanjtech™',
    telegram: '© MINIST4CK by bigmanjtech™',
    website:  '© 2026 MINIST4CK by bigmanjtech™',
    admin:    '⟡ ST4CKMJ admin'
  },

  COLOR: {

    bg:          '#000000',
    bgAlt:       '#0a0a0a',
    bgCard:      '#111111',
    bgHover:     '#1a1a1a',
    bgActive:    '#1f1f1f',

    border:      '#222222',
    borderAlt:   '#2a2a2a',
    borderFocus: '#3a3a3a',

    text:        '#e5e5e5',
    textStrong:  '#ffffff',
    textDim:     '#a0a0a0',
    textMute:    '#6b6b6b',
    textFaint:   '#4a4a4a',

    primary:     '#ffffff',
    accent:      '#8b8b8b',
    accentDim:   '#5a5a5a',

    danger:      '#e74c3c',
    dangerHover: '#ff5a47',
    dangerActive:'#c0392b',
    dangerBg:    'rgba(231, 76, 60, 0.12)',
    dangerBorder:'rgba(231, 76, 60, 0.35)',

    warning:     '#f39c12',
    warningHover:'#ffb733',
    warningBg:   'rgba(243, 156, 18, 0.12)',

    success:     '#2ecc71',
    successHover:'#4ddb88',
    successBg:   'rgba(46, 204, 113, 0.12)',

    info:        '#5a9bd5',
    infoBg:      'rgba(90, 155, 213, 0.12)',

    insect:      'rgba(220, 220, 220, 0.55)',
    insectGlow:  'rgba(255, 255, 255, 0.45)',
    insectShadow:'rgba(255, 255, 255, 0.25)',

    shadow:      'rgba(0, 0, 0, 0.6)',
    glow:        'rgba(255, 255, 255, 0.15)'
  },

  BUTTON: {
    default: {
      bg:     '#1a1a1a',
      text:   '#e5e5e5',
      border: '#2a2a2a'
    },
    primary: {
      bg:     '#ffffff',
      text:   '#000000',
      border: '#ffffff'
    },
    danger: {
      bg:     '#e74c3c',
      text:   '#ffffff',
      border: '#ff5a47'
    },
    warning: {
      bg:     '#f39c12',
      text:   '#000000',
      border: '#ffb733'
    },
    success: {
      bg:     '#2ecc71',
      text:   '#000000',
      border: '#4ddb88'
    },
    ghost: {
      bg:     'transparent',
      text:   '#a0a0a0',
      border: '#2a2a2a'
    }
  },

  ANIMATION: {
    insectMinDuration:  8,
    insectMaxDuration:  22,
    insectMinOpacity:   0.35,
    insectMaxOpacity:   0.75,
    insectMinSize:      12,
    insectMaxSize:      24,
    insectSpawnMin:     1200,
    insectSpawnMax:     3000,
    insectRotateMin:    -25,
    insectRotateMax:    25,
    insectDriftMin:     -60,
    insectDriftMax:     60,
    insectGlowBlur:     6,
    insectLayer:        0
  }

};