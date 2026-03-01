import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './styles/globals.css'
import './lib/i18n' // Initialize i18n
import App from './App.tsx'

// ─── Color Mode Initialization ──────────────────────────────────────────────
const COLOR_MODE_KEY = 'annotix-color-mode';
const savedMode = localStorage.getItem(COLOR_MODE_KEY);

function getSystemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const isDark = savedMode === 'dark' || savedMode === 'dracula' || 
  ((savedMode === 'system' || !savedMode) && getSystemPrefersDark());
const isDracula = savedMode === 'dracula';

document.documentElement.classList.toggle('dark', isDark);
document.documentElement.classList.toggle('dracula', isDracula);
// ────────────────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
