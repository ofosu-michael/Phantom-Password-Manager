import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import zxcvbn from 'zxcvbn';

interface UnlockScreenProps {
  onUnlock: (password: string) => boolean | Promise<boolean>;
  isFirstTime?: boolean;
  lockoutUntil?: number | null;
  onImportVault?: () => void;
}

const strengthLabels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
const strengthColors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-emerald-500'];
const strengthTextColors = ['text-red-500', 'text-orange-500', 'text-yellow-500', 'text-green-500', 'text-emerald-500'];

export default function UnlockScreen({ onUnlock, isFirstTime = false, lockoutUntil, onImportVault }: UnlockScreenProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [strength, setStrength] = useState<{ score: number; crackTime: string } | null>(null);

  useEffect(() => {
    if (!lockoutUntil) {
      setTimeLeft(0);
      return;
    }
    const updateTime = () => {
      const remaining = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      setTimeLeft(remaining);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  useEffect(() => {
    if (!isFirstTime || !password) {
      setStrength(null);
      return;
    }
    const result = zxcvbn(password);
    const crackTimes = result.crack_times_display;
    let crackTime = crackTimes.offline_slow_hashing_1e4_per_second;
    if (result.score >= 4) crackTime = `Centuries+`;
    setStrength({ score: result.score, crackTime });
  }, [password, isFirstTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (timeLeft > 0 || !password) return;
    if (isFirstTime && strength && strength.score < 2) return;
    const success = await onUnlock(password);
    if (!success) {
      setError(true);
      if (!isFirstTime) {
         setPassword('');
      }
    }
  };

  const isWeakPassword = isFirstTime && strength !== null && strength.score < 2;

  return (
    <div className="flex flex-col items-center justify-center h-full flex-1 w-full bg-black px-4 overflow-y-auto py-8">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xs space-y-8"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <img src="/logo.svg" alt="Phantom" className="w-12 h-12" />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {isFirstTime ? 'Create Vault' : 'Welcome Back'}
            </h1>
            <p className="text-sm text-zinc-500">
              {isFirstTime ? 'Set a master password to secure your items.' : 'Enter your master password to continue.'}
            </p>
          </div>
        </div>

        <motion.form 
          onSubmit={handleSubmit} 
          className="space-y-4"
          animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
          transition={{ duration: 0.4 }}
        >
          <div className="space-y-2">
            <input
              type="password"
              autoFocus
              value={password}
              disabled={timeLeft > 0}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(false);
              }}
              placeholder="Master Password"
              className={`w-full bg-zinc-900/50 border text-center rounded-xl py-4 px-4 outline-none transition-all placeholder:text-zinc-600 focus:bg-zinc-900 ${
                error ? 'border-red-500/50 text-red-500' : 'border-zinc-800 focus:border-zinc-700 text-white'
              }`}
            />
            
            {isFirstTime && strength && (
              <div className="space-y-1.5">
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                        i <= strength.score ? strengthColors[strength.score] : 'bg-zinc-800'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-medium ${strengthTextColors[strength.score]}`}>
                    {strengthLabels[strength.score]}
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    Crack time: {strength.crackTime}
                  </span>
                </div>
              </div>
            )}

            {error && !timeLeft && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-red-500 text-xs text-center font-medium"
              >
                Incorrect password
              </motion.p>
            )}
            {timeLeft > 0 && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-red-500 text-xs text-center font-medium"
              >
                Vault locked. Try again in {timeLeft}s
              </motion.p>
            )}
            {isWeakPassword && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-yellow-500 text-xs text-center font-medium"
              >
                Password is too weak. Please choose a stronger one.
              </motion.p>
            )}
          </div>

          <button
            type="submit"
            disabled={timeLeft > 0 || !password || isWeakPassword}
            className="w-full bg-white text-black font-semibold py-4 rounded-xl hover:bg-zinc-200 disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-500 transition-colors active:scale-[0.98]"
          >
            {timeLeft > 0 ? 'Locked' : (isFirstTime ? 'Initialize Vault' : 'Unlock')}
          </button>
        </motion.form>

        {isFirstTime && (
          <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-3 space-y-2">
            <p className="text-[10px] text-zinc-400 font-medium leading-relaxed">
              Your master password encrypts all vault data with AES-256-GCM. It cannot be recovered if forgotten.
            </p>
            <ul className="text-[10px] text-zinc-500 space-y-1">
              <li className="flex items-center gap-1.5">
                <span className="text-green-500">✓</span> Use at least 12 characters
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-green-500">✓</span> Mix uppercase, lowercase, numbers & symbols
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-green-500">✓</span> Avoid common phrases or personal info
              </li>
            </ul>
          </div>
        )}

        {isFirstTime && onImportVault && (
          <button
            type="button"
            onClick={onImportVault}
            className="w-full text-center text-xs font-medium text-zinc-500 hover:text-white transition-colors py-2"
          >
            Import from backup (.pv)
          </button>
        )}
      </motion.div>
    </div>
  );
}
