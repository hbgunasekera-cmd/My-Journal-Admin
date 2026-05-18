import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    
    // Automatically generates local SSL certificates for HTTPS network testing
    basicSsl(),
  ],
  server: {
    // Ensures --host is always active so you can access it via your mobile phone IP
    host: true, 
  }
})