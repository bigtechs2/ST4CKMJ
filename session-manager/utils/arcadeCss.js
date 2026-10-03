export const ARCADE_BASE_CSS = `
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
  -webkit-user-select: none;
  user-select: none;
}

html, body {
  background: transparent;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #e8f8ff;
  overflow: hidden;
}

.wrap {
  padding: 12px;
  display: flex;
  justify-content: center;
}

.card {
  width: 100%;
  max-width: 600px;
  background: rgba(7, 19, 26, .85);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(88, 211, 255, .22);
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, .5), inset 0 1px 0 rgba(255, 255, 255, .05);
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(88, 211, 255, .15);
}

.brand {
  font-size: 10px;
  letter-spacing: 2px;
  color: rgba(88, 211, 255, .65);
  margin-bottom: 2px;
}

.title {
  font-size: 18px;
  font-weight: 700;
  color: #e8f8ff;
  letter-spacing: .5px;
}

.stats {
  display: flex;
  gap: 14px;
  font-variant-numeric: tabular-nums;
}

.stats > div {
  text-align: right;
}

.label {
  font-size: 9px;
  color: rgba(232, 248, 255, .4);
  letter-spacing: 1.5px;
  margin-bottom: 2px;
}

.value {
  font-size: 16px;
  font-weight: 700;
  color: #58d3ff;
}

.main {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.board {
  position: relative;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: #07131a;
  border: 1px solid rgba(88, 211, 255, .15);
}

canvas {
  display: block;
  width: 100%;
  height: auto;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: rgba(7, 19, 26, .85);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  text-align: center;
  padding: 20px;
  transition: opacity .25s ease;
}

.overlay.hidden {
  opacity: 0;
  pointer-events: none;
}

.overlay-title {
  font-size: 22px;
  font-weight: 700;
  color: #58d3ff;
  letter-spacing: 2px;
  text-shadow: 0 0 16px rgba(88, 211, 255, .6);
  margin-bottom: 6px;
}

.overlay-sub {
  font-size: 11px;
  color: rgba(232, 248, 255, .55);
  letter-spacing: 1.5px;
  margin-bottom: 12px;
}

.controls {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.status {
  text-align: center;
  font-size: 10px;
  color: rgba(232, 248, 255, .4);
  letter-spacing: 1.5px;
  padding: 6px;
}

.button {
  background: rgba(88, 211, 255, .1);
  border: 1px solid rgba(88, 211, 255, .35);
  border-radius: 10px;
  padding: 10px 18px;
  color: #e8f8ff;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all .15s ease;
}

.button:hover {
  background: rgba(88, 211, 255, .2);
  border-color: rgba(88, 211, 255, .6);
}

.button:active {
  transform: scale(.96);
}

.button.primary {
  background: linear-gradient(135deg, rgba(88, 211, 255, .25), rgba(255, 110, 168, .25));
  border-color: #58d3ff;
  color: #fff;
}

.button.move {
  min-width: 60px;
  padding: 12px 16px;
  font-size: 16px;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.card {
  animation: fadeIn .3s ease;
}
`;

export const ARCADE_THEMES = {
  neon: {
    bg:        '#07131a',
    primary:   '#58d3ff',
    accent:    '#ff6ea8',
    highlight: '#ffd166',
    text:      '#e8f8ff'
  },
  mono: {
    bg:        '#0a0a0a',
    primary:   '#e5e5e5',
    accent:    '#a0a0a0',
    highlight: '#6b6b6b',
    text:      '#ffffff'
  },
  dark: {
    bg:        '#000000',
    primary:   '#ffffff',
    accent:    '#8b8b8b',
    highlight: '#5a5a5a',
    text:      '#e5e5e5'
  }
};

export default ARCADE_BASE_CSS;