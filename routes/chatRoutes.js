const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Message = require("../models/Message");

// Middleware to verify token
const verifyToken = (req, res, next) => {
  const token = req.header("Authorization")?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id: "mongoIdString", ... }
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token." });
  }
};

/**
 * GET /api/chat/:user1/:user2
 * Fetch chat history between two participants (client/trainer).
 * Only allow access if the authenticated user is one of the two IDs.
 */
router.get("/:user1/:user2", verifyToken, async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    const authUserId = req.user.id.toString(); // the ID from the token

    // If the logged-in user is not one of these two IDs, deny access
    if (authUserId !== user1 && authUserId !== user2) {
      return res
        .status(403)
        .json({ message: "Access denied. You are not a participant in this chat." });
    }

    // Fetch messages
    const messages = await Message.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 },
      ],
    }).sort({ timestamp: 1 });

    res.status(200).json(messages);
  } catch (error) {
    console.error("Error fetching chat history:", error);
    res.status(500).json({ message: "Error fetching chat history", error: error.message });
  }
});

/**
 * POST /api/chat/send
 * Send a new chat message.
 * The sender in req.body must match the authenticated user's ID.
 */
router.post("/send", verifyToken, async (req, res) => {
  try {
    const { sender, receiver, text, timestamp } = req.body;
    const authUserId = req.user.id.toString();

    if (sender.toString() !== authUserId) {
      return res.status(403).json({ message: "Access denied. Sender mismatch." });
    }

    const message = new Message({
      sender,
      receiver,
      text,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    });

    await message.save();
    res.status(201).json({ message: "Message sent successfully", data: message });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ message: "Error sending message", error: error.message });
  }
});

module.exports = router;
