import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Shield, AlertTriangle, CheckCircle2, Clock, Key, CreditCard, FileText, Zap } from 'lucide-react';
import { VaultItem } from '../types';
import { decrypt } from '../lib/crypto';

interface DashboardProps {
  items: VaultItem[];
  audit: { score: number, weak: number, reused: number, old: number, breached: number, breachedIds: string[] };
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
      case 'Weak Credentials':
        return items.filter(i => (i.strength || 0) < 3 && i.category === 'Login');
      case 'Older than 90 days':
        const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
        return items.filter(i => Date.now() - i.updatedAt > NINETY_DAYS && i.category === 'Login');
      case 'Pwned / Breached':
        return items.filter(i => audit.breachedIds.includes(i.id));
      default:
        return [];
    }
  };

  return (
    <div className="flex flex-col h-full bg-black no-scrollbar overflow-y-auto px-6 pt-8 pb-24">
      <header className="flex items-center gap-4 mb-8">
        <button 
          onClick={onBack}
          className="p-2 -ml-2 hover:bg-zinc-900 rounded-xl text-zinc-500 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-semibold text-white tracking-tight">Analytics</h2>
      </header>

      <div className="space-y-6">
        {/* Main Score Box */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-zinc-400">Health Score</p>
            <div className="flex items-baseline gap-1">
              <span className={`text-4xl font-bold tracking-tight ${audit.score > 80 ? 'text-green-500' : audit.score > 50 ? 'text-yellow-500' : 'text-red-500'}`}>{audit.score}</span>
              <span className="text-zinc-500 font-medium">/100</span>
            </div>
          </div>
          <div className="w-16 h-16 relative flex items-center justify-center">
             <svg className="w-full h-full -rotate-90">
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
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 space-y-2">
            <Key className="w-5 h-5 text-zinc-500" />
            <div>
              <span className="text-2xl font-semibold text-white">{categories.Login}</span>
              <p className="text-xs font-medium text-zinc-500">Logins Saved</p>
            </div>
          </div>
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 space-y-2">
            <Zap className="w-5 h-5 text-zinc-500" />
            <div>
              <span className="text-2xl font-semibold text-white">{items.length}</span>
              <p className="text-xs font-medium text-zinc-500">Total Items</p>
            </div>
          </div>
        </div>

        {/* Vulnerabilities Section */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-white px-1">Security Alerts</h3>
          
          <div className="space-y-3">
            {[
              { label: 'Pwned / Breached', count: audit.breached, icon: <AlertTriangle className="w-5 h-5" />, color: 'text-red-500', bg: 'bg-red-500/20 border-red-500/30 font-bold' },
              { label: 'Reused Passwords', count: audit.reused, icon: <AlertTriangle className="w-5 h-5" />, color: 'text-orange-500', bg: 'bg-orange-500/10 border-orange-500/20' },
              { label: 'Weak Credentials', count: audit.weak, icon: <Zap className="w-5 h-5" />, color: 'text-yellow-500', bg: 'bg-yellow-500/10 border-yellow-500/20' },
              { label: 'Older than 90 days', count: audit.old, icon: <Clock className="w-5 h-5" />, color: 'text-zinc-400', bg: 'bg-zinc-900/50 border-zinc-800' },
            ].map((v, i) => (
              <div key={i} className="space-y-2">
                <button
                  onClick={() => setExpandedIssue(expandedIssue === v.label ? null : v.label)}
                  disabled={v.count === 0}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${v.count > 0 ? v.bg + ' cursor-pointer' : 'opacity-50 cursor-default bg-zinc-900/30 border-transparent'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`${v.count > 0 ? v.color : 'text-zinc-600'}`}>
                      {v.icon}
                    </div>
                    <span className={`text-sm font-medium ${v.count > 0 ? 'text-zinc-200' : 'text-zinc-500'}`}>{v.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${v.count > 0 ? v.color : 'text-zinc-600'}`}>{v.count}</span>
                  </div>
                </button>

                <AnimatePresence>
                  {expandedIssue === v.label && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden bg-zinc-900/30 rounded-xl border border-zinc-800 mx-2"
                    >
                      <div className="p-2 space-y-1">
                        {getProblematicItems(v.label).map(item => (
                          <button 
                            key={item.id} 
                            onClick={() => onEdit(item)}
                            className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-zinc-800 transition-colors text-left"
                          >
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-zinc-300">{item.title}</span>
                              <span className="text-xs text-zinc-500">{item.username}</span>
                            </div>
                            <span className="text-xs font-semibold text-white px-3 py-1 bg-zinc-800 rounded-full">Fix</span>
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
