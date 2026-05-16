import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Lock,
  Download,
  Upload,
  Trash2,
  FileText,
  Shield,
  AlertTriangle,
  X,
  Globe,
} from "lucide-react";
import Papa from "papaparse";
import { VaultItem } from "../types";
import { decrypt, encrypt } from "../lib/crypto";

interface SettingsProps {
  items: VaultItem[];
  masterPassword: string;
  autoLockTimeout: number;
  theme: string;
  onUpdateTheme: (theme: string) => void;
  onUpdateAutoLock: (timeout: number) => void;
  onBack: () => void;
  onImport: (items: VaultItem[]) => void;
  onLock: () => void;
  onClear: () => void;
  onShowToast: (text: string, type?: "success" | "error" | "info") => void;
}

export default function Settings({
  items,
  masterPassword,
  autoLockTimeout,
  theme,
  onUpdateTheme,
  onUpdateAutoLock,
  onBack,
  onImport,
  onLock,
  onClear,
  onShowToast,
}: SettingsProps) {
  const [showConfirmWipe, setShowConfirmWipe] = useState(false);

  const handleExport = () => {
    const data = items.map((item) => ({
      title: item.title,
      website: item.website,
      username: item.username,
      password: decrypt(item.encryptedPassword, masterPassword) || "",
      category: item.category,
      content: item.content || "",
    }));

    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `vault_export_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const importedData = results.data as any[];

        const getValue = (row: any, keys: string[]) => {
          const rowKeys = Object.keys(row);
          for (const key of keys) {
            const match = rowKeys.find(
              (rk) => rk.toLowerCase().trim() === key.toLowerCase().trim(),
            );
            if (match && row[match]) return row[match];
          }
          return "";
        };

        const newItems: VaultItem[] = importedData
          .filter((row) => {
            const title = getValue(row, ["title", "name"]);
            const url = getValue(row, ["url", "website", "login_uri"]);
            const pwd = getValue(row, ["password", "login_password"]);
            return (title || url) && pwd;
          })
          .map((row) => {
            const rawPassword = getValue(row, ["password", "login_password"]);
            const encryptedPass = encrypt(rawPassword, masterPassword);

            const rawTotp = getValue(row, ["totp", "login_totp", "otpauth"]);
            const encryptedTotp = rawTotp
              ? encrypt(rawTotp, masterPassword)
              : undefined;

            let cat = "Login";
            const typeStr = getValue(row, [
              "type",
              "grouping",
              "folder",
              "category",
            ]).toLowerCase();
            if (typeStr.includes("note") || typeStr === "2") cat = "Note";
            if (typeStr.includes("card") || typeStr === "3") cat = "Card";

            const rawTags = getValue(row, ["tags", "grouping", "folder"]);
            const itemTags = rawTags
              ? rawTags
                  .split(",")
                  .map((t: string) => t.trim())
                  .filter(Boolean)
              : [];

            return {
              id: Math.random().toString(36).substring(2, 9),
              title: getValue(row, ["title", "name"]) || "Imported Item",
              website: getValue(row, ["website", "url", "login_uri"]),
              username: getValue(row, ["username", "login_username"]),
              encryptedPassword: encryptedPass,
              encryptedTotpSecret: encryptedTotp,
              category: cat as any,
              content: getValue(row, ["content", "note", "notes", "extra"]),
              tags: itemTags.length > 0 ? itemTags : undefined,
              updatedAt: Date.now(),
              passwordHistory: [
                { password: encryptedPass, timestamp: Date.now() },
              ],
            };
          });

        if (newItems.length > 0) {
          onImport(newItems);
          onShowToast(
            `Successfully imported ${newItems.length} items.`,
            "success",
          );
        } else {
          onShowToast("No valid passwords found in CSV.", "error");
        }
        e.target.value = ""; // Reset to allow re-importing same file
      },
      error: () => {
        onShowToast("Failed to read CSV file.", "error");
        e.target.value = "";
      },
    });
  };

  const handleBackup = () => {
    const encryptedVault = encrypt(JSON.stringify(items), masterPassword);
    const blob = new Blob([encryptedVault], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `vault_backup_${new Date().getTime()}.pv`;
    link.click();
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      try {
        const decrypted = decrypt(content, masterPassword);
        if (decrypted) {
          const parsed = JSON.parse(decrypted);
          onImport(parsed);
          onShowToast("Vault restored successfully!", "success");
        } else {
          onShowToast("Invalid backup file or master password", "error");
        }
      } catch (e) {
        onShowToast("Failed to restore backup", "error");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="px-4 flex flex-col h-full flex-1 w-full bg-black custom-scrollbar overflow-y-auto pt-6 pb-24">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="p-2 -ml-2 hover:bg-zinc-900 rounded-xl text-zinc-500 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-semibold text-white tracking-tight">
          Settings
        </h2>
      </div>

      <div className="space-y-8 flex-1">
        <div className="space-y-4">
          <p className="text-sm font-semibold text-zinc-400 px-1">Security</p>
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <p className="text-sm text-zinc-400 leading-relaxed">
              Your vault is protected with AES-256 encryption. All data is
              stored locally in your browser.
            </p>
            <div className="flex flex-col gap-3 py-2">
              <div>
                <h4 className="text-sm font-semibold text-white">
                  Auto-Lock Timeout
                </h4>
                <p className="text-xs text-zinc-500 mt-1">
                  Lock vault after inactivity
                </p>
              </div>
              <select
                value={autoLockTimeout.toString()}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  onUpdateAutoLock(val);
                }}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2 outline-none focus:border-zinc-500 transition-colors"
              >
                <option value="60000">1 Minute</option>
                <option value="300000">5 Minutes</option>
                <option value="900000">15 Minutes</option>
                <option value="3600000">1 Hour</option>
                <option value="0">Never</option>
              </select>
            </div>
            <button
              onClick={onLock}
              className="w-full py-3.5 bg-zinc-800 text-white text-sm font-semibold rounded-xl hover:bg-zinc-700 transition-all flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              Lock Vault Now
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-sm font-semibold text-zinc-400 px-1">
            Data Management
          </p>
          <div className="grid grid-cols-1 gap-3">
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    Import / Export
                  </h4>
                  <p className="text-xs text-zinc-500 mt-1">
                    Supports Phantom, 1Password, LastPass & Bitwarden
                  </p>
                </div>
                <FileText className="w-6 h-6 text-zinc-600" />
              </div>
              <div className="flex gap-2">
                <label className="flex-1">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleImport}
                    className="hidden"
                  />
                  <div className="w-full py-3 bg-zinc-800 text-white text-sm font-medium rounded-xl hover:bg-zinc-700 transition-all flex items-center justify-center gap-2 cursor-pointer border border-zinc-700 hover:border-zinc-600">
                    <Upload className="w-4 h-4" />
                    Import
                  </div>
                </label>
                <button
                  onClick={handleExport}
                  className="flex-1 py-3 bg-zinc-800 text-white text-sm font-medium rounded-xl hover:bg-zinc-700 transition-all flex items-center justify-center gap-2 border border-zinc-700 hover:border-zinc-600"
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>
              </div>
            </div>

            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    Encrypted Backup
                  </h4>
                  <p className="text-xs text-zinc-500 mt-1">
                    Safe backup of your entire vault
                  </p>
                </div>
                <Shield className="w-6 h-6 text-zinc-600" />
              </div>
              <div className="flex gap-2">
                <label className="flex-1">
                  <input
                    type="file"
                    accept=".pv"
                    onChange={handleRestore}
                    className="hidden"
                  />
                  <div className="w-full py-3 bg-zinc-800 text-white text-sm font-medium rounded-xl hover:bg-zinc-700 transition-all flex items-center justify-center gap-2 cursor-pointer border border-zinc-700 hover:border-zinc-600">
                    <Upload className="w-4 h-4" />
                    Restore
                  </div>
                </label>
                <button
                  onClick={handleBackup}
                  className="flex-1 py-3 bg-zinc-800 text-white text-sm font-medium rounded-xl hover:bg-zinc-700 transition-all flex items-center justify-center gap-2 border border-zinc-700 hover:border-zinc-600"
                >
                  <Download className="w-4 h-4" />
                  Backup
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4">
          <button
            onClick={() => setShowConfirmWipe(true)}
            className="w-full py-4 border border-red-500/20 text-red-500 text-sm font-semibold rounded-2xl hover:bg-red-500/10 transition-all flex items-center justify-center gap-2"
          >
            <Trash2 className="w-5 h-5" />
            Wipe Vault Storage
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showConfirmWipe && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirmWipe(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-5 shadow-2xl"
            >
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-white">
                    Wipe Vault?
                  </h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    This will permanently delete all your passwords, cards, and
                    notes. This action{" "}
                    <span className="text-red-400 font-semibold">
                      cannot be undone
                    </span>
                    .
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <button
                  onClick={() => {
                    onClear();
                    setShowConfirmWipe(false);
                  }}
                  className="w-full py-3.5 bg-red-500 text-white text-sm font-semibold rounded-xl hover:bg-red-600 transition-colors"
                >
                  Yes, Wipe Everything
                </button>
                <button
                  onClick={() => setShowConfirmWipe(false)}
                  className="w-full py-3.5 bg-zinc-800 text-white text-sm font-semibold rounded-xl hover:bg-zinc-700 transition-colors border border-zinc-700 hover:border-zinc-600"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
