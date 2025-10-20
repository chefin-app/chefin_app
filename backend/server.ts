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

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware setup
app.use(
  cors({
    origin: '*', // Configure this properly for production
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());
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
