import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, AlertTriangle, Key, Zap } from 'lucide-react';
import { VaultItem } from '../types';
import { decrypt } from '../lib/crypto';

interface DashboardProps {
  items: VaultItem[];
  audit: { score: number, reused: number, breached: number, breachedIds: string[] };
  masterPassword?: string;
  onBack: () => void;
  onEdit: (item: VaultItem) => void;
}

export default function Dashboard({ items, audit, masterPassword, onBack, onEdit }: DashboardProps) {
  const categories = {
    Login: items.filter(i => i.category === 'Login').length,
    Card: items.filter(i => i.category === 'Card').length,
    Note: items.filter(i => i.category === 'Note').length,
  };

  const [expandedIssue, setExpandedIssue] = React.useState<string | null>(null);

  const getProblematicItems = (type: string) => {
    switch (type) {
      case 'Reused Passwords':
        if (!masterPassword) return [];
        const passCounts: Record<string, string[]> = {};
        items.forEach(i => {
          if (i.category !== 'Login') return;
          try {
            const p = decrypt(i.encryptedPassword, masterPassword);
            if (p) {
              if (!passCounts[p]) passCounts[p] = [];
              passCounts[p].push(i.id);
            }
          } catch(e) {}
        });
        const reusedIds = new Set(Object.values(passCounts).filter(ids => ids.length > 1).flat());
        return items.filter(i => reusedIds.has(i.id));
      case 'Pwned / Breached':
        return items.filter(i => audit.breachedIds.includes(i.id));
      default:
        return [];
    }
  };

  return (
    <div className="flex flex-col h-full flex-1 w-full bg-black no-scrollbar overflow-y-auto px-3 pt-3 pb-20">
      <header className="flex items-center gap-3 mb-4">
        <button 
          onClick={onBack}
          className="p-1.5 -ml-1.5 hover:bg-zinc-900 rounded-lg text-zinc-500 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="text-base font-semibold text-white tracking-tight">Analytics</h2>
      </header>

      <div className="space-y-3">
        {/* Main Score Box */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-zinc-400">Health Score</p>
            <div className="flex items-baseline gap-0.5">
              <span className={`text-3xl font-bold tracking-tight ${audit.score > 80 ? 'text-green-500' : audit.score > 50 ? 'text-yellow-500' : 'text-red-500'}`}>{audit.score}</span>
              <span className="text-zinc-500 text-sm font-medium">/100</span>
            </div>
          </div>
          <div className="w-14 h-14 flex-shrink-0">
             <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
                <circle
                  cx="32"
                  cy="32"
                  r="30"
                  fill="none"
                  stroke="currentColor"
                  className="text-zinc-800"
                  strokeWidth="4"
                />
                <motion.circle
                  cx="32"
                  cy="32"
                  r="30"
                  fill="none"
                  stroke="currentColor"
                  className={audit.score > 80 ? "text-green-500" : audit.score > 50 ? "text-yellow-500" : "text-red-500"}
                  strokeWidth="4"
                  strokeDasharray="188.5"
                  initial={{ strokeDashoffset: 188.5 }}
                  animate={{ strokeDashoffset: 188.5 * (1 - audit.score / 100) }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                  strokeLinecap="round"
                />
              </svg>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-3 space-y-1.5">
            <Key className="w-3.5 h-3.5 text-zinc-500" />
            <div>
              <span className="text-xl font-semibold text-white">{categories.Login}</span>
              <p className="text-[10px] font-medium text-zinc-500">Logins Saved</p>
            </div>
          </div>
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-3 space-y-1.5">
            <Zap className="w-3.5 h-3.5 text-zinc-500" />
            <div>
              <span className="text-xl font-semibold text-white">{items.length}</span>
              <p className="text-[10px] font-medium text-zinc-500">Total Items</p>
            </div>
          </div>
        </div>

        {/* Vulnerabilities Section */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-white px-1">Security Alerts</h3>
          
          <div className="space-y-2">
            {[
              { label: 'Pwned / Breached', count: audit.breached, icon: <AlertTriangle className="w-4 h-4" />, color: 'text-red-500', bg: 'bg-red-500/20 border-red-500/30' },
              { label: 'Reused Passwords', count: audit.reused, icon: <AlertTriangle className="w-4 h-4" />, color: 'text-orange-500', bg: 'bg-orange-500/10 border-orange-500/20' },
            ].map((v, i) => (
              <div key={i} className="space-y-1.5">
                <button
                  onClick={() => setExpandedIssue(expandedIssue === v.label ? null : v.label)}
                  disabled={v.count === 0}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all ${v.count > 0 ? v.bg + ' cursor-pointer' : 'opacity-50 cursor-default bg-zinc-900/30 border-transparent'}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`${v.count > 0 ? v.color : 'text-zinc-600'}`}>
                      {v.icon}
                    </div>
                    <span className={`text-xs font-medium ${v.count > 0 ? 'text-zinc-200' : 'text-zinc-500'}`}>{v.label}</span>
                  </div>
                  <span className={`text-xs font-bold ${v.count > 0 ? v.color : 'text-zinc-600'}`}>{v.count}</span>
                </button>

                <AnimatePresence>
                  {expandedIssue === v.label && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden bg-zinc-900/30 rounded-xl border border-zinc-800"
                    >
                      <div className="p-1.5 space-y-1">
                        {getProblematicItems(v.label).map(item => (
                          <button 
                            key={item.id} 
                            onClick={() => onEdit(item)}
                            className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-zinc-800 transition-colors text-left"
                          >
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="text-xs font-medium text-zinc-300 truncate">{item.title}</span>
                              <span className="text-[10px] text-zinc-500 truncate">{item.username}</span>
                            </div>
                            <span className="text-[10px] font-semibold text-white px-2 py-0.5 bg-zinc-800 rounded-full ml-2 flex-shrink-0">Fix</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
