import { NextResponse } from 'next/server';
import pool, { ensureSchema } from '@/lib/db';
import { isDeviceAuthorized } from '@/lib/auth';

export async function POST(request: Request) {
  const { username } = await request.json();

  if (!username) {
    return new NextResponse('Username is required', { status: 400 });
  }

  try {
    const normalizedUsername = String(username).trim().toLowerCase();

    const deviceUuid = request.headers.get('x-device-uuid');
    if (!(await isDeviceAuthorized(deviceUuid))) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    await ensureSchema();

    const result = await pool.query(
      `UPDATE accounts
       SET is_deleted = TRUE,
           deleted_at = NOW()
       WHERE username = $1
         AND is_deleted = FALSE
       RETURNING id`,
      [normalizedUsername]
    );

    if (result.rows.length > 0) {
      return new NextResponse('Account deleted successfully', { status: 200 });
    }

    const alreadyDeleted = await pool.query('SELECT id FROM accounts WHERE username = $1', [normalizedUsername]);

    if (alreadyDeleted.rows.length > 0) {
      return new NextResponse('Account already deleted', { status: 200 });
    }

    return new NextResponse('Account not found', { status: 404 });
  } catch (error) {
    console.error('Error deleting account:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
