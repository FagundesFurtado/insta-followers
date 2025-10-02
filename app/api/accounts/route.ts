import { NextResponse } from 'next/server';
import pool, { ensureSchema } from '@/lib/db';

export async function GET() {
  try {
    await ensureSchema();

    const { rows } = await pool.query<{ username: string }>(
      'SELECT username FROM accounts WHERE is_deleted = FALSE ORDER BY username ASC'
    );

    const usernames = rows.map(({ username }: { username: string }) => username);
    return NextResponse.json(usernames);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
