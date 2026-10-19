import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import dns from 'dns';
import path from 'path';
import connectDB from './config/db';
import authRoutes from './routes/authRoutes';
import productRoutes from './routes/productRoutes';
import categoryRoutes from './routes/categoryRoutes';
import transactionRoutes from './routes/transactionRoutes';
import reportRoutes from './routes/reportRoutes';
import creditRoutes from './routes/creditRoutes';
import installmentRoutes from './routes/installmentRoutes';
import settingsRoutes from './routes/settingsRoutes';
import userRoutes from './routes/userRoutes';
import inventoryRequestRoutes from './routes/inventoryRequestRoutes';
import notesRoutes from './routes/notesRoutes';
import signupRequestRoutes from './routes/signupRequestRoutes';
import customerRoutes from './routes/customerRoutes';
import orderDraftRoutes from './routes/orderDraftRoutes';
import posShiftRoutes from './routes/posShiftRoutes';
import digitalMenuRoutes from './routes/digitalMenuRoutes';
import employeeRoutes from './routes/employeeRoutes';
import attendanceRoutes from './routes/attendanceRoutes';
import { payrollRouter, myPayrollRouter, salespersonRouter } from './routes/payrollRoutes';
import { payrollModels } from './models/Payroll';
import expenseRoutes from './routes/expenseRoutes';
import organizationRoutes from './routes/organizationRoutes';
import Expense from './models/Expense';
import { errorHandler, notFound } from './middleware/errorHandler';
import { ensureTenantIndexes } from './utils/tenantIndexes';
import { syncStaffEmployees } from './utils/employeeAccounts';

// Environmental variables I LOVE YOU 2
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true });

// Some networks have a broken IPv6 route to Google APIs, where TLS handshakes reset after ~10s.
dns.setDefaultResultOrder('ipv4first');

const app = express();
const PORT = process.env.PORT || 5000;
const deploymentCommit = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'local';

const configuredOrigins = process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [];

const defaultAllowedOrigins = [
    'https://itemhiveinventorysystem.netlify.app',
    'http://localhost:5173',
    'https://itemhive-staging.netlify.app',
];

const allowedOrigins = Array.from(new Set([...configuredOrigins, ...defaultAllowedOrigins]));
console.log('📦 CORS allowed origins:', allowedOrigins);

const localhostRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const privateNetworkRegex = /^https?:\/\/((10(\.\d{1,3}){3})|(172\.(1[6-9]|2\d|3[0-1])(\.\d{1,3}){2})|(192\.168(\.\d{1,3}){2}))(:\d+)?$/i;

const corsOptions: cors.CorsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        if (!origin) {
            return callback(null, true);
        }

        const isAllowedOrigin = allowedOrigins.includes(origin);
        const isLocalDevOrigin = localhostRegex.test(origin);
        const isPrivateNetworkOrigin = process.env.NODE_ENV !== 'production' && privateNetworkRegex.test(origin);

        if (isAllowedOrigin || isLocalDevOrigin || isPrivateNetworkOrigin) {
            return callback(null, true);
        }

        return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-itemhive-workspace-id', 'x-itemhive-branch-id'],
    // Authorization makes POS requests non-simple CORS requests. Cache the
    // preflight so consecutive payments do not pay an extra network round trip.
    maxAge: 86400,
    optionsSuccessStatus: 204
};

// ── Security & Parsing Middleware ────────────────────────────
app.use(helmet());
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
// Receipt banners are stored as base64 data URLs, so the default 100kb body cap is too small.
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true, limit: '3mb' }));

// ── Static Files ─────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Root & Health Routes ─────────────────────────────────────
app.get('/', (_req: Request, res: Response) => {
    res.json({
        status: 'success',
        message: 'ItemHive Pro API is online 🚀',
        version: '1.0.0',
        commit: deploymentCommit,
        environment: process.env.NODE_ENV || 'development',
        endpoints: ['/api/auth', '/api/products', '/api/transactions', '/api/reports', '/api/customers', '/api/credits', '/api/users', '/api/order-drafts', '/api/pos-shifts', '/api/signup-requests', '/api/employees', '/api/attendance']
    });
});

app.get('/health', (_req: Request, res: Response) => {
    const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
    res.status(200).json({
        status: 'healthy',
        database: dbStatus,
        commit: deploymentCommit,
        timestamp: new Date().toISOString()
    });
});

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api/credit', creditRoutes);
app.use('/api/installments', installmentRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/order-drafts', orderDraftRoutes);
app.use('/api/pos-shifts', posShiftRoutes);
app.use('/api/digital-menus', digitalMenuRoutes);
app.use('/api/inventory-requests', inventoryRequestRoutes);
app.use('/api/signup-requests', signupRequestRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/payroll', payrollRouter);
app.use('/api/me/payroll', myPayrollRouter);
app.use('/api/salespeople', salespersonRouter);
app.use('/api/expenses', expenseRoutes);
app.use('/api/organization', organizationRoutes);

// ── 404 & Error Handling ──────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Database + Server Boot ────────────────────────────────────
const startServer = async () => {
    try {
        await connectDB();
        await ensureTenantIndexes();
        for (const model of payrollModels) await model.createIndexes();
        await Expense.createIndexes();
        // Every staff login in Team has an employee profile, including ones created before they were linked.
        await syncStaffEmployees();
    } catch (error) {
        console.error('❌ Server database init failed:', error);
    }

    // Always start the server so Render health checks pass
    app.listen(PORT as number, '0.0.0.0', () => {
        console.log(`🚀 ItemHive Server running on port ${PORT}`);
        console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
};

startServer();
