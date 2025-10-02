import { NextResponse, NextRequest } from 'next/server';
import pool, { ensureSchema } from '@/lib/db';

export async function GET(request: NextRequest) {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  const username = segments[segments.length - 1] ?? '';
  const normalizedUsername = username.trim().toLowerCase();

  try {
    if (!normalizedUsername) {
      return new NextResponse('Username is required', { status: 400 });
    }

    await ensureSchema();

    const accountResult = await pool.query<{ id: number; username: string }>(
      'SELECT id, username FROM accounts WHERE username = $1',
      [normalizedUsername]
    );

    if (accountResult.rows.length === 0) {
      return new NextResponse('User data not found', { status: 404 });
    }

    const account = accountResult.rows[0];

    const historyResult = await pool.query<{
      date: string;
      followers: number;
      following: number | null;
    }>(
      `SELECT date::text AS date, followers, following
       FROM follower_history
       WHERE account_id = $1
       ORDER BY date ASC`,
      [account.id]
    );

    const followersResult = await pool.query<{
      username: string;
      full_name: string | null;
      profile_pic_url: string | null;
      is_private: boolean | null;
      is_verified: boolean | null;
      fetched_at: string;
    }>(
      `SELECT
         follower_username AS username,
         full_name,
         profile_pic_url,
         is_private,
         is_verified,
         fetched_at::text AS fetched_at
       FROM account_followers
       WHERE account_id = $1
       ORDER BY follower_username ASC`,
      [account.id]
    );

    return NextResponse.json({
      username: account.username,
      history: historyResult.rows,
      followers: followersResult.rows,
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
