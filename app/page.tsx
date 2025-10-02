"use client";

import { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
  Filler,
  Title
} from "chart.js";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { AccountManager } from "../components/ui/account-manager";

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend, Filler, Title);

const MAX_FOLLOWERS_DISPLAY = 200;

type DateRangeOption = '7d' | '15d' | '30d' | '90d' | '365d' | 'all';

const DATE_RANGE_OPTIONS: Array<{ value: DateRangeOption; label: string; days?: number }> = [
  { value: '7d', label: 'Últimos 7 dias', days: 7 },
  { value: '15d', label: 'Últimos 15 dias', days: 15 },
  { value: '30d', label: 'Último mês', days: 30 },
  { value: '90d', label: 'Últimos 3 meses', days: 90 },
  { value: '365d', label: 'Último ano', days: 365 },
  { value: 'all', label: 'Tudo' },
];

const RANGE_DAYS_MAP: Record<DateRangeOption, number | null> = {
  '7d': 7,
  '15d': 15,
  '30d': 30,
  '90d': 90,
  '365d': 365,
  all: null,
};

interface FollowerData {
  date: string;
  followers: number;
  following?: number;
}

interface FollowerDetail {
  username: string;
  fullName?: string | null;
  profilePicUrl?: string | null;
  isPrivate?: boolean | null;
  isVerified?: boolean | null;
  fetchedAt?: string | null;
}

interface AccountData {
  username: string;
  history: FollowerData[];
  followers: FollowerDetail[];
}

