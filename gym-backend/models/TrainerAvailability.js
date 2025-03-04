const mongoose = require("mongoose");

const TrainerAvailabilitySchema = new mongoose.Schema({
    trainerId: { type: mongoose.Schema.Types.ObjectId, ref: "Trainer", required: true },
    availableSlots: [{
        day: { type: String, required: true },  
        time: [{ type: Date, required: true }] 
    }]
}, { timestamps: true });

module.exports = mongoose.model("TrainerAvailability", TrainerAvailabilitySchema);
