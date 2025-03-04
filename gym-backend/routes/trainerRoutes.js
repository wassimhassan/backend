// routes/trainerRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Trainer = require("../models/Trainer");
const User = require("../models/User");
const TrainerAvailability = require("../models/TrainerAvailability");
const Booking = require("../models/Booking");

const router = express.Router();

// Middleware to verify JWT Token
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
        res.status(403).json({ 
            message: "Invalid or expired token.",
            error: err.message 
        });
    }
};

// Trainer Signup Route
router.post("/trainer/signup", async (req, res) => {
    try {
        const { 
            username, 
            email, 
            password, 
            experience, 
            certifications, 
            specialties,
            phoneNumber,
            height,
            weight,
            dateOfBirth,
            sex
        } = req.body;

        // Comprehensive validation
        if (password.length < 8) {
            return res.status(400).json({ 
                message: "Password must be at least 8 characters long." 
            });
        }

        const existingTrainer = await Trainer.findOne({ 
            $or: [{ email }, { username }] 
        });

        if (existingTrainer) {
            return res.status(400).json({ 
                message: "Trainer already exists with this email or username." 
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newTrainer = new Trainer({
            username,
            email,
            password: hashedPassword,
            experience,
            certifications,
            specialties,
            phoneNumber,
            height,
            weight,
            dateOfBirth,
            sex
        });

        await newTrainer.save();
        res.status(201).json({ 
            message: "Trainer registered successfully!",
            trainerId: newTrainer._id 
        });
    } catch (error) {
        res.status(500).json({ 
            message: "Server error during trainer signup.",
            error: error.message 
        });
    }
});

// Trainer Login Route
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

        const token = jwt.sign(
            { id: trainer._id, type: 'trainer', role: "trainer"}, 
            process.env.JWT_SECRET, 
            { expiresIn: "1d" }
        );

        res.status(200).json({
            message: "Login successful",
            trainer: { 
                id: trainer._id, 
                username: trainer.username, 
                email: trainer.email,
                role: "trainer"
            },
            token,
        });
    } catch (error) {
        res.status(500).json({ 
            message: "Server error during login",
            error: error.message 
        });
    }
});

// Fetch Trainer Availability
router.get("/availability/:trainerId", async (req, res) => {  // Removed `verifyToken`
    try {
        const { trainerId } = req.params;
        if (!trainerId || trainerId.length !== 24) {
            return res.status(400).json({ message: "Invalid trainer ID format." });
        }

        const availability = await TrainerAvailability.findOne({ trainerId });

        if (!availability) {
            console.warn(`No availability found for Trainer ID: ${trainerId}`);
            return res.status(404).json({ message: "No availability found for this trainer." });
        }

        res.status(200).json(availability.availableSlots);
    } catch (error) {
        console.error("Error fetching availability:", error);
        res.status(500).json({ 
            message: "Server error while fetching availability.",
            error: error.message 
        });
    }
});


// Set Trainer Availability
router.post("/availability", verifyToken, async (req, res) => {
    try {
        const { trainerId, availableSlots } = req.body;

        if (!trainerId || !availableSlots || availableSlots.length === 0) {
            return res.status(400).json({ message: "TrainerId and available slots are required." });
        }

        // Improved slot validation and formatting
        const formattedSlots = availableSlots.map(slot => {
            // Validate day and time format
            if (!slot.day || !Array.isArray(slot.time)) {
                throw new Error("Invalid slot format");
            }

            return {
                day: slot.day,
                time: slot.time.map(timeString => {
                    const parsedTime = new Date(timeString);
                    if (isNaN(parsedTime.getTime())) {
                        throw new Error(`Invalid time format: ${timeString}`);
                    }
                    return parsedTime;
                })
            };
        });

        let availability = await TrainerAvailability.findOne({ trainerId });

        if (availability) {
            availability.availableSlots = formattedSlots;
            await availability.save();
        } else {
            availability = new TrainerAvailability({ 
                trainerId, 
                availableSlots: formattedSlots 
            });
            await availability.save();
        }

        res.status(201).json({ 
            message: "Availability updated successfully!", 
            availability 
        });
    } catch (error) {
        res.status(500).json({ 
            message: "Server error while setting availability.",
            error: error.message 
        });
    }
});

