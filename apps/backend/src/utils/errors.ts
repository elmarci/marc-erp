export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public readonly fields?: Record<string, string[]>;

  constructor(message: string, fields?: Record<string, string[]>) {
    super(message, 400, 'VALIDATION_ERROR');
    this.fields = fields;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'No autenticado. Inicie sesión para continuar.') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'No tiene permisos para realizar esta acción.') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} no encontrado.`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class BusinessError extends AppError {
  constructor(message: string, code = 'BUSINESS_ERROR') {
    super(message, 422, code);
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super('Demasiadas solicitudes. Intente de nuevo más tarde.', 429, 'RATE_LIMIT');
  }
}
