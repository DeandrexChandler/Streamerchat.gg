import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json({ user: null });
    }
    
    // TODO: Fetch full user details from database
    return NextResponse.json({
      user: {
        id: user.userId,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json({ user: null });
  }
}
