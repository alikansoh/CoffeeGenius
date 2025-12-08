import jwt from 'jsonwebtoken';
import { authenticateUser } from '@/controllers/userController';
import { NextRequest, NextResponse } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const user = await authenticateUser(body);

    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is not defined');
    }

    // Create token
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Create response and set httpOnly cookie (browser will store it)
    const res = NextResponse.json({ message: 'Login successful' });

    // Use sameSite/lax and secure in production to mitigate CSRF & ensure cookie is sent over HTTPS
    res.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24, // 1 day in seconds
    });

    return res;
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }
}