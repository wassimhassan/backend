const express = require("express"); //Creates a separate router for authentication.
const bcrypt = require("bcryptjs"); // Used for hashing passwords.
const jwt = require("jsonwebtoken"); //Used for user authentication.
const User = require("../models/User");
const nodemailer = require("nodemailer");

const router = express.Router();
require("dotenv").config();

// User Signup Route
router.post("/signup", async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: "User already exists" });

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const newUser = new User({ username, email, password: hashedPassword });
        await newUser.save();

        // Create JWT token
        const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: "1h" });

        res.status(201).json({ user: newUser, token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reset Password Request Route
router.post("/reset-password", async (req, res) => {
    const { email } = req.body;

    try {
        // Validate email format
        if (!email || !email.includes("@")) {
            return res.status(400).json({ message: "Invalid email format" });
        }

        // Find user by email
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Generate reset token valid for 10 minutes
        const resetToken = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "10m" }
        );

        // Construct reset password link
        const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

        // Configure nodemailer transporter
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,  // Your Gmail
                pass: process.env.APP_PASS     // App password (not normal password)
            }
        });

        // Send reset password email
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: "Password Reset Request",
            html: `
                <p>Hello ${user.username},</p>
                <p>You requested a password reset.</p>
                <p>Click the link below to reset your password (valid for 10 minutes):</p>
                <a href="${resetLink}">Reset Password</a>
            `
        });

        res.status(200).json({ message: "Reset link sent to your email" });

    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// Confirm Reset Route
router.post("/confirm-reset", async (req, res) => {
    const { token, newPassword } = req.body;

    try {
        if (!token || !newPassword) {
            return res.status(400).json({ message: "Token and new password are required" });
        }

        // Verify the reset token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Find user by ID in the token
        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update user password
        user.password = hashedPassword;
        await user.save();

        res.status(200).json({ message: "Password reset successful" });

    } catch (error) {
        res.status(400).json({ message: "Invalid or expired token" });
    }
});

module.exports = router;