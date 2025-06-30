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

interface FollowerData {
  date: string;
  followers: number;
  following?: number;
}

interface AccountData {
  username: string;
  history: FollowerData[];
}

export default function Home() {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [accountsData, setAccountsData] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAccountManager, setShowAccountManager] = useState(false);
  const [metric, setMetric] = useState<'followers' | 'following'>('followers');

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
          return { username, history: data.history };
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
    try {
      const res = await fetch("/api/accounts/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        throw new Error(`Failed to add account: ${res.statusText}`);
      }
      await fetchAccounts(); // Re-fetch accounts after adding
    } catch (error) {
      console.error("Error adding account:", error);
      setError(`Error adding account: ${(error as Error).message}`);
    }
  };

  const handleDeleteAccount = async (username: string) => {
    try {
      const res = await fetch("/api/accounts/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        throw new Error(`Failed to delete account: ${res.statusText}`);
      }
      await fetchAccounts(); // Re-fetch accounts after deleting
    } catch (error) {
      console.error("Error deleting account:", error);
      setError(`Error deleting account: ${(error as Error).message}`);
    }
  };

  const colors = [
    { border: 'rgb(59, 130, 246)', background: 'rgba(59, 130, 246, 0.1)' },
    { border: 'rgb(16, 185, 129)', background: 'rgba(16, 185, 129, 0.1)' },
    { border: 'rgb(245, 158, 11)', background: 'rgba(245, 158, 11, 0.1)' },
    { border: 'rgb(239, 68, 68)', background: 'rgba(239, 68, 68, 0.1)' },
    { border: 'rgb(139, 92, 246)', background: 'rgba(139, 92, 246, 0.1)' },
  ];

  const chartData = {
    labels: accountsData[0]?.history.map((h) => h.date) || [],
    datasets: accountsData.map((account, index) => ({
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
          <Card variant="elevated" padding="lg">
            <CardContent>
              <div className="flex justify-end mb-2">
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
              <div className="h-[500px]">
                {loading ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
                  </div>
                ) : error ? (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-red-500">{error}</p>
                  </div>
                ) : (
                  <Line data={chartData} options={chartOptions} />
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
