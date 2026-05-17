import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Lock,
  Download,
  Upload,
  Trash2,
  FileText,
  AlertTriangle,
  KeyRound,
  Eye,
  EyeOff,
  Check,
  X,
} from "lucide-react";
import Papa from "papaparse";
import zxcvbn from "zxcvbn";
import { VaultItem, VaultFolder } from "../types";
import { decrypt, encrypt, hashPassword } from "../lib/crypto";

interface SettingsProps {
  items: VaultItem[];
  folders: VaultFolder[];
  masterPassword: string;
  autoLockTimeout: number;
  theme: string;
  onUpdateTheme: (theme: string) => void;
  onUpdateAutoLock: (timeout: number) => void;
  onBack: () => void;
  onImport: (items: VaultItem[], folders?: VaultFolder[]) => void;
  onLock: () => void;
  onClear: () => void;
  onChangePassword: (oldPassword: string, newPassword: string) => Promise<boolean>;
  onShowToast: (text: string, type?: "success" | "error" | "info") => void;
}

export default function Settings({
  items,
  folders,
  masterPassword,
  autoLockTimeout,
  theme,
  onUpdateTheme,
  onUpdateAutoLock,
  onBack,
  onImport,
  onLock,
  onClear,
  onChangePassword,
  onShowToast,
}: SettingsProps) {
  const [showConfirmWipe, setShowConfirmWipe] = useState(false);
  const [showExportWarning, setShowExportWarning] = useState(false);
  const [exportConfirmText, setExportConfirmText] = useState("");
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const pwStrength = useMemo(() => zxcvbn(newPassword), [newPassword]);

  const handleExport = async () => {
    const decryptedItems = await Promise.all(
      items.map(async (item) => ({
        title: item.title,
        website: item.website,
        username: item.username,
        password: (await decrypt(item.encryptedPassword, masterPassword)) || "",
        category: item.category,
        content: item.content || "",
      }))
    );

    const csv = Papa.unparse(decryptedItems);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `vault_export_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    setShowExportWarning(false);
    setExportConfirmText("");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
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

        const newItems: VaultItem[] = [];
        for (const row of importedData) {
          const title = getValue(row, ["title", "name"]);
          const url = getValue(row, ["url", "website", "login_uri"]);
          const pwd = getValue(row, ["password", "login_password"]);
          if ((title || url) && pwd) {
            const rawPassword = getValue(row, ["password", "login_password"]);
            const encryptedPass = await encrypt(rawPassword, masterPassword);

            const rawTotp = getValue(row, ["totp", "login_totp", "otpauth"]);
            const encryptedTotp = rawTotp
              ? await encrypt(rawTotp, masterPassword)
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

            newItems.push({
              id: crypto.randomUUID(),
              title: getValue(row, ["title", "name"]) || "Imported Item",
              website: getValue(row, ["website", "url", "login_uri"]),
              username: getValue(row, ["username", "login_username"]),
              encryptedPassword: encryptedPass,
              encryptedTotpSecret: encryptedTotp,
              category: cat as any,
              content: getValue(row, ["content", "note", "notes", "extra"]),
              tags: itemTags.length > 0 ? itemTags : undefined,
              updatedAt: Date.now(),
            });
          }
        }

        if (newItems.length > 0) {
          onImport(newItems);
          onShowToast(
            `Successfully imported ${newItems.length} items.`,
            "success",
          );
        } else {
          onShowToast("No valid passwords found in CSV.", "error");
        }
        e.target.value = "";
      },
      error: () => {
        onShowToast("Failed to read CSV file.", "error");
        e.target.value = "";
      },
    });
  };

  const handleBackup = async () => {
    const encryptedVault = await encrypt(JSON.stringify({ items, folders }), masterPassword);
    const blob = new Blob([encryptedVault], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `vault_backup_${new Date().toISOString().split("T")[0]}_${new Date().getTime()}.pv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      try {
        const decrypted = await decrypt(content, masterPassword);
        if (decrypted) {
          const parsed = JSON.parse(decrypted);
          const restoredItems = Array.isArray(parsed) ? parsed : parsed.items || [];
          const restoredFolders = parsed.folders || [];
          onImport(restoredItems, restoredFolders);
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

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      onShowToast("Please fill in all fields", "error");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      onShowToast("New passwords do not match", "error");
      return;
    }
    if (newPassword.length < 8) {
      onShowToast("Password must be at least 8 characters", "error");
      return;
    }
    const strength = zxcvbn(newPassword);
    if (strength.score < 2) {
      onShowToast("Password is too weak. Add more variety or length.", "error");
      return;
    }

    setIsChangingPassword(true);
    const success = await onChangePassword(currentPassword, newPassword);
    setIsChangingPassword(false);

    if (success) {
      setShowChangePassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      onShowToast("Master password changed successfully", "success");
    } else {
      onShowToast("Current password is incorrect", "error");
    }
  };

  const formatTimeout = (ms: number) => {
    if (ms === 0) return "Never";
    if (ms < 60000) return `${ms / 1000}s`;
    if (ms < 3600000) return `${ms / 60000}m`;
    return `${ms / 3600000}h`;
  };

  return (
    <div className="px-4 flex flex-col h-full flex-1 w-full bg-black custom-scrollbar overflow-y-auto pt-4 pb-20">
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onBack}
          className="p-2 -ml-2 hover:bg-zinc-900 rounded-xl text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold text-white tracking-tight">
          Settings
        </h2>
      </div>

      <div className="space-y-4 flex-1">
        {/* Security */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-1">Security</p>
          <div className="bg-zinc-900/30 rounded-2xl divide-y divide-zinc-800/50">
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-white">Auto-Lock</p>
                <p className="text-xs text-zinc-500 mt-0.5">Lock after inactivity</p>
              </div>
              <select
                value={autoLockTimeout.toString()}
                onChange={(e) => onUpdateAutoLock(parseInt(e.target.value))}
                className="bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-3 py-1.5 outline-none focus:border-zinc-500"
              >
                <option value="60000">1 min</option>
                <option value="300000">5 min</option>
                <option value="900000">15 min</option>
                <option value="3600000">1 hour</option>
                <option value="0">Never</option>
              </select>
            </div>
            <button
              onClick={onLock}
              className="w-full flex items-center justify-center gap-2 p-4 text-sm font-medium text-white hover:bg-zinc-800/50 transition-colors"
            >
              <Lock className="w-4 h-4" />
              Lock Vault Now
            </button>
            <button
              onClick={() => setShowChangePassword(true)}
              className="w-full flex items-center justify-center gap-2 p-4 text-sm font-medium text-white hover:bg-zinc-800/50 transition-colors"
            >
              <KeyRound className="w-4 h-4" />
              Change Master Password
            </button>
          </div>
        </div>

        {/* Data */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-1">Data</p>
          <div className="bg-zinc-900/30 rounded-2xl divide-y divide-zinc-800/50">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-white">Import / Export</p>
                  <p className="text-xs text-zinc-500 mt-0.5">CSV from any password manager</p>
                </div>
                <FileText className="w-5 h-5 text-zinc-600" />
              </div>
               <div className="flex gap-2">
                <label className="flex-1">
                  <input type="file" accept=".csv" onChange={handleImport} className="hidden" />
                  <div className="w-full py-2.5 bg-zinc-800 text-white text-xs font-medium rounded-xl hover:bg-zinc-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    Import CSV
                  </div>
                </label>
                <button
                  onClick={() => setShowExportWarning(true)}
                  className="flex-1 py-2.5 bg-zinc-800 text-white text-xs font-medium rounded-xl hover:bg-zinc-700 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-white">Encrypted Backup</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Safe vault backup (.pv)</p>
                </div>
                <img src="/logo.svg" alt="Phantom" className="w-5 h-5" />
              </div>
              <div className="flex gap-2">
                <label className="flex-1">
                  <input type="file" accept=".pv" onChange={handleRestore} className="hidden" />
                  <div className="w-full py-2.5 bg-zinc-800 text-white text-xs font-medium rounded-xl hover:bg-zinc-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    Restore
                  </div>
                </label>
                <button
                  onClick={handleBackup}
                  className="flex-1 py-2.5 bg-zinc-800 text-white text-xs font-medium rounded-xl hover:bg-zinc-700 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Backup
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="pt-2">
          <button
            onClick={() => setShowConfirmWipe(true)}
            className="w-full py-3 rounded-xl text-red-400 font-medium hover:bg-red-500/10 transition-colors text-sm flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Wipe Vault Storage
          </button>
        </div>
      </div>

      {/* Export Warning Modal */}
      <AnimatePresence>
        {showExportWarning && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowExportWarning(false); setExportConfirmText(""); }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-2xl"
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-yellow-500" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-semibold text-white">Export Warning</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    This will export all passwords in <span className="text-yellow-400 font-semibold">plaintext</span>. Store the file securely and delete it after use.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  value={exportConfirmText}
                  onChange={(e) => setExportConfirmText(e.target.value)}
                  placeholder='Type "EXPORT" to confirm'
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-xl px-3 py-2.5 outline-none focus:border-zinc-500 placeholder:text-zinc-500"
                />
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={handleExport}
                  disabled={exportConfirmText !== "EXPORT"}
                  className="w-full py-3 bg-yellow-500 text-black text-xs font-semibold rounded-xl hover:bg-yellow-400 disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-500 transition-colors"
                >
                  Export Plaintext CSV
                </button>
                <button
                  onClick={() => { setShowExportWarning(false); setExportConfirmText(""); }}
                  className="w-full py-3 bg-zinc-800 text-white text-xs font-semibold rounded-xl hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Wipe Confirmation Modal */}
      <AnimatePresence>
        {showConfirmWipe && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirmWipe(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-2xl"
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-semibold text-white">Wipe Vault?</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    This will permanently delete all passwords, cards, and notes.
                    This action <span className="text-red-400 font-semibold">cannot be undone</span>.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => { onClear(); setShowConfirmWipe(false); }}
                  className="w-full py-3 bg-red-500 text-white text-xs font-semibold rounded-xl hover:bg-red-600 transition-colors"
                >
                  Yes, Wipe Everything
                </button>
                <button
                  onClick={() => setShowConfirmWipe(false)}
                  className="w-full py-3 bg-zinc-800 text-white text-xs font-semibold rounded-xl hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Change Master Password Modal */}
      <AnimatePresence>
        {showChangePassword && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowChangePassword(false); setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword(""); }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">Change Master Password</h3>
                <button
                  onClick={() => { setShowChangePassword(false); setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword(""); }}
                  className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-zinc-400" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <label className="text-[11px] font-medium text-zinc-500 mb-1 block">Current Password</label>
                  <div className="relative">
                    <input
                      type={showCurrentPw ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2.5 pr-10 outline-none focus:border-zinc-500 placeholder:text-zinc-500"
                      placeholder="Enter current password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPw(!showCurrentPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                    >
                      {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <label className="text-[11px] font-medium text-zinc-500 mb-1 block">New Password</label>
                  <div className="relative">
                    <input
                      type={showNewPw ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2.5 pr-10 outline-none focus:border-zinc-500 placeholder:text-zinc-500"
                      placeholder="Enter new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw(!showNewPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                    >
                      {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {newPassword && (
                    <div className="mt-2 space-y-1.5">
                      <div className="flex gap-1">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              i < pwStrength.score
                                ? pwStrength.score <= 1
                                  ? "bg-red-500"
                                  : pwStrength.score <= 2
                                  ? "bg-yellow-500"
                                  : pwStrength.score <= 3
                                  ? "bg-blue-500"
                                  : "bg-green-500"
                                : "bg-zinc-700"
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-[10px] text-zinc-500">
                        {pwStrength.feedback.warning || (pwStrength.score >= 3 ? "Strong password" : "Weak password")}
                      </p>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <label className="text-[11px] font-medium text-zinc-500 mb-1 block">Confirm New Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPw ? "text" : "password"}
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      className={`w-full bg-zinc-800 border text-sm rounded-xl px-3 py-2.5 pr-10 outline-none focus:border-zinc-500 placeholder:text-zinc-500 ${
                        confirmNewPassword && confirmNewPassword !== newPassword
                          ? "border-red-500/50"
                          : confirmNewPassword && confirmNewPassword === newPassword
                          ? "border-green-500/50"
                          : "border-zinc-700"
                      }`}
                      placeholder="Confirm new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPw(!showConfirmPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                    >
                      {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    {confirmNewPassword && confirmNewPassword === newPassword && (
                      <Check className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={handleChangePassword}
                  disabled={isChangingPassword || !currentPassword || !newPassword || !confirmNewPassword || newPassword !== confirmNewPassword}
                  className="w-full py-3 bg-white text-black text-xs font-semibold rounded-xl hover:bg-zinc-200 disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-500 transition-colors flex items-center justify-center gap-2"
                >
                  {isChangingPassword ? (
                    <>
                      <div className="w-4 h-4 border-2 border-zinc-400 border-t-black rounded-full animate-spin" />
                      Re-encrypting vault...
                    </>
                  ) : (
                    "Change Password"
                  )}
                </button>
                <button
                  onClick={() => { setShowChangePassword(false); setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword(""); }}
                  className="w-full py-3 bg-zinc-800 text-white text-xs font-semibold rounded-xl hover:bg-zinc-700 transition-colors"
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
