import type { ZedThemeFamily } from '../theme'

// Real Zed theme JSONs from their original repos
import oneDark from './one-dark.json'
import catppuccin from './catppuccin.json'
import gruvbox from './gruvbox.json'
import ayu from './ayu.json'
import dracula from './dracula.json'
import rosePine from './rose-pine.json'
import nord from './nord.json'
import githubDark from './github-dark.json'
import tokyoNight from './tokyo-night.json'
import solarized from './solarized.json'

export interface BundledTheme {
  id: string
  label: string
  family: ZedThemeFamily
}

// OLED Black — the built-in default (no JSON file, constructed from code)
const oledBlack: ZedThemeFamily = {
  name: 'OLED Black',
  author: 'Humanboard',
  themes: [{
    name: 'OLED Black',
    appearance: 'dark',
    style: {
      background: '#000000',
      foreground: '#ffffff',
      text: '#ffffff',
      'text.muted': '#999999',
      'text.accent': '#528bff',
      border: '#1a1a1a',
      'surface.background': '#0a0a0a',
      'element.background': '#111111',
      'element.hover': '#111111',
      'panel.background': '#000000',
      'editor.background': '#000000',
      'editor.foreground': '#d4d4d4',
      'editor.gutter.background': '#000000',
      'editor.line_number': '#555555',
      'editor.active_line.background': 'rgba(255,255,255,0.05)',
      syntax: {
        comment: { color: '#5c6370' },
        string: { color: '#98c379' },
        keyword: { color: '#c678dd' },
        function: { color: '#61afef' },
        type: { color: '#e5c07b' },
        number: { color: '#d19a66' },
        operator: { color: '#56b6c2' },
        variable: { color: '#e06c75' },
        constant: { color: '#d19a66' },
        property: { color: '#e06c75' },
        punctuation: { color: '#abb2bf' },
      },
      error: '#e06c75',
      warning: '#e5c07b',
    },
  }],
}

export const BUNDLED_THEMES: BundledTheme[] = [
  { id: 'oled-black', label: 'OLED Black (Default)', family: oledBlack },
  { id: 'one-dark', label: 'One Dark', family: oneDark as unknown as ZedThemeFamily },
  { id: 'catppuccin', label: 'Catppuccin', family: catppuccin as unknown as ZedThemeFamily },
  { id: 'gruvbox', label: 'Gruvbox', family: gruvbox as unknown as ZedThemeFamily },
  { id: 'ayu', label: 'Ayu', family: ayu as unknown as ZedThemeFamily },
  { id: 'dracula', label: 'Dracula', family: dracula as unknown as ZedThemeFamily },
  { id: 'rose-pine', label: 'Rosé Pine', family: rosePine as unknown as ZedThemeFamily },
  { id: 'nord', label: 'Nord', family: nord as unknown as ZedThemeFamily },
  { id: 'github-dark', label: 'GitHub Dark', family: githubDark as unknown as ZedThemeFamily },
  { id: 'tokyo-night', label: 'Tokyo Night', family: tokyoNight as unknown as ZedThemeFamily },
  { id: 'solarized', label: 'Solarized', family: solarized as unknown as ZedThemeFamily },
]

export function getThemeById(id: string): BundledTheme | undefined {
  return BUNDLED_THEMES.find((t) => t.id === id)
}
