const Notification = require('../models/notification');
const { asyncHandler, parsePagination } = require('../utils/controller');
const { getIO } = require('../socket');

const listNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { limit: 20 });
  const filter = { user: req.user.id };
  if (req.query.unread === 'true') filter.unread = true;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: req.user.id, unread: true }),
  ]);

  res.json({ notifications, unreadCount, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const createNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.create(req.body);

  // Push to the target user's private socket room if they're connected.
  try {
    const io = getIO();
    const userId = req.body.user;
    if (userId) {
      io.to(`user:${userId}`).emit('notification:new', {
        _id: notification._id,
        title: notification.title,
        body: notification.body,
        type: notification.type,
        unread: notification.unread,
        link: notification.link,
        createdAt: notification.createdAt,
      });
    }
  } catch {
    // Socket not available — skip silently.
  }

  res.status(201).json({ notification });
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user.id },
    { unread: false },
    { new: true }
  );
  if (!notification) return res.status(404).json({ message: 'Notification not found' });
  res.json({ notification });
});

const markAllRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany({ user: req.user.id, unread: true }, { unread: false });
  res.json({ modifiedCount: result.modifiedCount });
});

const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndDelete({ _id: req.params.id, user: req.user.id });
  if (!notification) return res.status(404).json({ message: 'Notification not found' });
  res.json({ message: 'Notification deleted' });
});

module.exports = { listNotifications, createNotification, markRead, markAllRead, deleteNotification };
