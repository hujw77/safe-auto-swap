import React from 'react'
import ReactDOM from 'react-dom/client'
import { preloadSafeContext } from './lib/safe'
import './styles.css'

const App = React.lazy(() => import('./App'))

// Start the Safe handshake before we load the heavier application bundle.
void preloadSafeContext().catch(() => undefined)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <React.Suspense fallback={<div className="boot-screen">Connecting to Safe...</div>}>
      <App />
    </React.Suspense>
  </React.StrictMode>
)
