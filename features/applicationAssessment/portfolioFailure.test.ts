import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePortfolioFailure, PORTFOLIO_UNAVAILABLE_REASONS } from './portfolioFailure.ts';

test('known repository and decoder failures map to stable coverage reasons', () => {
  assert.equal(normalizePortfolioFailure(new Error('RULE_NOT_AVAILABLE')), 'NO_ACTIVE_RULE_SET');
  assert.equal(normalizePortfolioFailure(new Error('INVALID_RULE_SET')), 'INVALID_RULE_SET');
  assert.equal(normalizePortfolioFailure(new Error('UNSUPPORTED_SCHEMA')), 'UNSUPPORTED_SCHEMA');
  assert.equal(normalizePortfolioFailure(new Error('SOURCE_DOCUMENT_MISMATCH')), 'SOURCE_DOCUMENT_REVALIDATION_REQUIRED');
});

test('unknown server details never become a client-visible failure code', () => {
  assert.equal(normalizePortfolioFailure(new Error('relation private_table does not exist')), 'SERVER_REPOSITORY_ERROR');
  assert.equal(normalizePortfolioFailure({ detail: 'secret detail' }), 'SERVER_REPOSITORY_ERROR');
  assert.ok(PORTFOLIO_UNAVAILABLE_REASONS.includes('SERVER_REPOSITORY_ERROR'));
});

