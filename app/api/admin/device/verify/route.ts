import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { isDeviceAuthorized } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const deviceUuid = request.headers.get('x-device-uuid')
      ?? request.nextUrl.searchParams.get('deviceUuid');

    await ensureSchema();
    const authorized = await isDeviceAuthorized(deviceUuid);

    return NextResponse.json({ authorized });
  } catch (error) {
    console.error('Error verifying device UUID:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
