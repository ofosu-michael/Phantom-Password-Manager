import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, AlertTriangle, Key, Zap, ShieldCheck, Clock, Shield, CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react';
import { VaultItem } from '../types';
import { decrypt, calculateTimeToCrack } from '../lib/crypto';

interface DashboardProps {
  items: VaultItem[];
  audit: { score: number, reused: number, breached: number, breachedIds: string[] };
  masterPassword?: string;
  onBack: () => void;
  onEdit: (item: VaultItem) => void;
}

export default function Dashboard({ items, audit, masterPassword, onBack, onEdit }: DashboardProps) {
  const logins = items.filter(i => i.category === 'Login' && !i.deletedAt);
  const [expandedIssue, setExpandedIssue] = React.useState<string | null>(null);
  const [showPasswords, setShowPasswords] = React.useState<Record<string, boolean>>({});

  // Decrypt and analyze passwords
  const analyzedLogins = React.useMemo(() => {
    if (!masterPassword) return [];
    return logins.map(item => {
      try {
        const rawPassword = decrypt(item.encryptedPassword, masterPassword);
        if (!rawPassword) return { item, password: '', weakness: { time: 'Unknown', score: 0 }, isOld: false, hasTotp: false };
        const weakness = calculateTimeToCrack(rawPassword);
        const isOld = Date.now() - item.updatedAt > 90 * 24 * 60 * 60 * 1000;
        const hasTotp = !!item.encryptedTotpSecret;
        return { item, password: rawPassword, weakness, isOld, hasTotp };
      } catch {
        return { item, password: '', weakness: { time: 'Unknown', score: 0 }, isOld: false, hasTotp: false };
      }
    });
  }, [logins, masterPassword]);

  // Weak passwords (score <= 2)
  const weakPasswords = analyzedLogins.filter(a => a.weakness.score <= 2 && a.password);
  
  // Old passwords (90+ days)
  const oldPasswords = analyzedLogins.filter(a => a.isOld);
  
  // No 2FA
  const noTotp = analyzedLogins.filter(a => !a.hasTotp);
  const withTotp = analyzedLogins.filter(a => a.hasTotp);

  // Strength distribution
  const strengthDist = React.useMemo(() => {
    const dist = { strong: 0, medium: 0, weak: 0 };
    analyzedLogins.forEach(a => {
      if (a.weakness.score >= 4) dist.strong++;
      else if (a.weakness.score >= 3) dist.medium++;
      else dist.weak++;
    });
    return dist;
  }, [analyzedLogins]);

  const total = analyzedLogins.length || 1;

  // Security checklist
  const checklist = React.useMemo(() => {
    const items = [
      { label: 'No reused passwords', done: audit.reused === 0 },
      { label: 'No breached passwords', done: audit.breached === 0 },
      { label: 'No weak passwords', done: weakPasswords.length === 0 },
      { label: 'All passwords 12+ chars', done: analyzedLogins.every(a => a.password.length >= 12) },
      { label: '2FA enabled on all accounts', done: noTotp.length === 0 },
      { label: 'No passwords older than 90 days', done: oldPasswords.length === 0 },
    ];
    return items;
  }, [audit.reused, audit.breached, weakPasswords, analyzedLogins, noTotp, oldPasswords]);

  const checklistDone = checklist.filter(c => c.done).length;
  const checklistTotal = checklist.length;

  const getProblematicItems = (type: string) => {
    switch (type) {
      case 'Pwned / Breached':
        return analyzedLogins.filter(a => audit.breachedIds.includes(a.item.id));
      case 'Reused Passwords':
        if (!masterPassword) return [];
        const passCounts: Record<string, string[]> = {};
        logins.forEach(i => {
          try {
            const p = decrypt(i.encryptedPassword, masterPassword);
            if (p) {
              if (!passCounts[p]) passCounts[p] = [];
              passCounts[p].push(i.id);
            }
          } catch(e) {}
        });
        const reusedIds = new Set(Object.values(passCounts).filter(ids => ids.length > 1).flat());
        return analyzedLogins.filter(a => reusedIds.has(a.item.id));
      case 'Weak Passwords':
        return weakPasswords;
      case 'Old Passwords':
        return oldPasswords;
      case 'No 2FA':
        return noTotp;
      default:
        return [];
    }
  };

  const timeAgo = (timestamp: number) => {
    const days = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
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
        <h2 className="text-base font-semibold text-white tracking-tight">Security Audit</h2>
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
                <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" className="text-zinc-800" strokeWidth="4" />
                <motion.circle
                  cx="32" cy="32" r="30" fill="none" stroke="currentColor"
                  className={audit.score > 80 ? "text-green-500" : audit.score > 50 ? "text-yellow-500" : "text-red-500"}
                  strokeWidth="4" strokeDasharray="188.5"
                  initial={{ strokeDashoffset: 188.5 }}
                  animate={{ strokeDashoffset: 188.5 * (1 - audit.score / 100) }}
                  transition={{ duration: 1.5, ease: "easeOut" }} strokeLinecap="round"
                />
              </svg>
          </div>
        </div>

        {/* Security Checklist */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
              <p className="text-xs font-semibold text-white">Security Checklist</p>
            </div>
            <span className="text-[10px] font-medium text-zinc-400">{checklistDone}/{checklistTotal}</span>
          </div>
          {/* Progress bar */}
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-accent rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(checklistDone / checklistTotal) * 100}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
          <div className="grid grid-cols-2 gap-1">
            {checklist.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5 py-0.5">
                {c.done ? (
                  <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                ) : (
                  <XCircle className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                )}
                <span className={`text-[10px] ${c.done ? 'text-zinc-400' : 'text-zinc-500'}`}>{c.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Strength Distribution */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-zinc-400" />
            <p className="text-xs font-semibold text-white">Password Strength</p>
          </div>
          {/* Stacked bar */}
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden flex">
            {strengthDist.strong > 0 && (
              <motion.div 
                className="h-full bg-green-500"
                initial={{ width: 0 }}
                animate={{ width: `${(strengthDist.strong / total) * 100}%` }}
                transition={{ duration: 0.8, delay: 0.2 }}
              />
            )}
            {strengthDist.medium > 0 && (
              <motion.div 
                className="h-full bg-yellow-500"
                initial={{ width: 0 }}
                animate={{ width: `${(strengthDist.medium / total) * 100}%` }}
                transition={{ duration: 0.8, delay: 0.3 }}
              />
            )}
            {strengthDist.weak > 0 && (
              <motion.div 
                className="h-full bg-red-500"
                initial={{ width: 0 }}
                animate={{ width: `${(strengthDist.weak / total) * 100}%` }}
                transition={{ duration: 0.8, delay: 0.4 }}
              />
            )}
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-green-500 font-medium">{strengthDist.strong} Strong</span>
            <span className="text-yellow-500 font-medium">{strengthDist.medium} Medium</span>
            <span className="text-red-500 font-medium">{strengthDist.weak} Weak</span>
          </div>
        </div>

        {/* 2FA Coverage */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Key className="w-3.5 h-3.5 text-zinc-400" />
              <p className="text-xs font-semibold text-white">2FA Coverage</p>
            </div>
            <span className="text-[10px] font-medium text-zinc-400">{withTotp.length}/{logins.length}</span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-accent rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(withTotp.length / (logins.length || 1)) * 100}%` }}
              transition={{ duration: 0.8, delay: 0.5 }}
            />
          </div>
          {noTotp.length > 0 && (
            <button
              onClick={() => setExpandedIssue(expandedIssue === 'No 2FA' ? null : 'No 2FA')}
              className="w-full mt-2 text-left text-[10px] text-accent font-medium hover:text-accent-hover transition-colors"
            >
              {noTotp.length} account{noTotp.length > 1 ? 's' : ''} missing 2FA →
            </button>
          )}
        </div>

        {/* Security Alerts */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-white px-1">Security Alerts</h3>
          
          <div className="space-y-2">
            {[
              { label: 'Pwned / Breached', count: audit.breached, color: 'text-red-500', bg: 'bg-red-500/20 border-red-500/30' },
              { label: 'Reused Passwords', count: audit.reused, color: 'text-orange-500', bg: 'bg-orange-500/10 border-orange-500/20' },
              { label: 'Weak Passwords', count: weakPasswords.length, color: 'text-yellow-500', bg: 'bg-yellow-500/10 border-yellow-500/20' },
              { label: 'Old Passwords (90+ days)', count: oldPasswords.length, color: 'text-zinc-400', bg: 'bg-zinc-800/50 border-zinc-700/50' },
            ].map((v, i) => (
              <div key={i} className="space-y-1.5">
                <button
                  onClick={() => setExpandedIssue(expandedIssue === v.label ? null : v.label)}
                  disabled={v.count === 0}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all ${v.count > 0 ? v.bg + ' cursor-pointer' : 'opacity-40 cursor-default bg-zinc-900/20 border-transparent'}`}
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`w-4 h-4 ${v.count > 0 ? v.color : 'text-zinc-600'}`} />
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
                        {getProblematicItems(v.label).map((a: any) => {
                          const item = a.item || a;
                          const password = a.password || '';
                          const weakness = a.weakness;
                          const isOld = a.isOld;
                          return (
                            <button 
                              key={item.id} 
                              onClick={() => onEdit(item)}
                              className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-zinc-800 transition-colors text-left"
                            >
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-xs font-medium text-zinc-300 truncate">{item.title}</span>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] text-zinc-500 truncate">{item.username}</span>
                                  {weakness && (
                                    <span className={`text-[9px] font-medium ${weakness.score <= 1 ? 'text-red-500' : weakness.score <= 2 ? 'text-yellow-500' : 'text-green-500'}`}>
                                      {weakness.time}
                                    </span>
                                  )}
                                  {isOld && (
                                    <span className="text-[9px] text-zinc-500 flex items-center gap-0.5">
                                      <Clock className="w-2.5 h-2.5" />
                                      {timeAgo(item.updatedAt)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className="text-[10px] font-semibold text-white px-2 py-0.5 bg-zinc-800 rounded-full ml-2 flex-shrink-0">Fix</span>
                            </button>
                          );
                        })}
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
