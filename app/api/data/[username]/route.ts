import { NextResponse, NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(request: NextRequest, context: any) {
  const { username } = context.params;

  try {
    const filePath = path.join(process.cwd(), 'public', 'data', `${username}.json`);
    const fileContents = await fs.readFile(filePath, 'utf8');
    const userData = JSON.parse(fileContents);

    if (userData) {
      return NextResponse.json(userData);
    } else {
      return new NextResponse('User data not found', { status: 404 });
    }
  } catch (error) {
    console.error('Error fetching user data:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

