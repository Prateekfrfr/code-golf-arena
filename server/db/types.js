/**
 * Shared structural types for the database boundary. Keeping this contract
 * independent of `pg` makes repositories straightforward to test with a
 * small query double while retaining strict checking at the edge.
 * @typedef {string | number | boolean | Date | null | readonly string[]} SqlValue
 */

/** @typedef {Record<string, unknown>} SqlRow */

/**
 * @template {SqlRow} T
 * @typedef {{ rows: T[] }} QueryResult
 */

/**
 * @typedef {{
 *   query: <T extends SqlRow>(text: string, values?: SqlValue[]) => Promise<QueryResult<T>>
 * }} Queryable
 */

/**
 * @typedef {Queryable & {
 *   transaction: <T>(work: (transaction: Queryable) => Promise<T>) => Promise<T>
 * }} Database
 */

export {};
