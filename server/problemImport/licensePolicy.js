import { RESTRICTED_METADATA_ONLY } from '../problems/problemSchema.js';

const DEFAULT_ALLOWED_LICENSES = Object.freeze([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'Unlicense'
]);

export { RESTRICTED_METADATA_ONLY };

/** @param {unknown} value */
const normalizedString = (value) => String(value || '').trim();

/** @param {unknown} source */
const restrictedProvenanceFor = (source) => {
  if (!source || typeof source !== 'object') return null;
  const candidate = /** @type {Record<string, unknown>} */ (source);
  const raw = candidate.provenance;
  const state = typeof raw === 'string'
    ? raw.trim().toUpperCase()
    : raw && typeof raw === 'object'
      ? normalizedString(/** @type {Record<string, unknown>} */ (raw).state).toUpperCase()
      : '';
  if (!state) return null;
  if (state !== RESTRICTED_METADATA_ONLY) {
    throw new Error('Problem source provenance state is not supported');
  }
  const provenance = raw && typeof raw === 'object'
    ? /** @type {Record<string, unknown>} */ (raw)
    : {};
  const attribution = normalizedString(
    provenance.attribution ?? candidate.attribution ??
      (candidate.license && typeof candidate.license === 'object'
        ? /** @type {Record<string, unknown>} */ (candidate.license).attribution
        : '')
  );
  if (!attribution) {
    throw new Error('Restricted metadata-only source attribution is required');
  }
  return { state: RESTRICTED_METADATA_ONLY, attribution };
};

export const createLicensePolicy = ({
  allowedSpdxIds = DEFAULT_ALLOWED_LICENSES,
  requireAttribution = true
} = {}) => {
  const allowed = new Set(allowedSpdxIds);

  return {
    validate(source) {
      if (!source || typeof source !== 'object') {
        throw new Error('Problem source metadata is required');
      }
      const restrictedProvenance = restrictedProvenanceFor(source);
      const provider = normalizedString(source.provider).toLowerCase();
      const locator = normalizedString(source.locator);
      const revision = normalizedString(source.commit || source.ref);
      if (!provider || !locator || !revision) {
        throw new Error('Problem source provider, locator, and pinned revision are required');
      }
      if (restrictedProvenance) {
        return {
          provider,
          locator,
          revision,
          provenance: restrictedProvenance
        };
      }

      const spdxId = normalizedString(source.license?.spdxId);
      if (!spdxId) throw new Error('Problem source SPDX license is required');
      if (!allowed.has(spdxId)) {
        throw new Error(`Problem source license is not allowed: ${spdxId}`);
      }
      const attribution = normalizedString(source.license?.attribution);
      if (requireAttribution && !attribution) {
        throw new Error('Problem source attribution is required');
      }
      return {
        provider,
        locator,
        revision,
        license: {
          spdxId,
          attribution,
          ...(source.license.url ? { url: String(source.license.url) } : {})
        }
      };
    }
  };
};

export { DEFAULT_ALLOWED_LICENSES };
