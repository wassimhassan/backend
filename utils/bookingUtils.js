const Subscription = require("../models/Subscription");
const Booking = require("../models/Booking");

async function validateBookingLimit(clientId, sessionDate) {
    const now = sessionDate || new Date();
    
    const subscription = await Subscription.findOne({
        clientId,
        status: "active",
        startDate: { $lte: now },
        endDate: { $gte: now }
    });

    if (!subscription) {
        return {
            allowed: false,
            reason: "no_subscription"
        };
    }

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const bookingCount = await Booking.countDocuments({
        clientId,
        sessionTime: { $gte: startOfMonth, $lte: endOfMonth }
    });

    if (bookingCount >= subscription.maxBookingsPerMonth) {
        return {
            allowed: false,
            reason: "limit_exceeded"
        };
    }

    return {
        allowed: true,
        subscription
    };
}

module.exports = { validateBookingLimit };
