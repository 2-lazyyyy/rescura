import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    // Custom plaintext auth for Next.js API
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('password', password)
      .maybeSingle()

    if (userError || !userRecord) {
      // If not in users, check organizations
      const { data: orgRecord, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .maybeSingle()

      if (orgError || !orgRecord) {
        return NextResponse.json(
          { success: false, error: 'Invalid credentials' },
          { status: 401 }
        )
      }

      return NextResponse.json({
        success: true,
        user: {
          id: orgRecord.id,
          email: orgRecord.email,
          name: orgRecord.name,
          role: 'organization',
          phone: orgRecord.phone,
          organizationId: orgRecord.id,
          image: null,
        },
        session: null // Custom auth doesn't use Supabase Auth sessions
      })
    }

    return NextResponse.json({
      success: true,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name,
        role: userRecord.is_admin ? 'admin' : 'user',
        phone: userRecord.phone,
        organizationId: null,
        image: userRecord.image,
      },
      session: null
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { success: false, error: 'Login failed' },
      { status: 500 }
    )
  }
}

