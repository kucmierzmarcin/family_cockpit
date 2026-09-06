import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Bramka } from './auth/Bramka'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Bramka />
  </StrictMode>,
)
