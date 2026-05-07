export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  databaseUrl: process.env.DATABASE_URL || '',
  jwt: {
    secret: process.env.JWT_SECRET || '',
    issuer: process.env.JWT_ISSUER || 'portllet-api',
    audience: process.env.JWT_AUDIENCE || 'portllet-app',
    expiresInMinutes: parseInt(process.env.JWT_EXPIRES_IN_MINUTES || '1000', 10),
  },
  fxApiKey: process.env.FX_API_KEY || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/google/callback',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
};
