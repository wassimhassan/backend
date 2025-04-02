const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Improved middleware to verify token and validate ObjectIds
const verifyTokenAndValidateIds = (req, res, next) => {
  try {
    // Verify token
    const token = req.header('Authorization')?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Validate any IDs in the request params
    const { userId, receiverId } = req.params;
    
    if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID format.' });
    }
    
    if (receiverId && !mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({ message: 'Invalid receiver ID format.' });
    }

    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(403).json({ message: 'Invalid or expired token.' });
    }
    return res.status(500).json({ message: 'Server error.', error: err.message });
  }
};

// Get chat history between two users
router.get('/:userId/:receiverId', verifyTokenAndValidateIds, async (req, res) => {
  try {
    const { userId, receiverId } = req.params;
    
    // Ensure the requesting user is part of the conversation
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. You can only view your own messages.' });
    }

    const messages = await Message.find({
      $or: [
        { sender: userId, receiver: receiverId },
        { sender: receiverId, receiver: userId }
      ]
    }).sort({ timestamp: 1 });

    res.status(200).json({ messages });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ message: 'Error fetching chat history.', error: error.message });
  }
});

// Send a new message
router.post('/send', verifyTokenAndValidateIds, async (req, res) => {
  try {
    const { sender, receiver, text } = req.body;
    
    // Validate required fields
    if (!sender || !receiver || !text) {
      return res.status(400).json({ message: 'Sender, receiver, and text are required.' });
    }
    
    // Validate MongoDB ObjectIds
    if (!mongoose.Types.ObjectId.isValid(sender) || !mongoose.Types.ObjectId.isValid(receiver)) {
      return res.status(400).json({ message: 'Invalid user ID format.' });
    }
    
    // Ensure the sender matches the authenticated user
    if (sender !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. You can only send messages as yourself.' });
    }

    // Create and save the new message
    const newMessage = new Message({
      sender,
      receiver,
      text,
      timestamp: new Date()
    });

    const savedMessage = await newMessage.save();
    
    res.status(201).json({ message: 'Message sent successfully.', data: savedMessage });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Error sending message.', error: error.message });
  }
});

// Get recent chats for a user (for chat list)
router.get('/recent/:userId', verifyTokenAndValidateIds, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Ensure the requesting user is authorized
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. You can only view your own chats.' });
    }

    // Find the most recent message for each conversation
    const recentChats = await Message.aggregate([
      {
        $match: {
          $or: [{ sender: mongoose.Types.ObjectId(userId) }, { receiver: mongoose.Types.ObjectId(userId) }]
        }
      },
      {
        $sort: { timestamp: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$sender', mongoose.Types.ObjectId(userId)] },
              '$receiver',
              '$sender'
            ]
          },
          lastMessage: { $first: '$$ROOT' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      {
        $project: {
          _id: 1,
          lastMessage: 1,
          userDetails: { $arrayElemAt: ['$userDetails', 0] }
        }
      },
      {
        $project: {
          _id: 1,
          lastMessage: 1,
          'userDetails.username': 1,
          'userDetails.name': 1,
          'userDetails.profilePicture': 1
        }
      }
    ]);

    res.status(200).json({ recentChats });
  } catch (error) {
    console.error('Error fetching recent chats:', error);
    res.status(500).json({ message: 'Error fetching recent chats.', error: error.message });
  }
});

module.exports = router;