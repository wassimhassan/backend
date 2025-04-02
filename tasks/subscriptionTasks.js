const Subscription = require("../models/Subscription");
const User = require("../models/User");
const cron = require("node-cron");

// ✅ Function to send a notification (You can replace this with actual email/SMS logic)
const sendExpirationNotification = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      console.warn(`User not found for notification: ${userId}`);
      return;
    }

    console.log(`📢 Notification: Subscription expired for ${user.username} (${user.email})`);
    // Implement email/SMS notification logic here
  } catch (error) {
    console.error(`Error sending notification to user ${userId}:`, error);
  }
};

// ✅ Function to update expired subscriptions
const updateSubscriptionStatuses = async () => {
  try {
    const expiredSubscriptions = await Subscription.find({
      endDate: { $lt: new Date() },
      status: "active",
    });

    if (expiredSubscriptions.length === 0) {
      console.log("✅ No expired subscriptions found.");
      return;
    }

    console.log(`⚠️ Found ${expiredSubscriptions.length} expired subscriptions. Updating...`);

    const clientIds = expiredSubscriptions.map((sub) => sub.clientId);

    // 🔹 Bulk update subscriptions
    await Subscription.updateMany(
      { _id: { $in: expiredSubscriptions.map((sub) => sub._id) } },
      { $set: { status: "expired" } }
    );

    // 🔹 Bulk update user subscription status
    await User.updateMany(
      { _id: { $in: clientIds } },
      { $set: { subscriptionStatus: "expired" } }
    );

    console.log("✅ All expired subscriptions updated successfully.");

    // 🔹 Send notifications
    for (const clientId of clientIds) {
      sendExpirationNotification(clientId);
    }
  } catch (error) {
    console.error("❌ Error updating subscription statuses:", error);
  }
};

// ✅ Scheduled Task: Runs every day at midnight
const scheduleSubscriptionTasks = () => {
  cron.schedule("0 0 * * *", async () => {
    console.log("🔄 Running scheduled subscription status update...");
    await updateSubscriptionStatuses();
  });
};

module.exports = { updateSubscriptionStatuses, scheduleSubscriptionTasks };
