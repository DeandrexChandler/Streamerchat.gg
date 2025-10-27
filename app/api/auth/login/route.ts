import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createToken, setAuthCookie } from '@/lib/auth';

// TODO: Import from shared user store or database
// This references the same mock store as signup
const MOCK_USERS = new Map<string, { id: string; email: string; password: string; name: string }>();

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    
    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Missing email or password' },
        { status: 400 }
      );
    }
    
    // Find user
    // TODO: Query from real database
    const user = MOCK_USERS.get(email);
    
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }
    
    // Create JWT token
    const token = await createToken(user.id, user.email);
    
    // Set cookie
    await setAuthCookie(token);
    
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
