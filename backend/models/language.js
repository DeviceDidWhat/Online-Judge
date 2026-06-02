const mongoose = require('mongoose');
const { Schema } = mongoose;

const languageSchema = new Schema({
  languageId: { type: String, required: true, unique: true, trim: true },
  label: { type: String, required: true, trim: true },
  monaco: { type: String, required: true, trim: true },
  version: { type: String, trim: true },
  compileCommand: { type: String },
  runCommand: { type: String },
  enabled: { type: Boolean, default: true, index: true },
}, { timestamps: true });

module.exports = mongoose.model('Language', languageSchema);