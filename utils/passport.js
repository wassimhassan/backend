const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const GymOwner = require("../models/GymOwner");

dotenv.config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.BACKEND_URL}/api/auth/google/callback`,
      passReqToCallback: true
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        console.log("Google login attempt for:", profile.id);
        const email = profile.emails?.[0]?.value;

        let user = await User.findOne({ googleId: profile.id });
        if (user) return done(null, user);

        user = await User.findOne({ email });
        if (user) {
          user.googleId = profile.id;
          await user.save();
          return done(null, user);
        }

        const gymOwner = await GymOwner.findOne();
        if (!gymOwner) return done(new Error("No gym owner found"), null);

        const baseUsername = email?.split('@')[0] || profile.displayName?.replace(/\s+/g, '').toLowerCase() || 'user';
        const timestamp = Date.now().toString().slice(-5);
        const username = `${baseUsername}${timestamp}`;

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(Math.random().toString(36) + Date.now().toString(), salt);

        const newUser = new User({
          googleId: profile.id,
          username,
          email,
          password: hashedPassword,
          name: profile.displayName,
          profilePicture: profile.photos?.[0]?.value || "",
          gymOwnerId: gymOwner._id,
          height: 0,
          weight: 0,
          workoutDaysPerWeek: 3,
          goal: ["general fitness"]
        });

        await newUser.save();
        return done(null, newUser);
      } catch (error) {
        console.error("Google OAuth Error:", error);
        return done(error, null);
      }
    }
  )
);

module.exports = passport;