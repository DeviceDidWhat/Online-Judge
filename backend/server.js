require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const contestRoutes = require('./routes/contests');
const dashboardRoutes = require('./routes/dashboard');
const discussionRoutes = require('./routes/discussions');
const judgeRoutes = require('./routes/judge');
const languageRoutes = require('./routes/languages');
const notificationRoutes = require('./routes/notifications');
const problemRoutes = require('./routes/problems');
const progressRoutes = require('./routes/progress');
const ratingRoutes = require('./routes/ratings');
const submissionRoutes = require('./routes/submissions');
const userRoutes = require('./routes/users');
const { verifyAccessToken } = require('./middlewares/auth');
const bodyParser = require('body-parser');
const dns = require('dns');
const dotenv = require('dotenv');

dotenv.config();
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const app = express();
const PORT = process.env.PORT || 5000;

// Debug log incoming requests
app.use((req, res, next) => {
  // console.log(`Request URL: ${req.url}, Content-Type: ${req.get('Content-Type')}`);
  next();
});

app.use(helmet());
app.use(cookieParser());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:8080',
  credentials: true
}));

// Skip JSON body parsing for multipart requests
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.startsWith('multipart/form-data')) {
    // console.log('Skipping JSON body parsing for multipart request');
    return next();
  }

  // Only apply JSON parsing for normal JSON requests
  bodyParser.json({ limit: '100mb' })(req, res, (err) => {
    if (err) {
      console.error('JSON parse error:', err.message);
      return res.status(400).json({ message: 'Invalid JSON' });
    }
    next();
  });
});

// Handle URL-encoded forms (like login)
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));

// Mount routes AFTER body parsers
app.use('/api/auth', authRoutes);
app.use('/api/contests', contestRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/discussions', discussionRoutes);
app.use('/api/judge', judgeRoutes);
app.use('/api/languages', languageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/users', userRoutes);

// Example protected route
app.get('/api/protected', verifyAccessToken, (req, res) => {
  res.json({ message: 'You made it to the protected route', user: req.user });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled API error:', err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: err.message });
  }
  if (err.code === 11000) {
    return res.status(409).json({ message: 'Duplicate resource', fields: err.keyValue });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid identifier' });
  }

  res.status(500).json({ message: 'Server error' });
});

// Connect DB and start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});
