import { HugeiconsIcon } from "@hugeicons/react";
import { Alert01Icon, ArrowLeft01Icon, CancelCircleIcon, CheckmarkCircle01Icon, Clock01Icon, Key01Icon, Shield01Icon } from "@hugeicons/core-free-icons";
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { VaultItem } from '../types';
import { calculateTimeToCrack } from '../lib/crypto';

interface DashboardProps {
  items: VaultItem[];
  audit: { score: number, reused: number, breached: number, breachedIds: string[] };
  decryptedPasswords: Record<string, string>;
  masterPassword?: string;
  onBack: () => void;
  onEdit: (item: VaultItem) => void;
  isLoading?: boolean;
}

interface AnalyzedLogin {
  item: VaultItem;
  password: string;
  weakness: { time: string; score: number };
  isOld: boolean;
  hasTotp: boolean;
}

export default function Dashboard({ items, audit, decryptedPasswords, onBack, onEdit, isLoading = false }: DashboardProps) {
  const logins = useMemo(() => items.filter(i => i.category === 'Login' && !i.deletedAt), [items]);
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [expandedStrength, setExpandedStrength] = useState<string | null>(null);

  const analyzedLogins: AnalyzedLogin[] = useMemo(() => {
    return logins.map(item => {
      const password = decryptedPasswords[item.id] || '';
      const weakness = password ? calculateTimeToCrack(password) : { time: 'Unknown', score: 0 };
      const isOld = Date.now() - item.updatedAt > 90 * 24 * 60 * 60 * 1000;
      const hasTotp = !!item.encryptedTotpSecret;
      return { item, password, weakness, isOld, hasTotp };
    });
  }, [logins, decryptedPasswords]);

  const weakPasswords = analyzedLogins.filter(a => a.weakness.score <= 2 && a.password);
  const oldPasswords = analyzedLogins.filter(a => a.isOld);
  const noTotp = analyzedLogins.filter(a => !a.hasTotp);
  const withTotp = analyzedLogins.filter(a => a.hasTotp);

  const strengthDist = useMemo(() => {
    const dist = { strong: 0, medium: 0, weak: 0 };
    analyzedLogins.forEach(a => {
      if (a.weakness.score >= 4) dist.strong++;
      else if (a.weakness.score >= 3) dist.medium++;
      else dist.weak++;
    });
    return dist;
  }, [analyzedLogins]);

  const total = analyzedLogins.length || 1;

  const checklist = useMemo(() => {
    const checklistItems = [
      { label: 'No reused passwords', done: audit.reused === 0 },
      { label: 'No breached passwords', done: audit.breached === 0 },
      { label: 'No weak passwords', done: weakPasswords.length === 0 },
      { label: 'All passwords 12+ chars', done: analyzedLogins.length > 0 && analyzedLogins.every(a => a.password.length >= 12) },
      { label: '2FA enabled on all accounts', done: noTotp.length === 0 },
      { label: 'No passwords older than 90 days', done: oldPasswords.length === 0 },
    ];
    return checklistItems;
  }, [audit.reused, audit.breached, weakPasswords, analyzedLogins, noTotp, oldPasswords]);

  const checklistDone = checklist.filter(c => c.done).length;
  const checklistTotal = checklist.length;

  const getProblematicItems = (type: string) => {
    switch (type) {
      case 'Pwned / Breached':
        return analyzedLogins.filter(a => audit.breachedIds.includes(a.item.id));
      case 'Reused Passwords':
        const passCounts: Record<string, string[]> = {};
        analyzedLogins.forEach(a => {
          if (a.password) {
            if (!passCounts[a.password]) passCounts[a.password] = [];
            passCounts[a.password].push(a.item.id);
          }
        });
        const reusedIds = new Set(Object.values(passCounts).filter(ids => ids.length > 1).flat());
        return analyzedLogins.filter(a => reusedIds.has(a.item.id));
      case 'Weak Passwords':
        return weakPasswords;
      case 'Old Passwords (90+ days)':
        return oldPasswords;
      case 'No 2FA Enabled':
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

  const LoadingSkeleton = () => (
    <div className="space-y-3">
      <div className="bg-zinc-900/30 rounded-2xl p-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="w-20 h-3 bg-zinc-800 rounded" />
            <div className="w-24 h-8 bg-zinc-800 rounded" />
          </div>
          <div className="w-14 h-14 bg-zinc-800 rounded-full" />
        </div>
      </div>
      <div className="bg-zinc-900/30 rounded-2xl p-3 animate-pulse">
        <div className="flex justify-between mb-2">
          <div className="w-32 h-3 bg-zinc-800 rounded" />
          <div className="w-8 h-3 bg-zinc-800 rounded" />
        </div>
        <div className="h-1 bg-zinc-800 rounded-full" />
      </div>
      <div className="bg-zinc-900/30 rounded-2xl p-3 animate-pulse">
        <div className="w-28 h-3 bg-zinc-800 rounded mb-2" />
        <div className="h-2 bg-zinc-800 rounded-full" />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full flex-1 w-full bg-black no-scrollbar overflow-y-auto px-4 pt-4 pb-20">
      <header className="flex items-center gap-3 mb-4">
        <button 
          onClick={onBack}
          className="p-2 -ml-2 hover:bg-zinc-900 rounded-xl text-zinc-400 hover:text-white transition-colors"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold text-white tracking-tight">Security Audit</h2>
      </header>

      {logins.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-zinc-900 flex items-center justify-center">
            <HugeiconsIcon icon={Shield01Icon} className="w-7 h-7 text-zinc-600" />
          </div>
          <p className="text-sm text-zinc-400 font-medium">No logins to analyze</p>
          <p className="text-xs text-zinc-600 text-center max-w-[200px]">Add some login items to see your security audit</p>
        </div>
      )}

      {(logins.length > 0 || isLoading) && (
        <div className="space-y-4">
          {isLoading ? <LoadingSkeleton /> : (
            <>
              {/* Main Score */}
              <div className="bg-zinc-900/30 rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-zinc-500 mb-1">Health Score</p>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-4xl font-bold tracking-tight ${audit.score > 80 ? 'text-green-500' : audit.score > 50 ? 'text-yellow-500' : 'text-red-500'}`}>{audit.score}</span>
                      <span className="text-zinc-600 text-sm">/100</span>
                    </div>
                  </div>
                  <div className="w-16 h-16 flex-shrink-0">
                    <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
                      <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" className="text-zinc-800" strokeWidth="4" />
                      <motion.circle
                        cx="32" cy="32" r="28" fill="none" stroke="currentColor"
                        className={audit.score > 80 ? "text-green-500" : audit.score > 50 ? "text-yellow-500" : "text-red-500"}
                        strokeWidth="4" strokeDasharray="175.9"
                        initial={{ strokeDashoffset: 175.9 }}
                        animate={{ strokeDashoffset: 175.9 * (1 - audit.score / 100) }}
                        transition={{ duration: 1.5, ease: "easeOut" }} strokeLinecap="round"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Security Checklist */}
              <div className="bg-zinc-900/30 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <HugeiconsIcon icon={Shield01Icon} className="w-4 h-4 text-zinc-500" />
                    <p className="text-sm font-semibold text-white">Security Checklist</p>
                  </div>
                  <span className="text-xs font-medium text-zinc-500">{checklistDone}/{checklistTotal}</span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-3">
                  <motion.div 
                    className="h-full bg-accent rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(checklistDone / checklistTotal) * 100}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {checklist.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 py-1">
                      {c.done ? (
                        <HugeiconsIcon icon={CheckmarkCircle01Icon} className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <HugeiconsIcon icon={CancelCircleIcon} className="w-4 h-4 text-zinc-700 flex-shrink-0" />
                      )}
                      <span className={`text-xs ${c.done ? 'text-zinc-400' : 'text-zinc-500'}`}>{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Strength Distribution */}
              <div className="space-y-2">
                <div className="bg-zinc-900/30 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <img src="/logo.svg" alt="Phantom" className="w-4 h-4" />
                    <p className="text-sm font-semibold text-white">Password Strength</p>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden flex mb-3">
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
                  <div className="flex gap-2">
                    <button
                      onClick={() => setExpandedStrength(expandedStrength === 'strong' ? null : 'strong')}
                      className={`flex-1 text-center text-xs font-medium py-1.5 rounded-lg transition-colors ${expandedStrength === 'strong' ? 'bg-green-500/20 text-green-400' : 'text-green-500 hover:bg-zinc-800'}`}
                    >
                      {strengthDist.strong} Strong
                    </button>
                    <button
                      onClick={() => setExpandedStrength(expandedStrength === 'medium' ? null : 'medium')}
                      className={`flex-1 text-center text-xs font-medium py-1.5 rounded-lg transition-colors ${expandedStrength === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 'text-yellow-500 hover:bg-zinc-800'}`}
                    >
                      {strengthDist.medium} Medium
                    </button>
                    <button
                      onClick={() => setExpandedStrength(expandedStrength === 'weak' ? null : 'weak')}
                      className={`flex-1 text-center text-xs font-medium py-1.5 rounded-lg transition-colors ${expandedStrength === 'weak' ? 'bg-red-500/20 text-red-400' : 'text-red-500 hover:bg-zinc-800'}`}
                    >
                      {strengthDist.weak} Weak
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedStrength && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden bg-zinc-900/30 rounded-2xl"
                    >
                      <div className="p-2 space-y-1">
                        {analyzedLogins
                          .filter(a => {
                            if (expandedStrength === 'strong') return a.weakness.score >= 4;
                            if (expandedStrength === 'medium') return a.weakness.score === 3;
                            return a.weakness.score <= 2 && a.password;
                          })
                          .map((a) => (
                            <button 
                              key={a.item.id} 
                              onClick={() => onEdit(a.item)}
                              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-zinc-800/50 transition-colors text-left"
                            >
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-sm font-medium text-zinc-200 truncate">{a.item.title}</span>
                                <span className="text-xs text-zinc-500 truncate">{a.item.username}</span>
                              </div>
                              <span className={`text-xs font-medium ml-2 ${a.weakness.score >= 4 ? 'text-green-500' : a.weakness.score === 3 ? 'text-yellow-500' : 'text-red-500'}`}>
                                {a.weakness.time}
                              </span>
                            </button>
                          ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 2FA Coverage */}
              <div className="bg-zinc-900/30 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <HugeiconsIcon icon={Key01Icon} className="w-4 h-4 text-zinc-500" />
                    <p className="text-sm font-semibold text-white">2FA Coverage</p>
                  </div>
                  <span className="text-xs font-medium text-zinc-500">{withTotp.length}/{logins.length}</span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-accent rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(withTotp.length / (logins.length || 1)) * 100}%` }}
                    transition={{ duration: 0.8, delay: 0.5 }}
                  />
                </div>
              </div>

              {/* Security Alerts */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-white">Security Alerts</h3>
                
                <div className="space-y-2">
                  {[
                    { label: 'Pwned / Breached', count: audit.breached, color: 'text-red-500', bg: 'bg-red-500/10' },
                    { label: 'Reused Passwords', count: audit.reused, color: 'text-orange-500', bg: 'bg-orange-500/10' },
                    { label: 'Weak Passwords', count: weakPasswords.length, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
                    { label: 'Old Passwords (90+ days)', count: oldPasswords.length, color: 'text-zinc-400', bg: 'bg-zinc-800/50' },
                    { label: 'No 2FA Enabled', count: noTotp.length, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                  ].map((v, i) => (
                    <div key={i} className="space-y-1.5">
                      <button
                        onClick={() => setExpandedIssue(expandedIssue === v.label ? null : v.label)}
                        disabled={v.count === 0}
                        className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${v.count > 0 ? v.bg + ' cursor-pointer' : 'opacity-40 cursor-default'}`}
                      >
                        <div className="flex items-center gap-3">
                          <HugeiconsIcon icon={Alert01Icon} className={`w-4 h-4 ${v.count > 0 ? v.color : 'text-zinc-700'}`} />
                          <span className={`text-sm font-medium ${v.count > 0 ? 'text-zinc-200' : 'text-zinc-500'}`}>{v.label}</span>
                        </div>
                        <span className={`text-sm font-semibold ${v.count > 0 ? v.color : 'text-zinc-700'}`}>{v.count}</span>
                      </button>

                      <AnimatePresence>
                        {expandedIssue === v.label && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden bg-zinc-900/30 rounded-2xl"
                          >
                            <div className="p-2 space-y-1">
                              {getProblematicItems(v.label).map((a) => {
                                const item = a.item;
                                const weakness = a.weakness;
                                const isOld = a.isOld;
                                return (
                                  <button 
                                    key={item.id} 
                                    onClick={() => onEdit(item)}
                                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-zinc-800/50 transition-colors text-left"
                                  >
                                    <div className="flex flex-col min-w-0 flex-1">
                                      <span className="text-sm font-medium text-zinc-200 truncate">{item.title}</span>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-xs text-zinc-500 truncate">{item.username}</span>
                                        {weakness && (
                                          <span className={`text-[10px] font-medium ${weakness.score <= 1 ? 'text-red-500' : weakness.score <= 2 ? 'text-yellow-500' : 'text-green-500'}`}>
                                            {weakness.time}
                                          </span>
                                        )}
                                        {isOld && (
                                          <span className="text-[10px] text-zinc-500 flex items-center gap-0.5">
                                            <HugeiconsIcon icon={Clock01Icon} className="w-3 h-3" />
                                            {timeAgo(item.updatedAt)}
                                          </span>
                                        )}
                                        {!a.hasTotp && v.label === 'No 2FA Enabled' && (
                                          <span className="text-[10px] text-blue-400 font-medium">No 2FA</span>
                                        )}
                                      </div>
                                    </div>
                                    <span className="text-xs font-medium text-zinc-400 ml-2">Fix →</span>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
