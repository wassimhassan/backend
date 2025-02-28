const mongoose = require("mongoose");

const TrainerSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phoneNumber: { type: String, unique: false, default: "" },

    height: { type: Number, default: 0 },
    weight: { type: Number, default: 0 },
    dateOfBirth: { type: Date, default: null },
    sex: { type: String, enum: ["male", "female"] },

    profilePicture: { type: String, default: "/uploads/cam.jpg" },

    experience: { type: Number, default: 0 },
    certifications: [{ type: String }],
    specialties: [{ type: String }],
    
    availableSlots: [{ type: mongoose.Schema.Types.ObjectId, ref: "TrainerAvailability" }], // Reference availability

    clients: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    rating: { type: Number, default: 0 },
    reviews: [{ 
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, 
        reviewText: { type: String }, 
        rating: { type: Number }
    }],
}, { timestamps: true });

module.exports = mongoose.model("Trainer", TrainerSchema);
