const mongoose = require("mongoose");

const planSchema = new mongoose.Schema({
    name: { type: String, required: true },
    bookings: { type: Number, required: true },
    basePrice: { type: Number, required: true }
});

const Plan = mongoose.model("Plan", planSchema);
module.exports = Plan;
