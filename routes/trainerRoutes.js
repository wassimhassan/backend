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
            sex,
            sessionPrice
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
            sex,
            sessionPrice: sessionPrice || 0
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
router.get("/availability/:trainerId", verifyToken, async (req, res) => {
    try {
        const { trainerId } = req.params;
        if (!trainerId || trainerId.length !== 24) {
            return res.status(400).json({ message: "Invalid trainer ID format." });
        }

        // Direct method using the integrated availability array
        const trainer = await Trainer.findById(trainerId);
        
        if (!trainer) {
            return res.status(404).json({ message: "Trainer not found." });
        }
        
        // If no availability, check legacy model
        if (!trainer.availability || trainer.availability.length === 0) {
            const legacyAvailability = await TrainerAvailability.findOne({ trainerId });
            
            if (!legacyAvailability) {
                return res.status(200).json([]); // Return empty array instead of 404
            }
            
            // Convert legacy format to new format
            const formattedAvailability = [];
            legacyAvailability.availableSlots.forEach(slot => {
                const dayEntry = {
                    day: slot.day,
                    time: []
                };
                
                slot.time.forEach(timeString => {
                    // Format the date string in a way the frontend expects
                    dayEntry.time.push(timeString);
                });
                
                formattedAvailability.push(dayEntry);
            });
            
            return res.status(200).json(formattedAvailability);
        }
        
        // Convert the trainer's availability to the format expected by the frontend
        const formattedAvailability = [];
        const dayMap = {};
        
        // Group by day
        trainer.availability.forEach(slot => {
            if (!dayMap[slot.day]) {
                dayMap[slot.day] = {
                    day: slot.day,
                    time: []
                };
            }
            
            // Create a date object for today and set the time
            const today = new Date();
            const [startHour, startMinute] = slot.startTime.split(':');
            const date = new Date(
                today.getFullYear(),
                today.getMonth(),
                today.getDate()
            );
            
            // Find the next occurrence of this day
            const dayIndex = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                .indexOf(slot.day);
            const currentDayIndex = date.getDay();
            const daysToAdd = (dayIndex + 7 - currentDayIndex) % 7;
            date.setDate(date.getDate() + daysToAdd);
            
            // Set the time
            date.setHours(parseInt(startHour), parseInt(startMinute), 0, 0);
            
            // Filter out past availabilities
            if (date > new Date()) {
                dayMap[slot.day].time.push(date.toISOString());
            }
        });
        
        // Convert to array and filter out days with no available time slots
        Object.values(dayMap).forEach(day => {
            if (day.time.length > 0) {
                formattedAvailability.push(day);
            }
        });
        
        res.status(200).json(formattedAvailability);
    } catch (error) {
        console.error("Error fetching availability:", error);
        res.status(500).json({ 
            message: "Server error while fetching availability.",
            error: error.message 
        });
    }
});

// Update trainer availability
router.put('/availability', verifyToken, async (req, res) => {
    try {
        const { availability } = req.body;
        
        if (!availability || !Array.isArray(availability)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Availability array is required' 
            });
        }

        // Validate each time slot
        for (const slot of availability) {
            if (!slot.day || !slot.startTime || !slot.endTime) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Each time slot requires day, startTime, and endTime' 
                });
            }

            // Validate time format
            const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(slot.startTime) || !timeRegex.test(slot.endTime)) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Invalid time format. Use HH:MM format' 
                });
            }

            // Validate time range
            const start = new Date(`2000-01-01T${slot.startTime}`);
            const end = new Date(`2000-01-01T${slot.endTime}`);
            if (start >= end) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'End time must be after start time' 
                });
            }
        }

        const trainer = await Trainer.findById(req.user.id);
        if (!trainer) {
            return res.status(404).json({ 
                success: false, 
                message: 'Trainer not found' 
            });
        }

        // Log received data for debugging
        console.log("Received availability data:", availability);

        // Update availability in trainer model
        const enrichedAvailability = availability.map(slot => {
            const today = new Date();
            const targetDayIndex = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(slot.day);
            const todayDayIndex = today.getDay();
            const daysToAdd = (targetDayIndex + 7 - todayDayIndex) % 7;
        
            const date = new Date();
            date.setDate(today.getDate() + daysToAdd);
            
            const fullDateString = date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        
            return {
                ...slot,
                fullDate: fullDateString
            };
        });
        trainer.availability = enrichedAvailability;

        await trainer.save();
        
        // Clean up legacy availability if it exists
        await TrainerAvailability.findOneAndDelete({ trainerId: req.user.id });

        // Filter out any booked slots
        const bookings = await Booking.find({ 
            trainerId: req.user.id,
            status: { $nin: ['canceled'] }
        });
        
        // Filter availability to exclude booked slots
        const availableSlots = trainer.availability.filter(slot => {
            const slotDay = slot.day;
            const slotStartTime = slot.startTime;
            
            // Check if this slot conflicts with any booking
            return !bookings.some(booking => {
                const bookingDate = new Date(booking.sessionTime);
                const bookingDay = bookingDate.toLocaleDateString('en-US', { weekday: 'long' });
                const bookingHour = bookingDate.getHours();
                const bookingMinute = bookingDate.getMinutes();
                const bookingTime = `${String(bookingHour).padStart(2, '0')}:${String(bookingMinute).padStart(2, '0')}`;
                
                console.log(`Comparing booking: ${bookingDay} ${bookingTime} with slot: ${slotDay} ${slotStartTime}`);
                
                return bookingDay === slotDay && bookingTime === slotStartTime;
            });
        });

        res.json({ 
            success: true, 
            message: 'Availability updated successfully',
            availability: availableSlots 
        });
    } catch (error) {
        console.error('Availability update error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update availability',
            error: error.message 
        });
    }
});
// Fetch Trainer Profile Route
router.get("/trainer/profile", verifyToken, async (req, res) => {
    try {
        const trainer = await Trainer.findById(req.user.id).select("-password");
        if (!trainer) {
            return res.status(404).json({ message: "Trainer not found." });
        }
        res.status(200).json(trainer);
    } catch (error) {
        res.status(500).json({ message: "Error fetching trainer profile.", error: error.message });
    }
});

