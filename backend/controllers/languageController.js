const Language = require('../models/language');
const { asyncHandler } = require('../utils/controller');

const listLanguages = asyncHandler(async (req, res) => {
  const filter = req.user?.role === 'admin' && req.query.all === 'true' ? {} : { enabled: true };
  const languages = await Language.find(filter).sort({ label: 1 });
  res.json({ languages });
});

const createLanguage = asyncHandler(async (req, res) => {
  const language = await Language.create(req.body);
  res.status(201).json({ language });
});

const updateLanguage = asyncHandler(async (req, res) => {
  const language = await Language.findOneAndUpdate(
    { languageId: req.params.id },
    req.body,
    { new: true, runValidators: true }
  );
  if (!language) return res.status(404).json({ message: 'Language not found' });
  res.json({ language });
});

const deleteLanguage = asyncHandler(async (req, res) => {
  const language = await Language.findOneAndDelete({ languageId: req.params.id });
  if (!language) return res.status(404).json({ message: 'Language not found' });
  res.json({ message: 'Language deleted' });
});

module.exports = { listLanguages, createLanguage, updateLanguage, deleteLanguage };
