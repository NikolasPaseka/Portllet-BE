import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { config } from './config.js';
import prisma from './db.js';
import authRoutes from './routes/auth.js';
import cashRoutes from './routes/cash.js';
import bankRoutes from './routes/banks.js';
import accountRoutes from './routes/accounts.js';
import envelopeRoutes from './routes/envelopes.js';
import stockRoutes from './routes/stocks.js';
import cryptoRoutes from './routes/crypto.js';
import assetRoutes from './routes/assets.js';
import dashboardRoutes from './routes/dashboard.js';
import { applyMonthlyInterest } from './services/interestJob.js';

const app = express();

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Portllet API',
      version: '1.0.0',
      description: 'Personal finance management API',
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.ts'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Middleware
app.use(cors({
  origin: '*',
  credentials: true,
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Routes
app.use('/auth', authRoutes);
app.use('/cash', cashRoutes);
app.use('/banks', bankRoutes);
app.use('/accounts', accountRoutes);
app.use('/', envelopeRoutes);
app.use('/stocks', stockRoutes);
app.use('/crypto', cryptoRoutes);
app.use('/assets', assetRoutes);
app.use('/', dashboardRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Swagger UI
app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
  });
});

// Monthly interest cron job (runs at 00:01 on the 1st of every month)
cron.schedule('1 0 1 * *', async () => {
  try {
    await applyMonthlyInterest();
  } catch (err) {
    console.error('Monthly interest job failed:', err);
  }
});

// Start server
async function start() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('Database connected');

    // Auto-migrate (dev only)
    if (config.nodeEnv === 'development') {
      await prisma.$executeRawUnsafe('SELECT 1');
    }

    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

export default app;
