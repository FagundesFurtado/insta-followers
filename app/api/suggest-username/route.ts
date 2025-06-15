import { NextResponse } from "next/server";

async function searchInstagramUsers(query: string) {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  
  if (!accessToken) {
    throw new Error("Instagram access token not configured");
  }

  try {
    const response = await fetch(
      `https://graph.instagram.com/v12.0/search?q=${encodeURIComponent(query)}&type=user&access_token=${accessToken}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Instagram API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data.map((user: any) => user.username).slice(0, 5);
  } catch (error) {
    console.error("Error fetching from Instagram API:", error);
    throw new Error("Failed to fetch suggestions from Instagram");
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    
    if (!query) {
      return NextResponse.json({ suggestions: [] });
    }

    const suggestions = await searchInstagramUsers(query);
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Error fetching suggestions:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch suggestions" },
      { status: 500 }
    );
  }
} 