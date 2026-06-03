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

module.exports = { asyncHandler, parsePagination, paginated, isObjectId, escapeRegExp };
