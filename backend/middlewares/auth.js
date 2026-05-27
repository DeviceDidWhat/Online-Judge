const jwt = require('jsonwebtoken');

const verifyAccessToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!token) return res.status(401).json({ message: 'No access token provided' });

    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      username: payload.username,
    };
    next();
  } catch (err) {
    console.error('verifyAccessToken error:', err.message);
    return res.status(401).json({ message: 'Invalid or expired access token' });
  }
};

module.exports = { verifyAccessToken };
