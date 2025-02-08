const express = require("express"); //Creates a separate router for authentication.
const bcrypt = require("bcryptjs"); // Used for hashing passwords.
const jwt = require("jsonwebtoken"); //Used for user authentication.
const User = require("../models/User");

const router = express.Router();

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

module.exports = router;
