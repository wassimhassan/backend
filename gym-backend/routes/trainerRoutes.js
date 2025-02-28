const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Trainer = require("../models/Trainer");
const User = require("../models/User");
const TrainerAvailability = require("../models/TrainerAvailability");

const router = express.Router();

// Middleware to verify JWT Token
const verifyToken = (req, res, next) => {
    const token = req.header("Authorization")?.split(" ")[1];
    if (!token) {
        return res.status(401).json({ message: "Access denied. No token provided." });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.trainer = decoded;
        next();
    } catch (err) {
        res.status(403).json({ message: "Invalid or expired token." });
    }
};

// ✅ Trainer Signup Route
router.post("/trainer/signup", async (req, res) => {
    try {
        const { username, email, password, experience, certifications, specialties } = req.body;

        const existingTrainer = await Trainer.findOne({ email });
        if (existingTrainer) {
            return res.status(400).json({ message: "Trainer already exists with this email." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newTrainer = new Trainer({
            username,
            email,
            password: hashedPassword,
            experience,
            certifications,
            specialties
        });

        await newTrainer.save();
        res.status(201).json({ message: "Trainer registered successfully!" });
    } catch (error) {
        res.status(500).json({ message: "Server error during trainer signup." });
    }
});

// ✅ Trainer Login Route
router.post("/trainer/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const trainer = await Trainer.findOne({ email });

        if (!trainer) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        const isMatch = await bcrypt.compare(password, trainer.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        const token = jwt.sign({ id: trainer._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

        res.status(200).json({
            message: "Login successful",
            trainer: { id: trainer._id, username: trainer.username, email: trainer.email },
            token,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error during login" });
    }
});

// ✅ Set Trainer Availability Route (POST)
router.post("/availability", verifyToken, async (req, res) => {
    try {
        const { trainerId, availableSlots } = req.body;

        // Validate required fields
        if (!trainerId || !availableSlots || !Array.isArray(availableSlots)) {
            return res.status(400).json({ message: "Trainer ID and available slots are required." });
        }

        // Ensure the trainer exists
        const trainerExists = await Trainer.findById(trainerId);
        if (!trainerExists) {
            return res.status(404).json({ message: "Trainer not found." });
        }

        // Update or create the availability
        const updatedAvailability = await TrainerAvailability.findOneAndUpdate(
            { trainerId },
            { trainerId, availableSlots },
            { new: true, upsert: true } // Upsert ensures it creates a new record if none exists
        );

        res.status(201).json({
            message: "Availability updated successfully!",
            availability: updatedAvailability
        });
    } catch (error) {
        console.error("Error while setting availability:", error);
        res.status(500).json({ message: "Server error while setting availability.", error: error.message });
    }
});


// ✅ Get Trainer Availability (GET)
router.get("/availability", async (req, res) => {
    try {
        const availability = await TrainerAvailability.find().populate("trainerId", "username specialties");
        res.status(200).json(availability);
    } catch (error) {
        res.status(500).json({ message: "Server error while fetching availability." });
    }
});

// ✅ Get All Trainers Route (GET)
router.get("/trainers", async (req, res) => {
    try {
        const trainers = await Trainer.find().select("-password");
        res.status(200).json(trainers);
    } catch (error) {
        res.status(500).json({ message: "Server error while fetching trainers." });
    }
});

// ✅ Update Trainer Profile Route (PUT)
router.put("/trainer/:id", verifyToken, async (req, res) => {
    try {
        const trainer = await Trainer.findById(req.params.id);
        if (!trainer) {
            return res.status(404).json({ message: "Trainer not found." });
        }

        Object.assign(trainer, req.body);
        await trainer.save();

        res.status(200).json({ message: "Trainer profile updated successfully!", trainer });
    } catch (error) {
        console.error("Error updating trainer profile:", error);  // Add this line to log errors
        res.status(500).json({ message: "Server error while updating profile." });
    }
});

// ✅ fetch clients assigned to a trainer.
router.get("/trainer/:id/clients", verifyToken, async (req, res) => {
    try {
        const trainer = await Trainer.findById(req.params.id).populate("clients");
        if (!trainer) return res.status(404).json({ message: "Trainer not found." });

        res.status(200).json({ clients: trainer.clients });
    } catch (error) {
        res.status(500).json({ message: "Error retrieving clients." });
    }
});

router.post("/book-session", verifyToken, async (req, res) => {
    try {
        const { trainerId, clientId, day, time } = req.body;

        if (!trainerId || !clientId || !day || !time) {
            return res.status(400).json({ message: "All fields (trainerId, clientId, day, time) are required." });
        }

        // Check if trainer exists
        const trainer = await Trainer.findById(trainerId);
        if (!trainer) {
            return res.status(404).json({ message: "Trainer not found." });
        }

        // Check if client exists
        const client = await User.findById(clientId);
        if (!client) {
            return res.status(404).json({ message: "Client not found." });
        }

        // Fetch trainer's availability
        const availability = await TrainerAvailability.findOne({ trainerId });

        if (!availability) {
            return res.status(400).json({ message: "Trainer has not set any availability." });
        }

        // Check if the requested day and time exist in the trainer's available slots
        const isAvailable = availability.availableSlots.some(slot => 
            slot.day === day && slot.time.includes(time)
        );

        if (!isAvailable) {
            return res.status(400).json({ message: `Trainer is not available on ${day} at ${time}.` });
        }

        // Add client to trainer's client list if not already assigned
        if (!trainer.clients.includes(clientId)) {
            trainer.clients.push(clientId);
        }

        await trainer.save();

        res.status(200).json({ message: "Session booked successfully!", trainer });
    } catch (error) {
        console.error("Error booking session:", error);
        res.status(500).json({ message: "Error booking session.", error: error.message });
    }
});



 
module.exports = router;
