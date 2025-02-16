const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { 
        type: String, 
        required: true 
      },
      age: { 
        type: Number, 
        default: 0 
      },
      height: { 
        type: Number, // in cm 
        default: 0 
      },
      weight: { 
        type: Number, // in kg
        default: 0 
      },
      dateOfBirth: { 
        type: Date, 
        default: null 
      },
      email: { 
        type: String, 
        required: true, 
        unique: true 
      },
      phoneNumber: { 
        type: String, 
        required: true 
      },
      workoutDaysPerWeek: { 
        type: Number, 
        default: 0 
      },
      goal: { 
        type: String, 
        default: "none"  // e.g., muscle gain, weight loss, endurance, etc.
      },
      sex: { 
        type: String, 
        enum: ["male", "female"], 
        default: "male" 
      }
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);
