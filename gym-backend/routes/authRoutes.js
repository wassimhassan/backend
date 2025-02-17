const express = require("express"); //Creates a separate router for authentication.
const bcrypt = require("bcryptjs"); // Used for hashing passwords.
const jwt = require("jsonwebtoken"); //Used for user authentication.
const User = require("../models/User");
const asyncHandler = require("express-async-handler");

const router = express.Router();
require("dotenv").config();

// User Signup Route
router.post("/signup", async (req, res) => {
    try {
        const { 
            username, 
            email, 
            password, 
            height, 
            weight, 
            dateOfBirth, 
            phoneNumber, 
            workoutDaysPerWeek, 
            goal, 
            sex 
        } = req.body;

        // Check if username or email already exists
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) return res.status(400).json({ message: "Username or Email already exists" });

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user with optional fields (default values used if fields are missing)
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            height: height || 170, // Default: 170 cm
            weight: weight || 70, // Default: 70 kg
            dateOfBirth: dateOfBirth || null, // No default value
            phoneNumber: phoneNumber || "", // Default: empty string
            workoutDaysPerWeek: workoutDaysPerWeek || 3, // Default: 3 days per week
            goal: goal || "none", // Default: "none"
            sex: ["male", "female"].includes(sex) ? sex : undefined // No default value, only allows valid options
        });

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

//login route
router.post(
    "/login",
    asyncHandler(async (req, res) => {
        const { email, password } = req.body;

        // Find user by email
        let user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        // Verify password
        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.status(200).json({
            message: "Login successful",
            user: { id: user._id, email: user.email },
            token,
        });
    })
);

// Middleware to verify JWT
const verifyToken = (req, res, next) => {
    const token = req.header("Authorization")?.split(" ")[1];
    if (!token) {
        return res.status(401).json({ message: "Access denied. No token provided." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(403).json({ message: "Invalid or expired token." });
    }
};

// Get User Profile Route
router.get(
    "/profile",
    verifyToken,
    asyncHandler(async (req, res) => {
        const user = await User.findById(req.user.id).select("-password");
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }
        res.status(200).json(user);
    })
);

// Update User Profile Route
router.put(
    "/profile",
    verifyToken,
    asyncHandler(async (req, res) => {
        const { name, height, weight, dateOfBirth, phoneNumber, workoutDaysPerWeek, goal, sex } = req.body;

        // Find user by ID
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        // Update fields if provided
        if (name) user.name = name;
        if (height) user.height = height;
        if (weight) user.weight = weight;
        if (dateOfBirth) user.dateOfBirth = dateOfBirth;
        if (phoneNumber) user.phoneNumber = phoneNumber;
        if (workoutDaysPerWeek) user.workoutDaysPerWeek = workoutDaysPerWeek;
        if (goal) user.goal = goal;
        if (["male", "female"].includes(sex)) user.sex = sex;

        await user.save();

        res.status(200).json({ message: "Profile updated successfully", user });
    })
);

// Check if user is authenticated
router.get(
    "/auth-check",
    verifyToken,
    asyncHandler(async (req, res) => {
        const user = await User.findById(req.user.id).select("-password");
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }
        res.status(200).json({ message: "Authenticated", user });
    })
);

// Logout Route
router.post(
    "/logout",
    asyncHandler(async (req, res) => {
        res.status(200).json({ message: "Logged out successfully. Remove token from frontend storage." });
    })
);

module.exports = router;