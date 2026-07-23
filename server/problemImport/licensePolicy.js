const DEFAULT_ALLOWED_LICENSES = Object.freeze([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'Unlicense'
]);

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
      const spdxId = String(source.license?.spdxId || '').trim();
      if (!spdxId) throw new Error('Problem source SPDX license is required');
      if (!allowed.has(spdxId)) {
        throw new Error(`Problem source license is not allowed: ${spdxId}`);
      }
      const attribution = String(source.license?.attribution || '').trim();
      if (requireAttribution && !attribution) {
        throw new Error('Problem source attribution is required');
      }
      const provider = String(source.provider || '').trim().toLowerCase();
      const locator = String(source.locator || '').trim();
      const revision = String(source.commit || source.ref || '').trim();
      if (!provider || !locator || !revision) {
        throw new Error('Problem source provider, locator, and pinned revision are required');
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
