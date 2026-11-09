import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

// A file dropped anywhere but the field would be opened in place of the app. Places that take drops
// (the field, the point list) handle dragover themselves; everywhere else shows "no drop".
window.addEventListener('dragover', e => {
  if (e.defaultPrevented) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
})
window.addEventListener('drop', e => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
