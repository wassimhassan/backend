const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Message = require("../models/Message");

const verifyToken = (req, res, next) => {
  const token = req.header("Authorization")?.split(" ")[1];
  
  if (!token) {
    return res.status(401).json({ 
      message: "Access denied. No token provided.",
      details: "Token is missing from Authorization header"
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ 
      message: "Invalid or expired token.",
      details: err.message
    });
  }
};

// Validate MongoDB ObjectId
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

router.get("/:user1/:user2", verifyToken, async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    const authUserId = req.user.id.toString();

    // Validate ObjectIds
    if (!isValidObjectId(user1) || !isValidObjectId(user2)) {
      return res.status(400).json({ 
        message: "Invalid user IDs",
        details: "Both user IDs must be valid MongoDB ObjectIds"
      });
    }

    // More comprehensive access check with string conversion
    if (authUserId !== user1.toString() && authUserId !== user2.toString()) {
      return res.status(403).json({ 
        message: "Access denied. You are not a participant in this chat.",
        details: {
          authenticatedUserId: authUserId,
          requestedUsers: { user1, user2 }
        }
      });
    }

    // Fetch messages with optional pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const messages = await Message.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 },
      ],
    })
    .sort({ timestamp: -1 })  // Most recent first
    .skip(skip)
    .limit(limit);

    const total = await Message.countDocuments({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 },
      ],
    });

    res.status(200).json({
      messages,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalMessages: total
      }
    });
  } catch (error) {
    res.status(500).json({ 
      message: "Error fetching chat history", 
      details: error.message 
    });
  }
});

router.post("/send", verifyToken, async (req, res) => {
  try {
    const { sender, receiver, text, timestamp } = req.body;
    const authUserId = req.user.id.toString();

    // Validate required fields
    if (!sender || !receiver || !text) {
      return res.status(400).json({ 
        message: "Missing required fields",
        details: "Sender, receiver, and text are required"
      });
    }

    // Validate ObjectIds
    if (!isValidObjectId(sender) || !isValidObjectId(receiver)) {
      return res.status(400).json({ 
        message: "Invalid sender or receiver ID",
        details: "Both sender and receiver must be valid MongoDB ObjectIds"
      });
    }

    // Stricter sender authentication
    if (sender.toString() !== authUserId) {
      return res.status(403).json({ 
        message: "Access denied. Sender must match authenticated user.",
        details: {
          authenticatedUserId: authUserId,
          attemptedSenderId: sender
        }
      });
    }

    const message = new Message({
      sender,
      receiver,
      text,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    });

    await message.save();
    res.status(201).json({ 
      message: "Message sent successfully", 
      data: message 
    });
  } catch (error) {
    res.status(500).json({ 
      message: "Error sending message", 
      details: error.message 
    });
  }
});

module.exports = router;