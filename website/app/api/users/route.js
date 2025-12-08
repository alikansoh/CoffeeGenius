import { NextResponse } from 'next/server';
import { createUser, getAllUsers } from '@/controllers/userController';
import { verifyToken } from '@/middleware/verifyToken';

// App Router (route.js) handlers using next/server
export async function GET(request) {
  // 🔐 Verify token before any method
  const user = verifyToken(request);
  // if (!user) {
  //   return NextResponse.json({ error: 'Unauthorized: Invalid or missing token' }, { status: 401 });
  // }

  try {
    const users = await getAllUsers();
    const res = NextResponse.json(users);
    res.headers.set('Last-Modified', new Date().toUTCString());
    return res;
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  // 🔐 Verify token before any method
  // const user = verifyToken(request);
  // if (!user) {
  //   return NextResponse.json({ error: 'Unauthorized: Invalid or missing token' }, { status: 401 });
  // }

  try {
    const body = await request.json();
    const id = await createUser(body);
    const res = NextResponse.json({ message: 'User created', id }, { status: 201 });
    res.headers.set('Last-Modified', new Date().toUTCString());
    return res;
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}