const mongoose = require('mongoose');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const parsePagination = (query, defaults = {}) => {
  const page = Math.max(Number.parseInt(query.page, 10) || defaults.page || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || defaults.limit || 20, 1), defaults.maxLimit || 100);
  return { page, limit, skip: (page - 1) * limit };
};

const paginated = async (model, filter, options = {}) => {
  const { page, limit, skip } = parsePagination(options.query || {}, options);
  const [items, total] = await Promise.all([
    model.find(filter)
      .sort(options.sort || { createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(options.select || '')
      .populate(options.populate || []),
    model.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Cap submitted source code well below MongoDB's 16 MB per-document BSON limit (the
// HTTP body parser allows far more). Bytes, not characters, so multi-byte input is
// measured correctly. Returns true when the payload is too large to accept.
const MAX_SOURCE_CODE_BYTES = Number(process.env.MAX_SOURCE_CODE_BYTES || 256 * 1024);
const sourceCodeTooLarge = (sourceCode) =>
  typeof sourceCode === 'string' && Buffer.byteLength(sourceCode, 'utf8') > MAX_SOURCE_CODE_BYTES;

module.exports = {
  asyncHandler,
  parsePagination,
  paginated,
  isObjectId,
  escapeRegExp,
  MAX_SOURCE_CODE_BYTES,
  sourceCodeTooLarge,
};
