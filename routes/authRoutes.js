const express = require("express"); //Creates a separate router for authentication.
const bcrypt = require("bcryptjs"); // Used for hashing passwords.
const jwt = require("jsonwebtoken"); //Used for user authentication.
const nodemailer = require("nodemailer"); // Import Nodemailer for sending emails.
const User = require("../models/User");
const multer = require("multer");
const asyncHandler = require("express-async-handler");

const router = express.Router();
require("dotenv").config();


// Function to validate password strength
const isValidPassword = (password) => {
    const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)[A-Za-z\d]{8,}$/; 
    return passwordRegex.test(password);
};


router.post("/validate-credentials", async (req, res) => {
    try {
        const {username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({
                message: "Username, email, and password are required."
            });
        }

        // Validate password strength
        if (!isValidPassword(password)) {
            return res.status(400).json({
                field: "password",
                message: "Password must be at least 8 characters long and include letters and numbers."
            });
        }

           // Check if username already exists
           const existingUsername = await User.findOne({ username });
           if (existingUsername) {
               return res.status(400).json({
                   field: "username",
                   message: "Username already exists. Please choose another one."
               });
           }

        // Check if email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                field: "email",
                message: "Email already exists. Please use another email."
            });
        }

        res.status(200).json({ message: "Credentials are valid" });

    } catch (err) {
        console.error("Validation error:", err);
        res.status(500).json({ message: "Server error. Please try again later." });
    }
});


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

    
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user with optional fields (default values used if fields are missing)
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            height: height || 0, 
            weight: weight || 0, 
            dateOfBirth: dateOfBirth || null, // No default value
            phoneNumber: phoneNumber || "", // Default: empty string
            workoutDaysPerWeek: workoutDaysPerWeek || 3, // Default: 3 days per week
            goal: Array.isArray(goal) ? goal : [goal],
            sex: ["male", "female"].includes(sex) ? sex : undefined // No default value, only allows valid options
        });

        await newUser.save();

        // Create JWT token
        const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: "1h" });

        res.status(201).json({ message: "User registered successfully", token });

    } catch (err) {
        console.error("Signup error:", err);
        res.status(500).json({ message: "Server error. Please try again later." });
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
        const resetLink = `${process.env.VERCEL_URL}/reset-password?token=${resetToken}`;

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

         // Validate new password
         if (!isValidPassword(newPassword)) {
            return res.status(400).json({
                message: "Password must be at least 8 characters long and include letters and numbers."
            });
        }

        // Verify the reset token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Find user
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

// Configure Multer for Image Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/"); // Save files inside 'uploads' folder
    },
    filename: (req, file, cb) => {
        cb(null, `${req.user.id}-${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });

// Upload Profile Picture
router.post("/upload-profile-picture", verifyToken, upload.single("profilePicture"), async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        user.profilePicture = `/uploads/${req.file.filename}`;
        await user.save();

        res.status(200).json({ message: "Profile picture uploaded", profilePicture: user.profilePicture });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// Update Profile Picture
router.put("/update-profile-picture", verifyToken, upload.single("profilePicture"), async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        user.profilePicture = `/uploads/${req.file.filename}`;
        await user.save();

        res.status(200).json({ message: "Profile picture updated", profilePicture: user.profilePicture });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// Remove Profile Picture (Reset to Default `cam.jpg`)
router.delete("/remove-profile-picture", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Reset to default profile picture (cam.jpg)
        user.profilePicture = "/uploads/cam.jpg";
        await user.save();

        res.status(200).json({ message: "Profile picture removed", profilePicture: user.profilePicture });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
});


module.exports = router;