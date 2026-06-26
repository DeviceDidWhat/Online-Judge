const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { createAccessToken, createRefreshToken } = require('../utils/token');

// Basic sanity check: non-empty local part, a single @, and a domain with a dot.
// Cheap guard so obviously-invalid addresses (e.g. "asdf") can't register. A full
// email-verification flow (confirmation link) is planned for V2.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const buildAuthPayload = (user) => ({
  id: user._id.toString(),
  email: user.email,
  role: user.role,
  username: user.username,
});

const sanitizeUser = (user) => ({
  id: user._id,
  username: user.username,
  email: user.email,
  role: user.role,
});

const sendRefreshTokenCookie = (res, token) => {
  res.cookie('jid', token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
    sameSite: process.env.COOKIE_SAME_SITE || 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
};

// REGISTER
const register = async (req, res) => {
  try {
    const { username, email, password, country } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Username, email, and password are required' });
    }

    if (!EMAIL_REGEX.test(String(email).trim())) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    if (!country) {
      return res.status(400).json({ message: 'Country is required' });
    }

    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) return res.status(409).json({ message: 'Email already registered' });

    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;
    const hashed = await bcrypt.hash(password, saltRounds);

    const user = new User({
      username: username.trim(),
      email: email.toLowerCase(),
      password: hashed,
      country: country.trim(),
    });
    await user.save();

    const payload = buildAuthPayload(user);
    const accessToken = createAccessToken(payload);
    const refreshToken = createRefreshToken(payload);

    user.refreshTokens.push({ token: refreshToken });
    await user.save();

    sendRefreshTokenCookie(res, refreshToken);

    res.status(201).json({
      message: 'User registered',
      accessToken,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// LOGIN
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const payload = buildAuthPayload(user);
    const accessToken = createAccessToken(payload);
    const refreshToken = createRefreshToken(payload);

    user.refreshTokens.push({ token: refreshToken });
    await user.save();

    sendRefreshTokenCookie(res, refreshToken);

    res.status(200).json({
      message: "Login successful",
      accessToken,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error("login error", err);
    res.status(500).json({ message: "Server error" });
  }
};


// REFRESH TOKEN
const refreshToken = async (req, res) => {
  try {
    const token = req.cookies.jid;
    if (!token) return res.status(401).json({ message: 'No refresh token' });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ message: 'User not found' });

    const exists = user.refreshTokens.some(rt => rt.token === token);
    if (!exists) return res.status(401).json({ message: 'Refresh token revoked' });

    const newPayload = buildAuthPayload(user);
    const accessToken = createAccessToken(newPayload);
    const newRefreshToken = createRefreshToken(newPayload);

    await User.findByIdAndUpdate(user._id, { $pull: { refreshTokens: { token } } });
    await User.findByIdAndUpdate(user._id, { $push: { refreshTokens: { token: newRefreshToken } } });


    sendRefreshTokenCookie(res, newRefreshToken);

    res.json({ accessToken });
  } catch (err) {
    console.error('refresh-token error', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// LOGOUT
const logout = async (req, res) => {    
  try {
    const token = req.cookies.jid;
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        await User.findByIdAndUpdate(payload.id, { $pull: { refreshTokens: { token } } });
      } catch {
        // ignore invalid token
      }
    }
    res.clearCookie('jid', {
      httpOnly: true,
      sameSite: process.env.COOKIE_SAME_SITE || 'lax',
      secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
      path: '/',
    });
    res.json({ message: 'Logged out' });
  } catch (err) {
    console.error('logout error', err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { register, login, refreshToken, logout };
