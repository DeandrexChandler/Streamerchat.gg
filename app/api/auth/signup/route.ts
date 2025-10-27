import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createToken, setAuthCookie } from '@/lib/auth';

// TODO: Replace with real database
// This is a mock user store for development
const MOCK_USERS = new Map<string, { id: string; email: string; password: string; name: string }>();

export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json();
    
    // Validation
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }
    
    // Check if user exists
    if (MOCK_USERS.has(email)) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 400 }
      );
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    // TODO: Save to real database (Postgres/Supabase)
    const userId = crypto.randomUUID();
    MOCK_USERS.set(email, {
      id: userId,
      email,
      password: hashedPassword,
      name
    });
    
    // Create JWT token
    const token = await createToken(userId, email);
    
    // Set cookie
    await setAuthCookie(token);
    
    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email,
        name
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
