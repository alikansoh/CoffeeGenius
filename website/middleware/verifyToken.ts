import jwt from "jsonwebtoken";
import { NextApiRequest } from "next";

const SECRET = process.env.JWT_SECRET || "your-secret-key";

export function verifyToken(req: NextApiRequest): string | object | null {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null; // No token provided
  }

  const token = authHeader.split(" ")[1]; 
  if (!token) {
    return null; 
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    return decoded;
  } catch (err) {
    console.error("JWT verification failed:", err);
    return null;
  }
}