// Remove Availability for a Specific Day
router.delete("/availability/:trainerId/:day", verifyToken, async (req, res) => {
    try {
        const { trainerId, day } = req.params;

        const availability = await TrainerAvailability.findOne({ trainerId });

        if (!availability) {
            return res.status(404).json({ message: "Trainer availability not found." });
        }

        availability.availableSlots = availability.availableSlots.filter(
            (slot) => slot.day !== day
        );

        await availability.save();

        res.status(200).json({ 
            message: "Availability removed successfully!", 
            availability 
        });
    } catch (error) {
        res.status(500).json({ 
            message: "Server error while removing availability.",
            error: error.message 
        });
    }
});

// Get All Trainers
router.get("/trainers", verifyToken, async (req, res) => {
    try {
        const trainers = await Trainer.find().select("-password");
        res.status(200).json(trainers);
    } catch (error) {
        res.status(500).json({ 
            message: "Server error while fetching trainers.",
            error: error.message 
        });
    }
});

// Update Trainer Profile
router.put("/trainer/profile", verifyToken, async (req, res) => {
    try {
        const { 
            experience, 
            certifications, 
            specialties,
            phoneNumber,
            height,
            weight,
            dateOfBirth,
            sex
        } = req.body;

        const trainer = await Trainer.findByIdAndUpdate(
            req.user.id, 
            {
                experience, 
                certifications, 
                specialties,
                phoneNumber,
                height,
                weight,
                dateOfBirth,
                sex
            },
            { new: true, select: '-password' }
        );

        if (!trainer) {
            return res.status(404).json({ message: "Trainer not found." });
        }

        res.status(200).json({ 
            message: "Profile updated successfully", 
            trainer 
        });
    } catch (error) {
        res.status(500).json({ 
            message: "Server error while updating profile.",
            error: error.message 
        });
    }
});

// Fetch Clients Assigned to a Trainer
router.get("/trainer/clients", verifyToken, async (req, res) => {
    try {
        const trainer = await Trainer.findById(req.user.id).populate("clients");
        
        if (!trainer) {
            return res.status(404).json({ message: "Trainer not found." });
        }

        res.status(200).json({ clients: trainer.clients });
    } catch (error) {
        res.status(500).json({ 
            message: "Error retrieving clients.",
            error: error.message 
        });
    }
});

// Update Trainer Availability
router.put("/availability", verifyToken, async (req, res) => {
    try {
        const { trainerId, availableSlots } = req.body;

        if (!trainerId || !availableSlots || availableSlots.length === 0) {
            return res.status(400).json({ message: "TrainerId and available slots are required." });
        }

        // Validate and format available slots
        const formattedSlots = availableSlots.map(slot => {
            if (!slot.day || !Array.isArray(slot.time)) {
                throw new Error("Invalid slot format");
            }

            return {
                day: slot.day,
                time: slot.time.map(timeString => {
                    const parsedTime = new Date(timeString);
                    if (isNaN(parsedTime.getTime())) {
                        throw new Error(`Invalid time format: ${timeString}`);
                    }
                    return parsedTime;
                })
            };
        });

        const availability = await TrainerAvailability.findOneAndUpdate(
            { trainerId },
            { availableSlots: formattedSlots },
            { new: true, upsert: true }
        );

        res.status(200).json({ 
            message: "Availability updated successfully!", 
            availability 
        });
    } catch (error) {
        res.status(500).json({ 
            message: "Server error while updating availability.",
            error: error.message 
        });
    }
});

module.exports = router;