const Booking = require("../models/Booking");
const Payment = require("../models/Payment");

const getOutstandingGymPayments = async (clientId) => {
  const bookings = await Booking.find({ clientId }).lean();
  const payments = await Payment.find({ clientId, method: "cash" }).lean();

  // Optional: Fetch actual hourly rate from Trainer if dynamic
  const totalBooked = bookings.length * 50;
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  return totalBooked - totalPaid;
};

module.exports = { getOutstandingGymPayments };
