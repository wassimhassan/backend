const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true},
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
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
      phoneNumber: { 
        type: String, 
        unique: false,
        default: ""
      },

      workoutDaysPerWeek: { 
        type: Number, 
        default: 1
      },
      goal: { 
      type: [String], 
      default: ["none"] }
      ,
      sex: { 
        type: String, 
        enum: ["male", "female"], 
      },
      profilePicture: { 
        type: String, 
        default: ""
      },
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);