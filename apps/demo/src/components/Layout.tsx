import { Outlet, Link, useLocation } from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Lock, Gavel, ShieldCheck, Plus, User, History } from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', label: 'Auctions', icon: Gavel },
  { path: '/vault', label: 'Vault', icon: ShieldCheck },
  { path: '/create', label: 'Create', icon: Plus },
  { path: '/activity', label: 'Activity', icon: User },
  { path: '/history', label: 'History', icon: History },
];

export function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0b' }}>
      {/* Header */}
      <header className="border-b border-zinc-800/50 sticky top-0 z-40" style={{ backgroundColor: 'rgba(17,17,19,0.8)', backdropFilter: 'blur(12px)' }}>
        <div className="max-w-350 mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                <Lock className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-semibold text-white">HushBid</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
                const isActive = path === '/' 
                  ? location.pathname === '/' 
                  : location.pathname.startsWith(path);
                return (
                  <Link
                    key={path}
                    to={path}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'text-white bg-zinc-800/50'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-zinc-400">Sepolia</span>
            </div>
            <ConnectButton.Custom>
              {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
                const connected = mounted && account && chain;
                return (
                  <button
                    onClick={connected ? openAccountModal : openConnectModal}
                    className="px-4 py-2 text-sm font-medium rounded-lg transition-all"
                    style={{
                      backgroundColor: connected ? '#18181b' : '#3b82f6',
                      color: 'white',
                      border: connected ? '1px solid #27272a' : 'none',
                    }}
                  >
                    {connected ? account.displayName : 'Connect Wallet'}
                  </button>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </div>
      </header>

      {/* Page Content */}
      <main className="max-w-350 mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
