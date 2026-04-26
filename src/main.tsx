import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import { AppDataProvider } from './context/AppDataContext'
import App from './App'
import { FleetAuthProvider } from './fleet/context/FleetAuthContext'
import FleetApp from './fleet/FleetApp'
import './styles/global.css'

const isFleet = window.location.pathname.startsWith('/fleet')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isFleet ? (
      <FleetAuthProvider>
        <FleetApp />
      </FleetAuthProvider>
    ) : (
      <AuthProvider>
        <AppDataProvider>
          <App />
        </AppDataProvider>
      </AuthProvider>
    )}
  </React.StrictMode>
)