export default function Home() {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [accountsData, setAccountsData] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAccountManager, setShowAccountManager] = useState(false);
  const [metric, setMetric] = useState<'followers' | 'following'>('followers');
  const [dateRange, setDateRange] = useState<DateRangeOption>('all');
  const [deviceUuid, setDeviceUuid] = useState('');
  const [isDeviceAuthorized, setIsDeviceAuthorized] = useState(false);
  const [isValidatingDevice, setIsValidatingDevice] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storageSupported, setStorageSupported] = useState(true);

  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      setAccounts(data);
    } catch (err) {
      console.error("Failed to fetch accounts:", err);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let detectedUuid = '';

    try {
      const storedUuid = window.localStorage.getItem('device-uuid');
      if (storedUuid && storedUuid.trim().length > 0) {
        detectedUuid = storedUuid;
      } else if (window.crypto && 'randomUUID' in window.crypto) {
        detectedUuid = window.crypto.randomUUID();
        window.localStorage.setItem('device-uuid', detectedUuid);
      }
      setStorageSupported(true);
      setStorageError(null);
    } catch (storageAccessError) {
      console.warn('Local storage is not accessible in this context.', storageAccessError);
      setStorageSupported(false);
      setStorageError('Não foi possível acessar o armazenamento local. O UUID deste dispositivo será gerado para esta sessão apenas.');

      if (window.crypto && 'randomUUID' in window.crypto) {
        detectedUuid = window.crypto.randomUUID();
      }
    }

    if (detectedUuid) {
      setDeviceUuid(detectedUuid);
    }
  }, []);

  const validateDeviceUuid = async (uuid: string) => {
    if (!uuid.trim()) {
      setIsDeviceAuthorized(false);
      return;
    }

    setIsValidatingDevice(true);
    try {
      const res = await fetch('/api/admin/device/verify', {
        headers: {
          'x-device-uuid': uuid,
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to validate device (${res.status})`);
      }

      const data = await res.json();
      setIsDeviceAuthorized(Boolean(data.authorized));
    } catch (validationError) {
      console.error('Failed to validate device uuid:', validationError);
      setIsDeviceAuthorized(false);
    } finally {
      setIsValidatingDevice(false);
    }
  };

  useEffect(() => {
    if (!deviceUuid) {
      setIsDeviceAuthorized(false);
      return;
    }

    validateDeviceUuid(deviceUuid);
  }, [deviceUuid]);

  useEffect(() => {
    if (selectedAccounts.length > 0) {
      setLoading(true);
      setError(null);

      const fetchPromises = selectedAccounts.map(async (username) => {
        try {
          const res = await fetch(`/api/data/${username}`);
          if (!res.ok) {
            throw new Error(`No data file found for ${username}`);
          }
          const data = await res.json();
          const followers: FollowerDetail[] = Array.isArray(data.followers)
            ? data.followers.reduce((acc: FollowerDetail[], follower: Record<string, unknown>) => {
                const username = String(follower.username ?? '').trim();
                if (!username) {
                  return acc;
                }

                acc.push({
                  username,
                  fullName: (follower.full_name as string | undefined) ?? null,
                  profilePicUrl: (follower.profile_pic_url as string | undefined) ?? null,
                  isPrivate: follower.is_private as boolean | undefined,
                  isVerified: follower.is_verified as boolean | undefined,
                  fetchedAt: (follower.fetched_at as string | undefined) ?? null,
                });
                return acc;
              }, [])
            : [];

          return { username, history: data.history ?? [], followers };
        } catch (err) {
          throw new Error(`Failed to fetch data for ${username}`);
        }
      });

      Promise.all(fetchPromises)
        .then((data) => {
          setAccountsData(data);
        })
        .catch((err) => {
          setError(err.message);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [selectedAccounts]);

  const handleAddAccount = async (username: string) => {
    if (!isDeviceAuthorized) {
      setError('UUID de dispositivo não autorizado.');
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/accounts/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-uuid": deviceUuid,
        },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('UUID de dispositivo inválido ou não autorizado.');
        }
        throw new Error(`Failed to add account: ${res.statusText}`);
      }
      await fetchAccounts(); // Re-fetch accounts after adding
    } catch (error) {
      console.error("Error adding account:", error);
      setError(`Error adding account: ${(error as Error).message}`);
    }
  };

  const handleDeleteAccount = async (username: string) => {
    if (!isDeviceAuthorized) {
      setError('UUID de dispositivo não autorizado.');
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/accounts/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-uuid": deviceUuid,
        },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('UUID de dispositivo inválido ou não autorizado.');
        }
        throw new Error(`Failed to delete account: ${res.statusText}`);
      }
      await fetchAccounts(); // Re-fetch accounts after deleting
      setSelectedAccounts((prev) => prev.filter((acc) => acc !== username));
    } catch (error) {
      console.error("Error deleting account:", error);
      setError(`Error deleting account: ${(error as Error).message}`);
    }
  };

  const filterHistoryByRange = (history: FollowerData[]): FollowerData[] => {
    const rangeDays = RANGE_DAYS_MAP[dateRange];
    if (!rangeDays) {
      return history;
    }

    const threshold = new Date();
    threshold.setHours(0, 0, 0, 0);
    threshold.setDate(threshold.getDate() - (rangeDays - 1));

    return history.filter((entry) => {
      const entryDate = new Date(`${entry.date}T00:00:00Z`);
      if (Number.isNaN(entryDate.getTime())) {
        return false;
      }
      return entryDate >= threshold;
    });
  };

  const filteredAccountsData = accountsData.map((account) => ({
    ...account,
    history: filterHistoryByRange(account.history),
  }));

  const referenceAccount = filteredAccountsData.find((account) => account.history.length > 0);
  const labels = referenceAccount?.history.map((h) => h.date) ?? [];
  const hasDataForRange = filteredAccountsData.some((account) => account.history.length > 0);

  const colors = [
    { border: 'rgb(59, 130, 246)', background: 'rgba(59, 130, 246, 0.1)' },
    { border: 'rgb(16, 185, 129)', background: 'rgba(16, 185, 129, 0.1)' },
    { border: 'rgb(245, 158, 11)', background: 'rgba(245, 158, 11, 0.1)' },
    { border: 'rgb(239, 68, 68)', background: 'rgba(239, 68, 68, 0.1)' },
    { border: 'rgb(139, 92, 246)', background: 'rgba(139, 92, 246, 0.1)' },
  ];

  const chartData = {
    labels,
    datasets: filteredAccountsData.map((account, index) => ({
      label: `@${account.username}`,
      data: account.history.map((h) => metric === 'followers' ? h.followers : h.following ?? 0),
      borderWidth: 2,
      fill: true,
      backgroundColor: colors[index % colors.length].background,
      borderColor: colors[index % colors.length].border,
      tension: 0.4,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: colors[index % colors.length].border,
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
    })),
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12,
            weight: 'normal' as const,
          },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        titleColor: '#1e293b',
        bodyColor: '#1e293b',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        padding: 12,
        boxPadding: 6,
        usePointStyle: true,
        callbacks: {
          label: function(context: any) {
            return `${context.dataset.label}: ${context.parsed.y.toLocaleString()} ${metric}`;
          }
        }
      },
      title: {
        display: true,
        text: metric === 'followers' ? 'Follower Growth Comparison' : 'Following Growth Comparison',
        font: {
          size: 16,
          weight: 'bold' as const,
        },
        padding: {
          top: 10,
          bottom: 20,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(226, 232, 240, 0.5)',
        },
        ticks: {
          callback: function(value: any) {
            return value.toLocaleString();
          },
          font: {
            size: 11,
            weight: 'normal' as const,
          },
        },
      },
      x: {
        grid: {
          display: false,
        },
        ticks: {
          font: {
            size: 11,
            weight: 'normal' as const,
          },
        },
      },
    },
  };

  const toggleAccount = (username: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(username)
        ? prev.filter((acc) => acc !== username)
        : [...prev, username]
    );
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-white px-4 py-8 sm:px-6 sm:py-12">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl sm:text-5xl font-black text-blue-700">
            Instagram Tracker
          </h1>
          <p className="text-gray-600 text-lg">
            Compare Instagram follower growth over time
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => setShowAccountManager(!showAccountManager)}
          >
            {showAccountManager ? "Hide Account Manager" : "Manage Accounts"}
          </Button>
        </div>

        {showAccountManager && (
        <AccountManager
          accounts={accounts}
          onAddAccount={handleAddAccount}
          onDeleteAccount={handleDeleteAccount}
          deviceUuid={deviceUuid}
          isDeviceAuthorized={isDeviceAuthorized}
          isValidatingDevice={isValidatingDevice}
          storageError={storageError}
          storageSupported={storageSupported}
        />
      )}

        <Card variant="elevated" padding="lg">
          <CardHeader
            title="Select Accounts"
            description="Choose accounts to compare their follower growth"
          />
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {accounts.map((acc) => (
                <Button
                  key={acc}
                  variant={selectedAccounts.includes(acc) ? "default" : "outline"}
                  onClick={() => toggleAccount(acc)}
                  className="min-w-[100px]"
                >
                  @{acc}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {selectedAccounts.length > 0 && (
          <>
            <Card variant="elevated" padding="lg">
              <CardContent>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div className="flex flex-wrap gap-2">
                    {DATE_RANGE_OPTIONS.map((option) => (
                      <Button
                        key={option.value}
                        variant={dateRange === option.value ? 'default' : 'outline'}
                        onClick={() => setDateRange(option.value)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={metric === 'followers' ? 'default' : 'outline'}
                      onClick={() => setMetric('followers')}
                      className="mr-2"
                    >
                      Followers
                    </Button>
                    <Button
                      variant={metric === 'following' ? 'default' : 'outline'}
                      onClick={() => setMetric('following')}
                    >
                      Following
                    </Button>
                  </div>
                </div>
                <div className="h-[500px]">
                  {loading ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
                    </div>
                  ) : error ? (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-red-500">{error}</p>
                    </div>
                  ) : !hasDataForRange ? (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-gray-500 text-center">
                        Nenhum dado disponível para o período selecionado.
                      </p>
                    </div>
                  ) : (
                    <Line data={chartData} options={chartOptions} />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card variant="elevated" padding="lg">
              <CardHeader
                title="Followers Snapshot"
                description="Most recent follower lists captured for each selected account"
              />
              <CardContent>
                {loading ? (
                  <div className="h-48 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
                  </div>
                ) : error ? (
                  <p className="text-red-500">{error}</p>
                ) : accountsData.length === 0 ? (
                  <p className="text-sm text-gray-500">No follower data recorded yet.</p>
                ) : (
                  <div className="grid gap-6 md:grid-cols-2">
                    {accountsData.map((account) => {
                      const followerCount = account.followers.length;
                      const lastFetchedTimestamp = account.followers.reduce<number | null>((latest, follower) => {
                        if (!follower.fetchedAt) {
                          return latest;
                        }
                        const timestamp = Date.parse(follower.fetchedAt);
                        if (Number.isNaN(timestamp)) {
                          return latest;
                        }
                        if (latest === null || timestamp > latest) {
                          return timestamp;
                        }
                        return latest;
                      }, null);

                      const formattedLastFetched = lastFetchedTimestamp
                        ? new Date(lastFetchedTimestamp).toLocaleString()
                        : 'Not synced yet';

                      const visibleFollowers = account.followers.slice(0, MAX_FOLLOWERS_DISPLAY);
                      const hiddenFollowers = followerCount - visibleFollowers.length;

                      return (
                        <div key={account.username} className="space-y-3">
                          <div className="flex items-baseline justify-between">
                            <h3 className="text-lg font-semibold text-slate-800">@{account.username}</h3>
                            <span className="text-sm text-gray-500">
                              {followerCount.toLocaleString()} follower{followerCount === 1 ? '' : 's'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">Last updated: {formattedLastFetched}</p>
                          <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-sm">
                            {visibleFollowers.length === 0 ? (
                              <p className="p-4 text-sm text-gray-500">Followers not captured yet. Run the updater to fetch this list.</p>
                            ) : (
                              visibleFollowers.map((follower) => (
                                <div
                                  key={`${account.username}-${follower.username}`}
                                  className="flex items-center justify-between gap-4 border-b border-gray-100 px-4 py-3 last:border-b-0"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-slate-700">@{follower.username}</p>
                                    {follower.fullName && (
                                      <p className="truncate text-sm text-gray-500">{follower.fullName}</p>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end gap-1 text-xs text-gray-500">
                                    {follower.isVerified && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-blue-600">
                                        Verified
                                      </span>
                                    )}
                                    {follower.isPrivate && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">
                                        Private
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                          {hiddenFollowers > 0 && (
                            <p className="text-xs text-gray-500">
                              +{hiddenFollowers.toLocaleString()} more follower{hiddenFollowers === 1 ? '' : 's'} not shown.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
