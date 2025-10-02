import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "./card";
import { Button } from "./button";

interface AccountManagerProps {
  accounts: string[];
  onAddAccount: (username: string) => Promise<void>;
  onDeleteAccount: (username: string) => Promise<void>;
  deviceUuid: string;
  isDeviceAuthorized: boolean;
  isValidatingDevice: boolean;
  storageError: string | null;
  storageSupported: boolean;
}

export function AccountManager({
  accounts,
  onAddAccount,
  onDeleteAccount,
  deviceUuid,
  isDeviceAuthorized,
  isValidatingDevice,
  storageError,
  storageSupported,
}: AccountManagerProps) {
  const [newAccount, setNewAccount] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [isDeviceAuthorized]);

  const handleCopyUuid = async () => {
    if (!deviceUuid) {
      setCopyStatus('UUID não gerado ainda.');
      return;
    }
    try {
      if (navigator.clipboard && 'writeText' in navigator.clipboard) {
        await navigator.clipboard.writeText(deviceUuid);
        setCopyStatus('Copiado para a área de transferência.');
      } else {
        throw new Error('Clipboard API indisponível.');
      }
    } catch (copyError) {
      console.warn('Failed to copy device UUID.', copyError);
      setCopyStatus('Copie manualmente: ' + deviceUuid);
    }

    setTimeout(() => setCopyStatus(null), 3000);
  };

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
        <div className="space-y-3 rounded-lg border border-gray-200 p-4 bg-gray-50">
          <h3 className="text-sm font-semibold text-slate-700">Device authorization</h3>
          <p className="text-sm text-gray-600">
            Este dispositivo possui o UUID abaixo. Cadastre-o na tabela <code>admin_devices</code> para habilitar as ações administrativas.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="flex-1 break-all rounded-md bg-white px-3 py-2 text-sm border border-gray-200">
              {deviceUuid || 'Gerando UUID...' }
            </code>
            <Button onClick={handleCopyUuid} variant="outline" disabled={!deviceUuid}>
              Copiar UUID
            </Button>
          </div>
          <div className="flex items-center gap-3 text-xs flex-wrap">
            {isValidatingDevice ? (
              <span className="text-gray-500">Validando dispositivo…</span>
            ) : isDeviceAuthorized ? (
              <span className="text-green-600">Dispositivo autorizado. Você pode gerenciar contas.</span>
            ) : (
              <span className="text-red-500">UUID ausente ou não autorizado. As ações de gerenciamento estão desabilitadas.</span>
            )}
            {!storageSupported && (
              <span className="text-amber-600">
                Este navegador bloqueou o armazenamento local. O UUID será necessário em cada sessão até que as permissões sejam ajustadas.
              </span>
            )}
          </div>
          {storageError && (
            <p className="text-xs text-red-500">{storageError}</p>
          )}
          {copyStatus && (
            <p className="text-xs text-blue-600">{copyStatus}</p>
          )}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newAccount}
            onChange={(e) => setNewAccount(e.target.value)}
            placeholder="Enter Instagram username"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            onKeyDown={(e) => {
              if (e.key === "Enter" && isDeviceAuthorized) {
                handleAddAccount();
              }
            }}
          />
          <Button
            onClick={handleAddAccount}
            isLoading={isAdding}
            disabled={!isDeviceAuthorized || !newAccount.trim() || isAdding}
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
                disabled={!isDeviceAuthorized}
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
