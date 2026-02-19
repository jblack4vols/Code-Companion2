import type { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function errorResponse(res: Response, statusCode: number, message: string, code?: string, details?: Record<string, unknown>) {
  const body: Record<string, unknown> = { message };
  if (code) body.code = code;
  if (details) body.details = details;
  return res.status(statusCode).json(body);
}

export function globalErrorHandler(err: Error | AppError, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  console.error("Unhandled error:", err);

  if (err instanceof AppError) {
    return errorResponse(res, err.statusCode, err.message, err.code, err.details);
  }

  if (err.name === "ZodError") {
    return errorResponse(res, 400, "Validation error", "VALIDATION_ERROR", { errors: (err as any).errors });
  }

  return errorResponse(res, 500, "Internal Server Error", "INTERNAL_ERROR");
}
