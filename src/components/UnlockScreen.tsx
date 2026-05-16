import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Shield } from 'lucide-react';

interface UnlockScreenProps {
  onUnlock: (password: string) => boolean;
  isFirstTime?: boolean;
  lockoutUntil?: number | null;
}

export default function UnlockScreen({ onUnlock, isFirstTime = false, lockoutUntil }: UnlockScreenProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (timeLeft > 0 || !password) return;
    const success = onUnlock(password);
    if (!success) {
      setError(true);
      if (!isFirstTime) {
         setPassword('');
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full flex-1 w-full bg-black px-4 overflow-y-auto py-8">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xs space-y-8"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-full flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
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
          </div>

          <button
            type="submit"
            disabled={timeLeft > 0 || !password}
            className="w-full bg-white text-black font-semibold py-4 rounded-xl hover:bg-zinc-200 disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-500 transition-colors active:scale-[0.98]"
          >
            {timeLeft > 0 ? 'Locked' : (isFirstTime ? 'Initialize Vault' : 'Unlock')}
          </button>
        </motion.form>
      </motion.div>
    </div>
  );
}
