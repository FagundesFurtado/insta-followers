import { useState } from "react";
import { Card, CardContent, CardHeader } from "./card";
import { Button } from "./button";

interface AccountManagerProps {
  accounts: string[];
  onAddAccount: (username: string) => Promise<void>;
  onDeleteAccount: (username: string) => Promise<void>;
}

export function AccountManager({ accounts, onAddAccount, onDeleteAccount }: AccountManagerProps) {
  const [newAccount, setNewAccount] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddAccount = async () => {
    if (!newAccount.trim()) return;
    
    setError(null);
    setIsAdding(true);
    
    try {
      await onAddAccount(newAccount.trim());
      setNewAccount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add account");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteAccount = async (username: string) => {
    if (!confirm(`Are you sure you want to delete @${username}?`)) return;
    
    setError(null);
    try {
      await onDeleteAccount(username);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
    }
  };

  return (
    <Card variant="elevated" padding="lg">
      <CardHeader
        title="Manage Accounts"
        description="Add or remove Instagram accounts to track"
      />
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={newAccount}
            onChange={(e) => setNewAccount(e.target.value)}
            placeholder="Enter Instagram username"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            onKeyDown={(e) => e.key === "Enter" && handleAddAccount()}
          />
          <Button
            onClick={handleAddAccount}
            isLoading={isAdding}
            disabled={!newAccount.trim() || isAdding}
          >
            Add Account
          </Button>
        </div>

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        <div className="space-y-2">
          {accounts.map((account) => (
            <div
              key={account}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <span className="font-medium">@{account}</span>
              <Button
                variant="ghost"
                onClick={() => handleDeleteAccount(account)}
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
              >
                Delete
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
} 