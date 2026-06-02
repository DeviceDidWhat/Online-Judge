const mongoose = require('mongoose');
const { Schema } = mongoose;


const userSchema = new Schema({
  name: { type: String, trim: true },
  username: { type: String, trim: true, required: true },
  email: { type: String, trim: true, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  avatar: { type: String, trim: true },
  country: { type: String, trim: true, uppercase: true, maxlength: 2 },
  rating: { type: Number, default: 1200, min: 0 },
  rank: { type: Number, min: 1 },
  solved: {
    easy: { type: Number, default: 0, min: 0 },
    medium: { type: Number, default: 0, min: 0 },
    hard: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },
  },
  streak: { type: Number, default: 0, min: 0 },
  badges: [{ type: String, trim: true }],
  joinedAt: { type: Date, default: Date.now },
  preferences: {
    defaultLanguage: { type: String, trim: true, default: 'cpp' },
    editorFontSize: { type: Number, default: 14, min: 10, max: 32 },
    theme: { type: String, enum: ['dark', 'light', 'system'], default: 'system' },
  },
  refreshTokens: [{ token: String, createdAt: { type: Date, default: Date.now } }]
}, { timestamps: true });

userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ rating: -1 });

module.exports = mongoose.model('User', userSchema);