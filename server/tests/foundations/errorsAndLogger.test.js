import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AppError,
  DatabaseError,
  NotFoundError,
  UpstreamError,
  ValidationError
} from '../../errors/index.js';
import {
  createLogger,
  redactForLog,
  serializeErrorForLog
} from '../../observability/logger.js';
import { ProblemValidationError } from '../../problems/problemSchema.js';
import { PayloadValidationError } from '../../validation/payloads.js';

test('application errors expose stable classifications without leaking details', () => {
  const validation = new ValidationError('Invalid value', {
    code: 'INVALID_VALUE',
    details: { code: 'submitted source' }
  });
  assert.ok(validation instanceof AppError);
  assert.equal(validation.name, 'ValidationError');
  assert.equal(validation.code, 'INVALID_VALUE');
  assert.equal(validation.statusCode, 400);
  assert.equal(validation.expose, true);
  assert.deepEqual(serializeErrorForLog(validation), {
    name: 'ValidationError',
    code: 'INVALID_VALUE',
    statusCode: 400
  });
  assert.ok(new PayloadValidationError('Invalid payload') instanceof ValidationError);
  assert.ok(new ProblemValidationError(['Invalid problem']) instanceof ValidationError);
  assert.equal(new NotFoundError('Missing').statusCode, 404);
  assert.equal(new UpstreamError('Unavailable').statusCode, 502);
  assert.equal(new DatabaseError('Unavailable').statusCode, 503);
});

test('logger emits bounded JSON with correlation ids and redacts sensitive values', () => {
  const lines = [];
  const log = createLogger({
    level: 'debug',
    service: 'test-service',
    createCorrelationId: () => 'generated-correlation-id',
    write: (line) => lines.push(line)
  });
  log.error('submission.failed', {
    token: 'secret-token',
    code: 'submitted source',
    nested: { password: 'secret', safe: 'value' },
    error: new Error('credential=secret')
  });

  const entry = JSON.parse(lines[0]);
  assert.equal(entry.correlationId, 'generated-correlation-id');
  assert.equal(entry.token, '[redacted]');
  assert.equal(entry.code, '[redacted]');
  assert.equal(entry.nested.password, '[redacted]');
  assert.equal(entry.nested.safe, 'value');
  assert.deepEqual(entry.error, {
    name: 'UnexpectedError'
  });

  const unsafe = Object.create(null);
  unsafe.__proto__ = { polluted: true };
  unsafe.safe = true;
  const sanitized = redactForLog(unsafe);
  assert.equal(sanitized.safe, true);
  assert.equal(sanitized.polluted, undefined);
});
