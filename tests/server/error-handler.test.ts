import { describe, it, expect, vi } from 'vitest';
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
} from '../../server/middleware/error-handler';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('defaults to 500 status and INTERNAL_ERROR code', () => {
      const err = new AppError('Something broke');
      expect(err.statusCode).toBe(500);
      expect(err.code).toBe('INTERNAL_ERROR');
      expect(err.message).toBe('Something broke');
    });

    it('accepts custom status code and error code', () => {
      const err = new AppError('Custom error', 418, 'TEAPOT');
      expect(err.statusCode).toBe(418);
      expect(err.code).toBe('TEAPOT');
    });

    it('accepts details', () => {
      const err = new AppError('Err', 400, 'BAD', { field: 'name' });
      expect(err.details).toEqual({ field: 'name' });
    });
  });

  describe('ValidationError', () => {
    it('has 400 status and VALIDATION_ERROR code', () => {
      const err = new ValidationError('Bad input');
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('NotFoundError', () => {
    it('has 404 status and formats message', () => {
      const err = new NotFoundError('Session');
      expect(err.statusCode).toBe(404);
      expect(err.message).toBe('Session not found');
      expect(err.code).toBe('NOT_FOUND');
    });
  });

  describe('UnauthorizedError', () => {
    it('has 401 status with default message', () => {
      const err = new UnauthorizedError();
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe('Not authenticated');
    });

    it('accepts custom message', () => {
      const err = new UnauthorizedError('Token expired');
      expect(err.message).toBe('Token expired');
    });
  });

  describe('ForbiddenError', () => {
    it('has 403 status', () => {
      const err = new ForbiddenError();
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('FORBIDDEN');
    });
  });

  describe('ConflictError', () => {
    it('has 409 status', () => {
      const err = new ConflictError('Already exists');
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('CONFLICT');
    });
  });

  describe('RateLimitError', () => {
    it('has 429 status with default message', () => {
      const err = new RateLimitError();
      expect(err.statusCode).toBe(429);
      expect(err.message).toBe('Too many requests');
    });
  });

  describe('Error inheritance', () => {
    it('all custom errors are instances of AppError', () => {
      expect(new ValidationError('x')).toBeInstanceOf(AppError);
      expect(new NotFoundError('x')).toBeInstanceOf(AppError);
      expect(new UnauthorizedError()).toBeInstanceOf(AppError);
      expect(new ForbiddenError()).toBeInstanceOf(AppError);
      expect(new ConflictError('x')).toBeInstanceOf(AppError);
      expect(new RateLimitError()).toBeInstanceOf(AppError);
    });

    it('all custom errors are instances of Error', () => {
      expect(new AppError('x')).toBeInstanceOf(Error);
      expect(new ValidationError('x')).toBeInstanceOf(Error);
    });
  });
});