// Update Trainer Profile
router.put("/trainer/profile", verifyToken, async (req, res) => {
    try {
        const updateData = {};
        
        // Only include fields that are present in the request
        const allowedFields = [
            'experience', 'certifications', 'specialties', 
            'phoneNumber', 'height', 'weight', 'dateOfBirth', 
            'sex', 'sessionPrice'
        ];
        
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        });
        
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ message: "No valid fields to update." });
        }

        const trainer = await Trainer.findByIdAndUpdate(
            req.user.id, 
            updateData,
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

// Fetch ALL Clients for Trainer
router.get('/trainer/clients', verifyToken, async (req, res) => {
  try {
    console.log('Fetching clients for trainer:', req.user.id);
    
    const trainerId = req.user.id;
    
    // First verify the trainer exists
    const trainer = await Trainer.findById(trainerId);
    if (!trainer) {
      console.log('Trainer not found:', trainerId);
      return res.status(404).json({ message: 'Trainer not found' });
    }

    console.log('Finding bookings for trainer:', trainerId);
    const bookings = await Booking.find({ trainerId })
      .populate('clientId', 'username email name')
      .sort({ date: -1 });

    console.log('Found bookings:', bookings.length);
    
    const clientMap = new Map();
    bookings.forEach(booking => {
      if (booking.clientId && !clientMap.has(booking.clientId._id.toString())) {
        clientMap.set(booking.clientId._id.toString(), booking.clientId);
      }
    });

    console.log('Unique clients found:', clientMap.size);
    res.json({ clients: Array.from(clientMap.values()) });
  } catch (error) {
    console.error('Detailed error in fetching clients:', error);
    res.status(500).json({ 
      message: 'Error fetching clients',
      error: error.message,
      stack: error.stack 
    });
  }
});

// Get Bookings for a Trainer
router.get('/bookings', verifyToken, async (req, res) => {
    try {
        const trainerId = req.user.id;
        
        // Status filter - default to all non-canceled bookings
        const status = req.query.status || ['pending', 'confirmed', 'completed'];
        const statusFilter = Array.isArray(status) ? { $in: status } : status;
        
        // Date range filter
        const dateFilter = {};
        if (req.query.startDate) {
            dateFilter.$gte = new Date(req.query.startDate);
        }
        if (req.query.endDate) {
            dateFilter.$lte = new Date(req.query.endDate);
        }
        
        // Build query
        const query = { trainerId };
        if (Object.keys(dateFilter).length > 0) {
            query.sessionTime = dateFilter;
        }
        if (status) {
            query.status = statusFilter;
        }
        
        const bookings = await Booking.find(query)
            .populate('clientId', 'username email name')
            .sort({ sessionTime: 1 });
            
        res.json({ success: true, bookings });
    } catch (error) {
        console.error('Error fetching trainer bookings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch bookings',
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
module.exports = router;