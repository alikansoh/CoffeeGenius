import mongoose from "mongoose";

const ReviewSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  author_name: String,
  author_url: String,
  rating: Number,
  text: String,
  relative_time_description: String,
  profile_photo_url: String,
  time: Number,
});

const PlaceSchema = new mongoose.Schema({
  place_name: String,
  place_url: String,
  rating: Number,
  user_ratings_total: Number,
  reviews: [ReviewSchema],
  fetched_at: Date,
  cached_until: Date, // For informational purposes
});

export default mongoose.models.Place || mongoose.model("Place", PlaceSchema);