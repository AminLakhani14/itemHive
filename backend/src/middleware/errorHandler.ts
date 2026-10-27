import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
    status?: number;
    code?: string | number;
}

/**
 * Global error handler middleware.
 * Must be registered AFTER all routes.
 */
export const errorHandler = (
    err: AppError,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (res.headersSent) return next(err);
    const status = err.status || (err.code === 11000 ? 409 : ['CastError', 'ValidationError'].includes(err.name) ? 400 : 500);
    const message = err.code === 11000 ? 'A record with these details already exists.' : err.message || 'Internal Server Error';

    // Don't expose stack traces in production
    const response: Record<string, any> = {
        status: 'error',
        message,
        code: err.code || 'INTERNAL_ERROR',
    };

    if (process.env.NODE_ENV === 'development') {
        response.stack = err.stack;
    }

    console.error(`[ERROR] ${status} - ${message}`, {
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
    });

    res.status(status).json(response);
};

/**
 * 404 handler — catches any unmatched routes
 */
export const notFound = (req: Request, res: Response, next: NextFunction) => {
    const err: AppError = new Error(`Route not found: ${req.originalUrl}`);
    err.status = 404;
    err.code = 'NOT_FOUND';
    next(err);
};
