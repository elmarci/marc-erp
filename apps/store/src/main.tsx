import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { Toaster } from 'sonner'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5, retry: 1 } },
})

// El botón de Google sólo se muestra si hay Client ID configurado — sin él
// AuthGate cae de vuelta a sólo correo/contraseña, sin romper nada.
const GOOGLE_CLIENT_ID = import.meta.env['VITE_GOOGLE_CLIENT_ID'] as string | undefined

const tree = (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <App />
      <Toaster position="top-center" richColors />
    </BrowserRouter>
  </QueryClientProvider>
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {GOOGLE_CLIENT_ID ? <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{tree}</GoogleOAuthProvider> : tree}
  </React.StrictMode>,
)
