const express = require("express");//Web framework to handle routes and requests.
const dotenv = require("dotenv"); //Loads environment variables from .env file.
const mongoose = require("mongoose"); //Used to interact with MongoDB.
const cors = require("cors"); //Allows cross-origin requests (important for frontend-backend communication).

dotenv.config(); //loads variables from .env.

const app = express();
app.use(cors()); //allows API calls from different domains.
app.use(express.json()); // enables parsing JSON in requests.

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.error(err));

// Import routes
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
