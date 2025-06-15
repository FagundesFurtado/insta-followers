import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function POST(request: Request) {
  try {
    const { username } = await request.json();

    if (!username) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      );
    }

    // Read current accounts
    const accountsPath = path.join(process.cwd(), "data", "accounts.json");
    const accountsData = await fs.readFile(accountsPath, "utf-8");
    const accounts = JSON.parse(accountsData);

    // Check if account already exists
    if (accounts.includes(username)) {
      return NextResponse.json(
        { error: "Account already exists" },
        { status: 400 }
      );
    }

    // Add new account
    accounts.push(username);

    // Write updated accounts
    await fs.writeFile(accountsPath, JSON.stringify(accounts, null, 2));

    // Create initial data file for the account
    const accountDataPath = path.join(process.cwd(), "data", `${username}.json`);
    const initialData = {
      history: [
        {
          date: new Date().toISOString().split("T")[0],
          followers: 0,
        },
      ],
    };

    await fs.writeFile(accountDataPath, JSON.stringify(initialData, null, 2));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding account:", error);
    return NextResponse.json(
      { error: "Failed to add account" },
      { status: 500 }
    );
  }
} 