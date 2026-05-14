/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Lock,
  Download,
  Upload,
  Shield,
  Key,
  Settings,
  Sparkles,
  Copy,
  RefreshCcw,
  LayoutDashboard,
} from "lucide-react";
import {
  hashPassword,
  encrypt,
  decrypt,
  generateRandomPassword,
  calculateTimeToCrack,
} from "./lib/crypto";
import { checkPasswordBreach } from "./lib/hibp";
import { VaultItem, VaultFolder, View } from "./types";
import UnlockScreen from "./components/UnlockScreen.tsx";
import VaultList from "./components/VaultList.tsx";
import AddVaultItem from "./components/AddVaultItem.tsx";
import DashboardView from "./components/Dashboard";
import SettingsView from "./components/Settings";

const STORAGE_KEY = "phantom_vault_data";
const MASTER_HASH_KEY = "phantom_vault_master";

export default function App() {
  const [view, setView] = useState<View>("unlock");
  const [masterPassword, setMasterPassword] = useState("");
  const [items, setItems] = useState<VaultItem[]>([]);
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [editingItem, setEditingItem] = useState<VaultItem | undefined>(
    undefined,
  );
  const [isInitialized, setIsInitialized] = useState(false);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [autoLockTimeout, setAutoLockTimeout] = useState<number>(() => {
    const saved = localStorage.getItem("phantom_vault_autolock");
    return saved ? parseInt(saved, 10) : 5 * 60 * 1000;
  });
  const [breachedIds, setBreachedIds] = useState<string[]>([]);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("phantom_vault_theme");
    return saved || "apple-blue";
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const [toast, setToast] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const showToast = (
    text: string,
    type: "success" | "error" | "info" = "info",
  ) => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Security Audit
  const securityAudit = useMemo(() => {
    if (!masterPassword || items.length === 0)
      return {
        score: 100,
        weak: 0,
        reused: 0,
        old: 0,
        breached: 0,
        breachedIds: [],
      };

    const decryptedPasswords: Record<string, string[]> = {};
    let weakCount = 0;
    let oldCount = 0;
    const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;

    items.forEach((item) => {
      if (item.category !== "Login") return;

      // Weak check
      if ((item.strength || 0) < 3) weakCount++;

      // Age check
      if (Date.now() - item.updatedAt > NINETY_DAYS) oldCount++;

      // Reuse check
      try {
        const pass = decrypt(item.encryptedPassword, masterPassword);
        if (pass) {
          if (!decryptedPasswords[pass]) decryptedPasswords[pass] = [];
          decryptedPasswords[pass].push(item.id);
        }
      } catch (e) {
        console.error("Audit decryption failed", e);
      }
    });

    let reusedCount = 0;
    Object.values(decryptedPasswords).forEach((ids) => {
      if (ids.length > 1) reusedCount += ids.length;
    });

    // Breached count is derived from state
    const currentBreachedIds = items
      .filter((i) => breachedIds.includes(i.id))
      .map((i) => i.id);
    const breachedCount = currentBreachedIds.length;

    const totalLogins = items.filter((i) => i.category === "Login").length;
    if (totalLogins === 0)
      return {
        score: 100,
        weak: 0,
        reused: 0,
        old: 0,
        breached: 0,
        breachedIds: [],
      };

    // Calculate score: Deduct for each issue
    const deductions =
      weakCount * 15 + reusedCount * 20 + oldCount * 5 + breachedCount * 40;
    const score = Math.max(
      0,
      100 - Math.round((deductions / (totalLogins * 40)) * 100),
    );

    return {
      score,
      weak: weakCount,
      reused: reusedCount,
      old: oldCount,
      breached: breachedCount,
      breachedIds: currentBreachedIds,
    };
  }, [items, masterPassword, breachedIds]);

  // Check for breached passwords
  useEffect(() => {
    let isMounted = true;

    const checkBreaches = async () => {
      if (!masterPassword || items.length === 0) return;

      const newBreachedIds: string[] = [];
      const cache = new Map<string, number>();

      for (const item of items) {
        if (item.category !== "Login") continue;
        try {
          const pass = decrypt(item.encryptedPassword, masterPassword);
          if (pass) {
            let count = 0;
            if (cache.has(pass)) {
              count = cache.get(pass)!;
            } else {
              count = await checkPasswordBreach(pass);
              cache.set(pass, count);
            }
            if (count > 0) {
              newBreachedIds.push(item.id);
            }
          }
        } catch (e) {
          // Ignore decryption error for partial state
        }
      }

      if (isMounted) {
        setBreachedIds(newBreachedIds);
      }
    };

    checkBreaches();

    return () => {
      isMounted = false;
    };
  }, [items, masterPassword]);

  // Generator State
  const [genLength, setGenLength] = useState(16);
  const [genOptions, setGenOptions] = useState({
    numbers: true,
    symbols: true,
    uppercase: true,
  });
  const [generatedPass, setGeneratedPass] = useState("");

  useEffect(() => {
    setGeneratedPass(generateRandomPassword(genLength, genOptions));
  }, [genLength, genOptions]);

  // Check if vault is already setup
  useEffect(() => {
    const masterHash = localStorage.getItem(MASTER_HASH_KEY);
    if (!masterHash) {
      setView("setup");
    }
    setIsInitialized(true);
  }, []);

  // Session Timeout logic
  useEffect(() => {
    if (!masterPassword || autoLockTimeout === 0) return;

    const interval = setInterval(() => {
      if (Date.now() - lastActivity > autoLockTimeout) {
        setMasterPassword("");
        setView("unlock");
      }
    }, 10000); // Check every 10 seconds

    const updateActivity = () => setLastActivity(Date.now());

    // Panic tab switch lock
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        setMasterPassword("");
        setView("unlock");
      }
    };

    window.addEventListener("mousemove", updateActivity);
    window.addEventListener("keydown", updateActivity);
    window.addEventListener("click", updateActivity);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener("mousemove", updateActivity);
      window.removeEventListener("keydown", updateActivity);
      window.removeEventListener("click", updateActivity);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [masterPassword, lastActivity]);

  // Load and decrypt items when master password is set
  useEffect(() => {
    if (!masterPassword) return;

    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const decrypted = decrypt(savedData, masterPassword);
        if (decrypted) {
          const parsed = JSON.parse(decrypted);

          let parsedItems = [];
          let parsedFolders = [];

          if (Array.isArray(parsed)) {
            parsedItems = parsed;
          } else if (parsed && typeof parsed === "object") {
            parsedItems = parsed.items || [];
            parsedFolders = parsed.folders || [];
          }

          // Automatic 30-day trash deletion
          const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
          const now = Date.now();
          let itemsChanged = false;
          const cleanItems = parsedItems.filter((item: VaultItem) => {
            if (item.deletedAt && now - item.deletedAt > THIRTY_DAYS) {
              itemsChanged = true;
              return false; // permanently delete
            }
            return true;
          });

          setItems(cleanItems);
          setFolders(parsedFolders);

          if (itemsChanged) {
            const encrypted = encrypt(
              JSON.stringify({ items: cleanItems, folders: parsedFolders }),
              masterPassword,
            );
            localStorage.setItem(STORAGE_KEY, encrypted);
          }
        }
      } catch (e) {
        console.error("Failed to load vault items", e);
      }
    }
  }, [masterPassword]);

  // Save and encrypt items whenever they change
  const saveItems = (
    newItems: VaultItem[],
    targetFolders: VaultFolder[] = folders,
  ) => {
    if (!masterPassword) return;
    const encrypted = encrypt(
      JSON.stringify({ items: newItems, folders: targetFolders }),
      masterPassword,
    );
    localStorage.setItem(STORAGE_KEY, encrypted);
    setItems(newItems);
    setFolders(targetFolders);
  };

  const handleUnlock = (password: string) => {
    if (lockoutUntil && Date.now() < lockoutUntil) {
      return false;
    }
    const hashed = hashPassword(password);
    const storedHash = localStorage.getItem(MASTER_HASH_KEY);

    if (!storedHash) {
      // First time setup
      localStorage.setItem(MASTER_HASH_KEY, hashed);
      setMasterPassword(password);
      setView("home");
      return true;
    }

    if (hashed === storedHash) {
      setMasterPassword(password);
      setFailedAttempts(0);
      setLockoutUntil(null);
      setView("home");
      return true;
    } else {
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      if (newAttempts >= 5) {
        setLockoutUntil(Date.now() + 5 * 60 * 1000); // 5 minutes
        setFailedAttempts(0);
      }
      return false;
    }
  };

  const handleAdd = (newItem: Partial<VaultItem>) => {
    let history = newItem.passwordHistory || [];

    if (newItem.id) {
      const existingItem = items.find((i) => i.id === newItem.id);
      if (
        existingItem &&
        newItem.category === "Login" &&
        newItem.encryptedPassword
      ) {
        const oldPassRaw = decrypt(
          existingItem.encryptedPassword,
          masterPassword,
        );
        if (oldPassRaw !== newItem.encryptedPassword) {
          // Password changed, save old one to history
          history = [
            {
              password: existingItem.encryptedPassword,
              timestamp: existingItem.updatedAt,
            },
            ...(existingItem.passwordHistory || []),
          ].slice(0, 5); // Keep last 5 entries
        }
      } else if (existingItem && existingItem.passwordHistory) {
        history = existingItem.passwordHistory;
      }
    }

    const itemToAdd: VaultItem = {
      id: newItem.id || Math.random().toString(36).substring(2, 9),
      category: newItem.category || "Login",
      title: newItem.title!,
      website: newItem.website || "",
      username: newItem.username || "",
      encryptedPassword: encrypt(
        newItem.encryptedPassword || "",
        masterPassword,
      ),
      encryptedTotpSecret: newItem.encryptedTotpSecret,
      content: newItem.content || "",
      cardDetails: newItem.cardDetails,
      passwordHistory: history,
      strength: newItem.strength || 0,
      tags: newItem.tags || [],
      deletedAt: items.find((i) => i.id === newItem.id)?.deletedAt,
      updatedAt: Date.now(),
    };

    let newItems;
    if (newItem.id) {
      newItems = items.map((i) => (i.id === newItem.id ? itemToAdd : i));
      showToast("Item updated successfully", "success");
    } else {
      newItems = [itemToAdd, ...items];
      showToast("Item saved successfully", "success");
    }

    saveItems(newItems);
    setView("home");
  };

  const handleDelete = (id: string, permanent: boolean = false) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    if (item.deletedAt && permanent) {
      const newItems = items.filter((i) => i.id !== id);
      saveItems(newItems);
      showToast("Item permanently deleted", "success");
    } else {
      const newItems = items.map((i) =>
        i.id === id ? { ...i, deletedAt: Date.now() } : i,
      );
      saveItems(newItems);
      showToast("Item moved to trash", "success");
    }
    setView("home");
  };

  const handleRestore = (id: string) => {
    const newItems = items.map((i) =>
      i.id === id ? { ...i, deletedAt: undefined } : i,
    );
    saveItems(newItems);
    showToast("Item restored", "success");
    setView("home");
  };

  const handleMoveToFolder: (id: string, folderId: string | null) => void = (
    id,
    folderId,
  ) => {
    const newItems = items.map((i) =>
      i.id === id ? { ...i, folderId: folderId || undefined } : i,
    );
    saveItems(newItems);
  };

  const handleRenameFolder = (folderId: string, newName: string) => {
    const newFolders = folders.map((f) =>
      f.id === folderId ? { ...f, name: newName } : f,
    );
    saveItems(items, newFolders);
    showToast("Folder renamed", "success");
  };

  const handleDeleteFolder = (folderId: string) => {
    const newItems = items.map((i) =>
      i.folderId === folderId ? { ...i, folderId: undefined } : i,
    );
    const newFolders = folders.filter((f) => f.id !== folderId);
    saveItems(newItems, newFolders);
    showToast("Folder deleted", "success");
  };

  const handleBulkMove = (itemIds: string[], folderId: string | null) => {
    const newItems = items.map((i) =>
      itemIds.includes(i.id) ? { ...i, folderId: folderId || undefined } : i,
    );
    saveItems(newItems);
    showToast(`Moved ${itemIds.length} items`);
  };

  const handleBulkDelete = (itemIds: string[], permanent: boolean = false) => {
    if (permanent) {
      const newItems = items.filter((i) => !itemIds.includes(i.id));
      saveItems(newItems);
      showToast(`${itemIds.length} items permanently deleted`, "success");
    } else {
      const newItems = items.map((i) =>
        itemIds.includes(i.id) ? { ...i, deletedAt: Date.now() } : i,
      );
      saveItems(newItems);
      showToast(`${itemIds.length} items moved to trash`, "success");
    }
  };

  const handleBulkRestore = (itemIds: string[]) => {
    const newItems = items.map((i) =>
      itemIds.includes(i.id) ? { ...i, deletedAt: undefined } : i,
    );
    saveItems(newItems);
    showToast(`${itemIds.length} items restored`, "success");
  };

  const decryptedEditingPassword = useMemo(() => {
    if (!editingItem || !masterPassword) return "";
    return decrypt(editingItem.encryptedPassword, masterPassword) || "";
  }, [editingItem, masterPassword]);

  if (!isInitialized) return null;

  return (
    <div className="min-h-screen bg-black flex items-center justify-center md:p-4">
      {/* Simulation of a chrome extension container */}
      <div className="w-full md:w-[360px] h-full md:h-[600px] max-h-[600px] mx-auto bg-black md:rounded-[32px] overflow-hidden md:border border-white/10 md:shadow-2xl relative">
        <AnimatePresence mode="wait">
          {(view === "unlock" || view === "setup") && (
            <motion.div
              key="unlock"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              <UnlockScreen
                onUnlock={handleUnlock}
                isFirstTime={view === "setup"}
                lockoutUntil={lockoutUntil}
              />
            </motion.div>
          )}

          {view === "home" && (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full relative"
            >
              <VaultList
                items={items}
                folders={folders}
                audit={securityAudit}
                masterPassword={masterPassword}
                onShowToast={showToast}
                onAdd={() => {
                  setEditingItem(undefined);
                  setView("add");
                }}
                onAddFolder={(name, color) => {
                  const newFolder = {
                    id: Math.random().toString(36).substring(2, 9),
                    name,
                    color,
                  };
                  saveItems(items, [...folders, newFolder]);
                  showToast("Folder created", "success");
                }}
                onRenameFolder={handleRenameFolder}
                onDeleteFolder={handleDeleteFolder}
                onMoveToFolder={(id, folderId) => {
                  handleMoveToFolder(id, folderId);
                }}
                onBulkMove={handleBulkMove}
                onBulkDelete={handleBulkDelete}
                onBulkRestore={handleBulkRestore}
                onEdit={(item) => {
                  setEditingItem(item);
                  setView("edit");
                }}
                onDashboard={() => setView("dashboard")}
                onSettings={() => setView("settings")}
              />
              {/* Overriding Footer interaction to support Generator view toggle */}
              <div className="absolute bottom-0 left-0 w-full h-[68px] bg-black border-t border-zinc-900/80 flex justify-center gap-12 text-zinc-500 text-[10px] uppercase font-semibold">
                <button
                  onClick={() => setView("home")}
                  className={`transition-colors flex flex-col items-center justify-center gap-1.5 ${view === "home" ? "text-white" : "hover:text-zinc-300"}`}
                >
                  <Shield className="w-5 h-5" />
                  <span>Vault</span>
                </button>
                <button
                  onClick={() => setView("dashboard")}
                  className={`transition-colors flex flex-col items-center justify-center gap-1.5 ${view === "dashboard" ? "text-white" : "hover:text-zinc-300"}`}
                >
                  <LayoutDashboard className="w-5 h-5" />
                  <span>Audit</span>
                </button>
                <button
                  onClick={() => setView("generator")}
                  className={`transition-colors flex flex-col items-center justify-center gap-1.5 ${view === "generator" ? "text-white" : "hover:text-zinc-300"}`}
                >
                  <Sparkles className="w-5 h-5" />
                  <span>Gen</span>
                </button>
                <button
                  onClick={() => setView("settings")}
                  className={`transition-colors flex flex-col items-center justify-center gap-1.5 ${view === "settings" ? "text-white" : "hover:text-zinc-300"}`}
                >
                  <Settings className="w-5 h-5" />
                  <span>Sync</span>
                </button>
              </div>
            </motion.div>
          )}

          {(view === "add" || view === "edit") && (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              <AddVaultItem
                item={editingItem}
                folders={folders}
                masterPassword={masterPassword}
                decryptedPassword={decryptedEditingPassword}
                onSave={handleAdd}
                onDelete={handleDelete}
                onRestore={handleRestore}
                onCancel={() => setView("home")}
              />
            </motion.div>
          )}

          {view === "dashboard" && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="h-full relative"
            >
              <DashboardView
                items={items}
                audit={securityAudit}
                masterPassword={masterPassword}
                onBack={() => setView("home")}
                onEdit={(item) => {
                  setEditingItem(item);
                  setView("edit");
                }}
              />
              <div className="absolute bottom-0 left-0 w-full h-[68px] bg-black border-t border-zinc-900/80 flex justify-center gap-12 text-zinc-500 text-[10px] uppercase font-semibold">
                <button
                  onClick={() => setView("home")}
                  className={`transition-colors flex flex-col items-center justify-center gap-1.5 ${view === "home" ? "text-white" : "hover:text-zinc-300"}`}
                >
                  <Shield className="w-5 h-5" />
                  <span>Vault</span>
                </button>
                <button
                  onClick={() => setView("dashboard")}
                  className={`transition-colors flex flex-col items-center justify-center gap-1.5 ${view === "dashboard" ? "text-white" : "hover:text-zinc-300"}`}
                >
                  <LayoutDashboard className="w-5 h-5" />
                  <span>Audit</span>
                </button>
                <button
                  onClick={() => setView("generator")}
                  className={`transition-colors flex flex-col items-center justify-center gap-1.5 ${view === "generator" ? "text-white" : "hover:text-zinc-300"}`}
                >
                  <Sparkles className="w-5 h-5" />
                  <span>Gen</span>
                </button>
                <button
                  onClick={() => setView("settings")}
                  className={`transition-colors flex flex-col items-center justify-center gap-1.5 ${view === "settings" ? "text-white" : "hover:text-zinc-300"}`}
                >
                  <Settings className="w-5 h-5" />
                  <span>Sync</span>
                </button>
              </div>
            </motion.div>
          )}

          {view === "generator" && (
            <motion.div
              key="generator"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-6 flex flex-col h-full bg-black custom-scrollbar"
            >
              <div className="flex items-center gap-4 mb-8 pt-2">
                <button
                  onClick={() => setView("home")}
                  className="p-2 -ml-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-900 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-semibold text-white tracking-tight">
                  Password Generator
                </h2>
              </div>

              <div className="space-y-8 flex-1">
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-[24px] p-6 text-center space-y-6">
                  <p className="text-2xl font-mono text-white break-all tracking-tight leading-tight select-all">
                    {generatedPass}
                  </p>

                  <div className="flex items-center justify-between text-xs font-semibold px-2">
                    <span className="text-zinc-500 uppercase tracking-widest">
                      Time to Crack
                    </span>
                    <span
                      className={`px-2.5 py-1 rounded-full ${
                        calculateTimeToCrack(generatedPass).score >= 4
                          ? "bg-green-500/10 text-green-400"
                          : calculateTimeToCrack(generatedPass).score >= 2
                            ? "bg-yellow-500/10 text-yellow-400"
                            : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {calculateTimeToCrack(generatedPass).time}
                    </span>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generatedPass);
                        showToast("Password copied to clipboard", "success");
                      }}
                      className="flex-1 bg-white hover:bg-zinc-200 text-black font-semibold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <Copy className="w-4 h-4" />
                      Copy Password
                    </button>
                    <button
                      onClick={() =>
                        setGeneratedPass(
                          generateRandomPassword(genLength, genOptions),
                        )
                      }
                      className="p-3.5 bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 transition-all border border-zinc-700 hover:border-zinc-600"
                    >
                      <RefreshCcw className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-6 px-1">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-semibold text-white">
                        Password Length
                      </span>
                      <span className="font-mono text-zinc-400 bg-zinc-900 py-1 px-2 rounded-lg">
                        {genLength}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="8"
                      max="64"
                      value={genLength}
                      onChange={(e) => setGenLength(parseInt(e.target.value))}
                      className="w-full accent-white h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer"
                    />
                  </div>

                  <div className="space-y-3 pt-4">
                    <span className="text-sm font-semibold text-white">
                      Characters
                    </span>
                    <div className="grid grid-cols-1 gap-2 border border-zinc-800 rounded-2xl p-1 bg-zinc-900/30">
                      {[
                        { id: "numbers", label: "Numbers (0-9)" },
                        { id: "symbols", label: "Symbols (!@#$)" },
                        { id: "uppercase", label: "Uppercase (A-Z)" },
                      ].map((opt, i) => (
                        <button
                          key={opt.id}
                          onClick={() =>
                            setGenOptions({
                              ...genOptions,
                              [opt.id]:
                                !genOptions[opt.id as keyof typeof genOptions],
                            })
                          }
                          className={`flex items-center justify-between p-3.5 rounded-xl transition-all ${
                            genOptions[opt.id as keyof typeof genOptions]
                              ? "bg-zinc-800 text-white"
                              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                          }`}
                        >
                          <span className="text-sm font-medium">
                            {opt.label}
                          </span>
                          <div
                            className={`w-5 h-5 flex items-center justify-center ${genOptions[opt.id as keyof typeof genOptions] ? "text-white" : "text-zinc-700"}`}
                          >
                            {genOptions[opt.id as keyof typeof genOptions] ? (
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                className="w-5 h-5"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                            ) : (
                              <div className="w-4 h-4 rounded-full border-2 border-current" />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute bottom-0 left-0 w-full h-[68px] bg-black border-t border-zinc-900/80 flex justify-center gap-12 text-zinc-500 text-[10px] uppercase font-semibold pb-safe">
                <button
                  onClick={() => setView("home")}
                  className={`transition-colors flex flex-col items-center justify-center gap-1.5 ${view === "home" ? "text-white" : "hover:text-zinc-300"}`}
                >
                  <Shield className="w-5 h-5" />
                  <span>Vault</span>
                </button>
                <button
                  onClick={() => setView("dashboard")}
                  className={`transition-colors flex flex-col items-center justify-center gap-1.5 ${view === "dashboard" ? "text-white" : "hover:text-zinc-300"}`}
                >
                  <LayoutDashboard className="w-5 h-5" />
                  <span>Audit</span>
                </button>
                <button
                  onClick={() => setView("generator")}
                  className={`transition-colors flex flex-col items-center justify-center gap-1.5 ${view === "generator" ? "text-white" : "hover:text-zinc-300"}`}
                >
                  <Sparkles className="w-5 h-5" />
                  <span>Gen</span>
                </button>
                <button
                  onClick={() => setView("settings")}
                  className={`transition-colors flex flex-col items-center justify-center gap-1.5 ${view === "settings" ? "text-white" : "hover:text-zinc-300"}`}
                >
                  <Settings className="w-5 h-5" />
                  <span>Sync</span>
                </button>
              </div>
            </motion.div>
          )}

          {view === "settings" && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="h-full relative"
            >
              <SettingsView
                items={items}
                masterPassword={masterPassword}
                autoLockTimeout={autoLockTimeout}
                theme={theme}
                onUpdateTheme={(newTheme) => {
                  setTheme(newTheme);
                  localStorage.setItem("phantom_vault_theme", newTheme);
                  showToast("Theme updated", "success");
                }}
                onUpdateAutoLock={(timeout) => {
                  setAutoLockTimeout(timeout);
                  localStorage.setItem(
                    "phantom_vault_autolock",
                    timeout.toString(),
                  );
                  showToast("Auto-lock timeout updated", "success");
                }}
                onBack={() => setView("home")}
                onShowToast={showToast}
                onImport={(newItems) => {
                  const combinedItems = [...items];
                  newItems.forEach((ni) => {
                    if (
                      !combinedItems.find(
                        (ci) =>
                          ci.title === ni.title && ci.username === ni.username,
                      )
                    ) {
                      combinedItems.push(ni);
                    }
                  });
                  saveItems(combinedItems);
                }}
                onLock={() => {
                  setMasterPassword("");
                  setView("unlock");
                }}
                onClear={() => {
                  localStorage.clear();
                  setItems([]);
                  setMasterPassword("");
                  setView("setup");
                  // Use a small timeout to ensure state updates before reload,
                  // or just skip reload if we cleared everything.
                  // reloading is safer to clear any sensitive memory.
                  setTimeout(() => {
                    window.location.reload();
                  }, 100);
                }}
              />
              <div className="absolute bottom-0 left-0 w-full h-[68px] bg-black border-t border-zinc-900/80 flex justify-center gap-12 text-zinc-500 text-[10px] uppercase font-semibold">
                <button
                  onClick={() => setView("home")}
                  className={`transition-colors flex flex-col items-center justify-center gap-1.5 ${view === "home" ? "text-white" : "hover:text-zinc-300"}`}
                >
                  <Shield className="w-5 h-5" />
                  <span>Vault</span>
                </button>
                <button
                  onClick={() => setView("dashboard")}
                  className={`transition-colors flex flex-col items-center justify-center gap-1.5 ${view === "dashboard" ? "text-white" : "hover:text-zinc-300"}`}
                >
                  <LayoutDashboard className="w-5 h-5" />
                  <span>Audit</span>
                </button>
                <button
                  onClick={() => setView("generator")}
                  className={`transition-colors flex flex-col items-center justify-center gap-1.5 ${view === "generator" ? "text-white" : "hover:text-zinc-300"}`}
                >
                  <Sparkles className="w-5 h-5" />
                  <span>Gen</span>
                </button>
                <button
                  onClick={() => setView("settings")}
                  className={`transition-colors flex flex-col items-center justify-center gap-1.5 ${view === "settings" ? "text-white" : "hover:text-zinc-300"}`}
                >
                  <Settings className="w-5 h-5" />
                  <span>Sync</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className="fixed top-6 left-6 right-6 z-50 pointer-events-none flex justify-center"
            >
              <div
                className={`px-4 py-3 rounded-xl border flex items-center gap-3 shadow-2xl pointer-events-auto ${
                  toast.type === "success"
                    ? "bg-zinc-900 border-green-500/30 text-green-400"
                    : toast.type === "error"
                      ? "bg-zinc-900 border-red-500/30 text-red-400"
                      : "bg-zinc-900 border-zinc-700 text-zinc-200"
                }`}
              >
                {toast.type === "error" ? (
                  <Settings className="w-5 h-5 text-red-500" />
                ) : (
                  <Shield className="w-5 h-5" />
                )}
                <span className="text-sm font-medium">{toast.text}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
