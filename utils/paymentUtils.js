const Booking = require("../models/Booking");
const Payment = require("../models/Payment");

const getOutstandingGymPayments = async (clientId) => {
  // Get all unpaid bookings
  const unpaidBookings = await Booking.find({
      clientId,
      paymentStatus: { $ne: "paid" }
  }).lean();

  // Calculate total amount due from unpaid bookings
  const totalDue = unpaidBookings.reduce((sum, booking) => 
      sum + (booking.sessionCost || 50), 0);

  return Math.max(0, totalDue);
};

module.exports = { getOutstandingGymPayments };
