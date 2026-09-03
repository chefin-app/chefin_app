import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';

// Load environment variables FIRST, before importing other modules
config();

// import { supabase } from "./supabaseClient";
import authRoutes from './routes/auth';
import listingsRoutes from './routes/listings';
import availabilityRoutes from './routes/availability';
import ordersRoutes from './routes/orders';
import homeRoutes from './routes/home';
import idRoutes from './routes/id';
import verificationRoutes from './routes/verification';
import reviewsRoutes from './routes/reviews';
import reportsRoutes from './routes/reports';
import adminRoutes from './routes/admin';
import accountRoutes from './routes/account';
import cookApplicationRoutes from './routes/cookApplications';
import cookMenuRoutes from './routes/cookMenu';
import customerReviewRoutes from './routes/customerReviews';
import deliveryRoutes from './routes/delivery';

const app = express();
const PORT = process.env.PORT || 8000;
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const allowAnyDevelopmentOrigin =
  process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0;

// Middleware setup
app.use(
  cors({
    origin: (origin, callback) => {
      // Native requests do not send an Origin header. Browser origins must be
      // explicitly configured in production; local development remains easy.
      if (!origin || allowAnyDevelopmentOrigin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin is not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 8mb accommodates base64-encoded proof-of-preparation photos (5 MB raw).
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/listings', listingsRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/id', idRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/cook-applications', cookApplicationRoutes);
app.use('/api/cook-menu', cookMenuRoutes);
app.use('/api/customer-reviews', customerReviewRoutes);
app.use('/api/delivery', deliveryRoutes);

// 404 handler
app.use('/{*any}', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
