const mongoose = require('mongoose');
const GymOwner = require('./models/GymOwner'); // Adjust path as necessary
const User = require('./models/User'); // Adjust path as necessary
const dotenv = require('dotenv'); // For loading environment variables
dotenv.config(); // If using environment variables

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((err) => {
    console.error('Error connecting to MongoDB:', err);
  });

async function setGymOwnerForAllUsers() {
  try {
    // Fetch the gym owner you want to link clients to
    const gymOwner = await GymOwner.findOne(); // Assuming there's only one gym owner
    if (!gymOwner) {
      console.error('No gym owner found in the database!');
      return;
    }

    // Set gymOwnerId for all users
    const updatedUsers = await User.updateMany(
      {},
      { $set: { gymOwnerId: gymOwner._id } }
    );

    console.log(`Updated ${updatedUsers.nModified} users with the gymOwnerId.`);
  } catch (error) {
    console.error('Error updating users:', error);
  } finally {
    mongoose.connection.close();
  }
}

setGymOwnerForAllUsers();
