import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import dbConnect from '@/lib/dbConnect';
import User from '@/models/User';

async function connect() {
  await dbConnect();
}

export async function getAllUsers() {
  await connect();
  return await User.find({}, '-password').lean();
}

export async function getUserById(id: string) {
  await connect();
  if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('Invalid user ID');
  return await User.findById(id).select('-password').lean();
}

export async function createUser({ username, password }: { username: string; password: string }) {
  await connect();

  const existing = await User.findOne({ username });
  if (existing) throw new Error('User already exists');

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ username, password: hashedPassword });
  await user.save();

  return user._id;
}

type UpdateUserData = {
  username?: string;
  password?: string;
};

export async function updateUser(id: string, data: UpdateUserData) {
  await connect();
  if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('Invalid user ID');

  const update: UpdateUserData = {};
  if (data.username) update.username = data.username;
  if (data.password) update.password = await bcrypt.hash(data.password, 10);

  await User.findByIdAndUpdate(id, update);
}

export async function deleteUser(id: string) {
  await connect();
  if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('Invalid user ID');

  await User.findByIdAndDelete(id);
}

export async function authenticateUser({ username, password }: { username: string; password: string }) {
  await connect();

  const user = await User.findOne({ username });
  if (!user) throw new Error('Invalid credentials');

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error('Invalid credentials');

  // Return user without password
  const { password: _, ...userWithoutPassword } = user.toObject();
  return userWithoutPassword;
}