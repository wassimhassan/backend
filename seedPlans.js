const mongoose = require("mongoose");
const Plan = require("./models/Plan");
const dotenv = require("dotenv");

require('dotenv').config();

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        await Plan.deleteMany();
        await Plan.create([
            { name: "basic", bookings: 8, basePrice: 29.99 },
            { name: "premium", bookings: 15, basePrice: 49.99 },
            { name: "pro", bookings: 25, basePrice: 79.99 }
        ]);
        console.log("Plans seeded successfully.");
        mongoose.connection.close();
    })
    .catch(err => console.error("Error seeding plans:", err));
