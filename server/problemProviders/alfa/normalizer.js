import sanitizeHtml from 'sanitize-html';
import { AlfaSchemaError } from './errors.js';
import { RESTRICTED_METADATA_ONLY } from '../../problems/problemSchema.js';

const MAX_ALFA_CONTENT = 50_000;
const MAX_TAGS = 30;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isPlainObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/** @param {unknown} value @param {string} field @param {number} max @param {boolean} [required] */
const text = (value, field, max, required = false) => {
  if (typeof value !== 'string') {
    if (required) throw new AlfaSchemaError(`${field} is required`);
    return '';
  }
  const normalized = value.trim();
  if (required && !normalized) throw new AlfaSchemaError(`${field} is required`);
  if (normalized.length > max) throw new AlfaSchemaError(`${field} exceeds ${max} characters`);
  return normalized;
};

/** @param {unknown} raw @returns {string[]} */
const tagsFor = (raw) => {
  if (!Array.isArray(raw)) return [];
  /** @type {string[]} */
  const tags = [];
  for (const item of raw.slice(0, MAX_TAGS)) {
    const candidate = isPlainObject(item) ? item.slug ?? item.name : item;
    const tag = text(candidate, 'topic tag', 80).toLowerCase();
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
};

/** @param {unknown} value @returns {string} */
const difficultyFor = (value) => {
  const normalized = text(value, 'difficulty', 20).toLowerCase();
  if (normalized === 'easy' || normalized === 'medium' || normalized === 'hard') {
    return normalized;
  }
  throw new AlfaSchemaError('difficulty must be EASY, MEDIUM, or HARD');
};

/** @param {string} html */
const sanitizeStatementHtml = (html) => sanitizeHtml(html, {
  allowedTags: [
    'p', 'br', 'strong', 'em', 'b', 'i', 'code', 'pre', 'ul', 'ol', 'li',
    'blockquote', 'h1', 'h2', 'h3', 'h4', 'table', 'thead', 'tbody', 'tr',
    'th', 'td', 'a', 'span', 'sup', 'sub'
  ],
  allowedAttributes: {
    a: ['href', 'title', 'rel', 'target'],
    code: ['class'],
    pre: ['class'],
    span: ['class']
  },
  allowedSchemes: ['https', 'http', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href']
});

/**
 * Converts a raw Alfa response into a canonical restricted record. Full
 * content may be retained only for local development, and is never made
 * judgeable or publicly served while the provenance remains restricted.
 *
 * @param {unknown} raw
 * @param {{storeFullContent: boolean, cacheVersion: string, now?: () => Date}} options
 */
export const normalizeAlfaProblem = (raw, {
  storeFullContent,
  cacheVersion,
  now = () => new Date()
}) => {
  if (!isPlainObject(raw)) throw new AlfaSchemaError('Alfa problem must be an object');
  for (const key of Object.keys(raw)) {
    if (DANGEROUS_KEYS.has(key)) throw new AlfaSchemaError('Alfa problem contains an unsafe key');
  }
  const title = text(raw.title ?? raw.questionTitle, 'title', 200, true);
  const slug = text(raw.titleSlug ?? raw.slug, 'titleSlug', 160, true).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new AlfaSchemaError('titleSlug is invalid');
  }
  const difficulty = difficultyFor(raw.difficulty);
  const topicTags = tagsFor(raw.topicTags ?? raw.tags);
  const canonicalUrl = `https://leetcode.com/problems/${encodeURIComponent(slug)}/`;
  const rawContent = text(raw.content ?? raw.questionContent, 'content', MAX_ALFA_CONTENT);
  const htmlStatement = storeFullContent && rawContent
    ? sanitizeStatementHtml(rawContent)
    : '';
  const fetchedAt = now().toISOString();
  const alfaMetadata = {
    questionId: text(raw.questionId, 'questionId', 100),
    frontendQuestionId: text(raw.frontendQuestionId, 'frontendQuestionId', 100),
    categoryTitle: text(raw.categoryTitle ?? raw.category, 'categoryTitle', 200),
    topicTags,
    likes: typeof raw.likes === 'number' && Number.isSafeInteger(raw.likes) ? raw.likes : null,
    dislikes: typeof raw.dislikes === 'number' && Number.isSafeInteger(raw.dislikes) ? raw.dislikes : null,
    paidOnly: raw.paidOnly === true || raw.isPaidOnly === true,
    status: text(raw.status, 'status', 100),
    fetchedAt,
    cacheVersion,
    ...(storeFullContent && htmlStatement
      ? { htmlStatement, content: htmlStatement }
      : {})
  };

  return {
    title,
    slug,
    ...(htmlStatement ? { statement: htmlStatement, description: htmlStatement } : {}),
    difficulty,
    topic: topicTags[0] || 'general',
    tags: topicTags,
    supportedLanguages: ['python', 'javascript', 'cpp', 'java'],
    visibleTests: [],
    hiddenTests: [],
    metadata: { alfa: alfaMetadata },
    provenance: {
      state: RESTRICTED_METADATA_ONLY,
      attribution: 'LeetCode',
      canonicalUrl
    },
    version: cacheVersion
  };
};
