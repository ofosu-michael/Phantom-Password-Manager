/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Lock,
  Download,
  Upload,
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
  decryptLegacy,
  generateRandomPassword,
  calculateTimeToCrack,
  generateSecureId,
  needsMigration,
  migrateVault,
} from "./lib/crypto";
import { checkPasswordBreach } from "./lib/hibp";
import { VaultItem, VaultFolder, View } from "./types";
import UnlockScreen from "./components/UnlockScreen.tsx";
import VaultList from "./components/VaultList.tsx";
import AddVaultItem from "./components/AddVaultItem.tsx";
import ItemPreview from "./components/ItemPreview.tsx";
import DashboardView from "./components/Dashboard";
import SettingsView from "./components/Settings";
import { ErrorBoundary } from "./components/ErrorBoundary";
import ImportVaultModal from "./components/ImportVaultModal";
import BottomNav from "./components/BottomNav";

const STORAGE_KEY = "phantom_vault_data";
const MASTER_HASH_KEY = "phantom_vault_master";
const SESSION_KEY = "phantom_session_token";

export default function App() {
  const [view, setView] = useState<View>("unlock");
  const [masterPassword, setMasterPassword] = useState("");
  const [items, setItems] = useState<VaultItem[]>([]);
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [editingItem, setEditingItem] = useState<VaultItem | undefined>(undefined);
  const [pendingPassword, setPendingPassword] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [autoLockTimeout, setAutoLockTimeout] = useState<number>(() => {
    const saved = localStorage.getItem("phantom_vault_autolock");
    const parsed = saved ? parseInt(saved, 10) : 5 * 60 * 1000;
    return isNaN(parsed) ? 5 * 60 * 1000 : parsed;
  });
  const [breachedIds, setBreachedIds] = useState<string[]>([]);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("phantom_vault_theme");
    return saved || "apple-blue";
  });
  const [isSaving, setIsSaving] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const importedVaultDataRef = useRef<{ items: VaultItem[]; folders: VaultFolder[] } | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const sessionTokenRef = useRef<string | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    const handlePendingCredential = (cred: any) => {
      if (Date.now() - cred.timestamp < 5 * 60 * 1000) {
        setPendingPassword(cred.password);
        setEditingItem({
          id: "",
          category: "Login",
          title: cred.url,
          website: cred.url,
          username: cred.username,
          encryptedPassword: "",
          updatedAt: Date.now(),
        });
        setView("add");
      }
    };

    const handlePendingNote = (note: any) => {
      if (Date.now() - note.timestamp < 5 * 60 * 1000) {
        setPendingPassword("");
        setEditingItem({
          id: "",
          category: "Note",
          title: "Highlighted Note",
          website: note.url,
          username: "",
          encryptedPassword: "",
          content: note.text,
          updatedAt: Date.now(),
        });
        setView("add");
      }
    };

    const checkStorage = () => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(
          ["phantom_pending_credential", "phantom_pending_note"],
          (result) => {
            if (result.phantom_pending_credential) {
              handlePendingCredential(result.phantom_pending_credential);
              chrome.storage.local.remove("phantom_pending_credential");
            }
            if (result.phantom_pending_note) {
              handlePendingNote(result.phantom_pending_note);
              chrome.storage.local.remove("phantom_pending_note");
            }
          }
        );
      }
    };

    checkStorage();

    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
      const messageListener = (msg: any) => {
        if (msg.type === "PROMPT_SAVE_PASSWORD" || msg.type === "PROMPT_SAVE_NOTE") {
          checkStorage();
        }
      };
      chrome.runtime.onMessage.addListener(messageListener);
      return () => chrome.runtime.onMessage.removeListener(messageListener);
    }
  }, []);

  useEffect(() => {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
      const credentialListener = (msg: any, sender: any, sendResponse: any) => {
        if (msg.type === "REQUEST_CREDENTIALS") {
          if (!masterPassword) {
            sendResponse({ success: false, locked: true });
            return true;
          }

          const domain = msg.domain || "";
          const matchedCredentials = items
            .filter((item) => {
              if (item.category !== "Login" || !item.website) return false;
              const w = item.website.toLowerCase();
              const d = domain.toLowerCase();
              if (w.includes(d) || d.includes(w)) return true;
              try {
                const host = new URL(w.startsWith("http") ? w : `https://${w}`).hostname;
                return host.includes(d) || d.includes(host);
              } catch (e) {
                return false;
              }
            });

          Promise.all(
            matchedCredentials.map(async (item) => {
              try {
                const password = await decrypt(item.encryptedPassword, masterPassword);
                return {
                  id: item.id,
                  title: item.title,
                  username: item.username,
                  password,
                };
              } catch (e) {
                return null;
              }
            })
          ).then((results) => {
            sendResponse({ success: true, credentials: results.filter(Boolean) });
          });

          return true;
        }

        if (msg.type === "CHECK_CREDENTIAL_EXISTS") {
          if (!masterPassword) {
            sendResponse({ exists: false, locked: true });
            return true;
          }

          const domain = msg.domain || "";
          const username = msg.username || "";
          const password = msg.password || "";

          (async () => {
            for (const item of items) {
              if (item.category !== "Login" || !item.website) continue;

              const w = item.website.toLowerCase();
              const d = domain.toLowerCase();
              let domainMatch = false;

              if (w.includes(d) || d.includes(w)) domainMatch = true;
              else {
                try {
                  const host = new URL(w.startsWith("http") ? w : `https://${w}`).hostname;
                  if (host.includes(d) || d.includes(host)) domainMatch = true;
                } catch (e) {}
              }

              if (!domainMatch) continue;
              if (item.username !== username) continue;

              try {
                const decrypted = await decrypt(item.encryptedPassword, masterPassword);
                if (decrypted === password) {
                  sendResponse({ exists: true, locked: false });
                  return;
                }
              } catch (e) {}
            }
            sendResponse({ exists: false, locked: false });
          })();

          return true;
        }
      };

      chrome.runtime.onMessage.addListener(credentialListener);
      return () => chrome.runtime.onMessage.removeListener(credentialListener);
    }
  }, [items, masterPassword]);

  const [toast, setToast] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const showToast = useCallback((text: string, type: "success" | "error" | "info" = "info") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const [decryptedPasswords, setDecryptedPasswords] = useState<Record<string, string>>({});

  const [securityAudit, setSecurityAudit] = useState({
    score: 100,
    reused: 0,
    breached: 0,
    breachedIds: [],
  });
  const [isAuditLoading, setIsAuditLoading] = useState(false);

  useEffect(() => {
    if (!masterPassword || items.length === 0) {
      setDecryptedPasswords({});
      setSecurityAudit({ score: 100, reused: 0, breached: 0, breachedIds: [] });
      setIsAuditLoading(false);
      return;
    }

    setIsAuditLoading(true);
    let cancelled = false;

    const computeAuditAndBreaches = async () => {
      const loginItems = items.filter(i => i.category === "Login");
      if (loginItems.length === 0) {
        if (!cancelled) {
          setDecryptedPasswords({});
          setSecurityAudit({ score: 100, reused: 0, breached: 0, breachedIds: [] });
          setIsAuditLoading(false);
        }
        return;
      }

      // Decrypt ALL passwords in parallel
      const decryptedMap: Record<string, string> = {};
      const results = await Promise.all(
        loginItems.map(async (item) => {
          try {
            const pass = await decrypt(item.encryptedPassword, masterPassword);
            return { id: item.id, pass: pass || "" };
          } catch {
            return { id: item.id, pass: "" };
          }
        })
      );

      results.forEach(({ id, pass }) => {
        if (pass) decryptedMap[id] = pass;
      });

      if (cancelled) return;
      setDecryptedPasswords(decryptedMap);

      // Reuse tracking
      const decryptedPasswords: Record<string, string[]> = {};
      Object.values(decryptedMap).forEach((pass, idx) => {
        if (!pass) return;
        const itemId = loginItems[idx].id;
        if (!decryptedPasswords[pass]) decryptedPasswords[pass] = [];
        decryptedPasswords[pass].push(itemId);
      });

      let reusedCount = 0;
      Object.values(decryptedPasswords).forEach((ids) => {
        if (ids.length > 1) reusedCount += ids.length;
      });

      // HIBP breach check (with caching)
      const newBreachedIds: string[] = [];
      const hibpCache = new Map<string, number>();
      const uniquePasswords = [...new Set(Object.values(decryptedMap))];

      const breachResults = await Promise.all(
        uniquePasswords.filter(Boolean).map(async (pass) => {
          if (hibpCache.has(pass)) return { pass, count: hibpCache.get(pass)! };
          const count = await checkPasswordBreach(pass);
          hibpCache.set(pass, count);
          return { pass, count };
        })
      );

      breachResults.forEach(({ pass, count }) => {
        if (count > 0) {
          Object.entries(decryptedMap)
            .filter(([, p]) => p === pass)
            .forEach(([id]) => newBreachedIds.push(id));
        }
      });

      if (cancelled) return;

      const breachedCount = newBreachedIds.length;
      const deductions = reusedCount * 20 + breachedCount * 40;
      const score = Math.max(
        0,
        100 - Math.round((deductions / (loginItems.length * 40)) * 100)
      );

      if (!cancelled) {
        setSecurityAudit({
          score,
          reused: reusedCount,
          breached: breachedCount,
          breachedIds: newBreachedIds,
        });
        setBreachedIds(newBreachedIds);
        setIsAuditLoading(false);
      }
    };

    computeAuditAndBreaches();

    return () => {
      cancelled = true;
    };
  }, [items, masterPassword]);

  const clearSession = useCallback(() => {
    setMasterPassword("");
    sessionTokenRef.current = null;
    lastActivityRef.current = Date.now();
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.session) {
      chrome.storage.session.remove([SESSION_KEY, "lastActivity"]);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const masterHash = localStorage.getItem(MASTER_HASH_KEY);
      if (!masterHash) {
        setView("setup");
        setIsInitialized(true);
        return;
      }

      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.session) {
        chrome.storage.session.get([SESSION_KEY, "lastActivity"], async (result) => {
          if (result[SESSION_KEY]) {
            const now = Date.now();
            const savedLastActivity = (result.lastActivity as number) || now;
            lastActivityRef.current = savedLastActivity;
            const savedAutoLock = localStorage.getItem("phantom_vault_autolock");
            const timeout = savedAutoLock ? parseInt(savedAutoLock, 10) : 5 * 60 * 1000;

            if (timeout !== 0 && now - savedLastActivity > timeout) {
              chrome.storage.session.remove([SESSION_KEY, "lastActivity"]);
            } else {
              if (await needsMigration()) {
                setIsMigrating(true);
              } else {
                setView("home");
              }
            }
          }
          setIsInitialized(true);
        });
      } else {
        setIsInitialized(true);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!isMigrating || !masterPassword) return;

    const runMigration = async () => {
      const success = await migrateVault(masterPassword);
      setIsMigrating(false);
      if (success) {
        showToast("Vault migrated to stronger encryption", "success");
        setView("home");
      } else {
        showToast("Migration failed. Please re-enter your password.", "error");
        clearSession();
        setView("unlock");
      }
    };
    runMigration();
  }, [isMigrating, masterPassword, clearSession, showToast]);

  useEffect(() => {
    if (!masterPassword || autoLockTimeout === 0) return;

    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current > autoLockTimeout) {
        clearSession();
        setView("unlock");
      }
    }, 10000);

    let lastActivitySync = 0;
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
      const now = Date.now();
      if (now - lastActivitySync < 5000) return;
      lastActivitySync = now;
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.session) {
        chrome.storage.session.set({ lastActivity: lastActivityRef.current });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        lastActivityRef.current = Date.now();
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.session) {
          chrome.storage.session.set({ lastActivity: lastActivityRef.current });
        }
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
  }, [masterPassword, autoLockTimeout, clearSession]);

  useEffect(() => {
    if (!masterPassword) return;

    const loadVault = async () => {
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (!savedData) return;

      try {
        let decrypted: string | null = null;

        try {
          const parsed = JSON.parse(savedData);
          if (parsed.v === 2) {
            decrypted = await decrypt(savedData, masterPassword);
          }
        } catch {}

        if (!decrypted) {
          decrypted = await decryptLegacy(savedData, masterPassword);
        }

        if (decrypted) {
          const parsed = JSON.parse(decrypted);

          let parsedItems: VaultItem[] = [];
          let parsedFolders: VaultFolder[] = [];

          if (Array.isArray(parsed)) {
            parsedItems = parsed;
          } else if (parsed && typeof parsed === "object") {
            parsedItems = parsed.items || [];
            parsedFolders = parsed.folders || [];
          }

          const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
          const now = Date.now();
          let itemsChanged = false;
          const cleanItems = parsedItems.filter((item: VaultItem) => {
            if (item.deletedAt && now - item.deletedAt > THIRTY_DAYS) {
              itemsChanged = true;
              return false;
            }
            return true;
          });

          setItems(cleanItems);
          setFolders(parsedFolders);

          if (itemsChanged) {
            const encrypted = await encrypt(
              JSON.stringify({ items: cleanItems, folders: parsedFolders }),
              masterPassword
            );
            localStorage.setItem(STORAGE_KEY, encrypted);
          }
        }
      } catch (e) {
        console.error("Failed to load vault items", e);
      }
    };

    loadVault();
  }, [masterPassword]);

  const saveItems = useCallback(
    async (newItems: VaultItem[], targetFolders: VaultFolder[] = folders) => {
      if (!masterPassword) return;
      const prevSave = saveQueueRef.current;
      saveQueueRef.current = prevSave.then(async () => {
        setIsSaving(true);
        try {
          const encrypted = await encrypt(
            JSON.stringify({ items: newItems, folders: targetFolders }),
            masterPassword
          );
          localStorage.setItem(STORAGE_KEY, encrypted);
          setItems(newItems);
          setFolders(targetFolders);
        } finally {
          setIsSaving(false);
        }
      });
      return saveQueueRef.current;
    },
    [masterPassword, folders]
  );

  const handleUnlock = async (password: string): Promise<boolean> => {
    if (lockoutUntil && Date.now() < lockoutUntil) {
      return false;
    }
    const hashed = await hashPassword(password);
    const storedHash = localStorage.getItem(MASTER_HASH_KEY);

    if (!storedHash) {
      localStorage.setItem(MASTER_HASH_KEY, hashed);
      setMasterPassword(password);
      const token = generateSecureId();
      sessionTokenRef.current = token;
      lastActivityRef.current = Date.now();
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.session) {
        chrome.storage.session.set({ [SESSION_KEY]: token, lastActivity: Date.now() });
      }

      if (importedVaultDataRef.current) {
        const encrypted = await encrypt(
          JSON.stringify(importedVaultDataRef.current),
          password
        );
        localStorage.setItem(STORAGE_KEY, encrypted);
        setItems(importedVaultDataRef.current.items);
        setFolders(importedVaultDataRef.current.folders);
        importedVaultDataRef.current = null;
      }

      setView("home");
      return true;
    }

    if (hashed === storedHash) {
      setMasterPassword(password);
      const token = generateSecureId();
      sessionTokenRef.current = token;
      lastActivityRef.current = Date.now();
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.session) {
        chrome.storage.session.set({ [SESSION_KEY]: token, lastActivity: Date.now() });
      }
      setFailedAttempts(0);
      setLockoutUntil(null);
      setView("home");
      return true;
    } else {
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      if (newAttempts >= 5) {
        setLockoutUntil(Date.now() + 5 * 60 * 1000);
        setFailedAttempts(0);
      }
      return false;
    }
  };

  const handleAdd = async (newItem: Partial<VaultItem>) => {
    let history = newItem.passwordHistory || [];

    if (newItem.id) {
      const existingItem = items.find((i) => i.id === newItem.id);
      if (existingItem && newItem.category === "Login" && newItem.encryptedPassword) {
        const oldPassRaw = await decrypt(existingItem.encryptedPassword, masterPassword);
        if (oldPassRaw && oldPassRaw !== newItem.encryptedPassword) {
          const reencryptedOldPass = await encrypt(oldPassRaw, masterPassword);
          history = [
            { password: reencryptedOldPass, timestamp: existingItem.updatedAt },
            ...(existingItem.passwordHistory || []),
          ].slice(0, 5);
        }
      } else if (existingItem && existingItem.passwordHistory) {
        history = existingItem.passwordHistory;
      }
    }

    const encryptedPassword = await encrypt(newItem.encryptedPassword || "", masterPassword);

    const decryptedPlain = await decrypt(newItem.encryptedPassword || "", masterPassword);
    const strengthScore = decryptedPlain ? calculateTimeToCrack(decryptedPlain).score : 0;

    const itemToAdd: VaultItem = {
      id: newItem.id || generateSecureId(),
      category: newItem.category || "Login",
      title: newItem.title!,
      website: newItem.website || "",
      username: newItem.username || "",
      encryptedPassword,
      encryptedTotpSecret: newItem.encryptedTotpSecret,
      content: newItem.content || "",
      cardDetails: newItem.cardDetails,
      identityDetails: newItem.identityDetails,
      folderId: newItem.folderId,
      isFavorite: newItem.isFavorite,
      customIcon: newItem.customIcon,
      customIconColor: newItem.customIconColor,
      customFields: newItem.customFields,
      passwordHistory: history,
      strength: strengthScore,
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

    await saveItems(newItems);
    setView(newItem.id ? "preview" : "home");
    setPendingPassword("");
  };

  const handleDelete = async (id: string, permanent: boolean = false) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    if (item.deletedAt && permanent) {
      const newItems = items.filter((i) => i.id !== id);
      await saveItems(newItems);
      showToast("Item permanently deleted", "success");
    } else {
      const newItems = items.map((i) => (i.id === id ? { ...i, deletedAt: Date.now() } : i));
      await saveItems(newItems);
      showToast("Item moved to trash", "success");
    }
    setView("home");
  };

  const handleRestore = async (id: string) => {
    const newItems = items.map((i) => (i.id === id ? { ...i, deletedAt: undefined } : i));
    await saveItems(newItems);
    showToast("Item restored", "success");
    setView("home");
  };

  const handleMoveToFolder = async (id: string, folderId: string | null) => {
    const newItems = items.map((i) =>
      i.id === id ? { ...i, folderId: folderId || undefined } : i
    );
    await saveItems(newItems);
  };

  const handleRenameFolder = async (folderId: string, newName: string) => {
    const newFolders = folders.map((f) => (f.id === folderId ? { ...f, name: newName } : f));
    await saveItems(items, newFolders);
    showToast("Folder renamed", "success");
  };

  const handleDeleteFolder = async (folderId: string) => {
    const newItems = items.map((i) =>
      i.folderId === folderId ? { ...i, folderId: undefined } : i
    );
    const newFolders = folders.filter((f) => f.id !== folderId);
    await saveItems(newItems, newFolders);
    showToast("Folder deleted", "success");
  };

  const handleBulkMove = async (itemIds: string[], folderId: string | null) => {
    const newItems = items.map((i) =>
      itemIds.includes(i.id) ? { ...i, folderId: folderId || undefined } : i
    );
    await saveItems(newItems);
    showToast(`Moved ${itemIds.length} items`);
  };

  const handleBulkDelete = async (itemIds: string[], permanent: boolean = false) => {
    if (permanent) {
      const newItems = items.filter((i) => !itemIds.includes(i.id));
      await saveItems(newItems);
      showToast(`${itemIds.length} items permanently deleted`, "success");
    } else {
      const newItems = items.map((i) =>
        itemIds.includes(i.id) ? { ...i, deletedAt: Date.now() } : i
      );
      await saveItems(newItems);
      showToast(`${itemIds.length} items moved to trash`, "success");
    }
  };

  const handleBulkRestore = async (itemIds: string[]) => {
    const newItems = items.map((i) =>
      itemIds.includes(i.id) ? { ...i, deletedAt: undefined } : i
    );
    await saveItems(newItems);
    showToast(`${itemIds.length} items restored`, "success");
  };

  const [decryptedEditingPassword, setDecryptedEditingPassword] = useState("");

  useEffect(() => {
    if (pendingPassword) {
      setDecryptedEditingPassword(pendingPassword);
      return;
    }
    if (!editingItem || !masterPassword) {
      setDecryptedEditingPassword("");
      return;
    }
    decrypt(editingItem.encryptedPassword, masterPassword).then((val) => {
      setDecryptedEditingPassword(val || "");
    });
  }, [editingItem, masterPassword, pendingPassword]);

  if (!isInitialized) return null;

  if (isMigrating) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black px-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-zinc-700 border-t-white rounded-full animate-spin mx-auto" />
          <h2 className="text-lg font-semibold text-white">Migrating Vault</h2>
          <p className="text-sm text-zinc-400">Upgrading to stronger encryption...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="sidebar-container bg-black">
      <AnimatePresence mode="wait">
        {(view === "unlock" || view === "setup") && (
          <motion.div
            key="unlock"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full flex-1 w-full flex flex-col"
          >
            <ErrorBoundary>
              <UnlockScreen
                onUnlock={handleUnlock}
                isFirstTime={view === "setup"}
                lockoutUntil={lockoutUntil}
                onImportVault={view === "setup" ? () => setShowImportModal(true) : undefined}
              />
            </ErrorBoundary>
            <ImportVaultModal
              isOpen={showImportModal}
              onClose={() => setShowImportModal(false)}
              onSuccess={async (data) => {
                const hashed = await hashPassword(data.password);
                localStorage.setItem(MASTER_HASH_KEY, hashed);
                setMasterPassword(data.password);
                const encrypted = await encrypt(
                  JSON.stringify({ items: data.items, folders: data.folders }),
                  data.password
                );
                localStorage.setItem(STORAGE_KEY, encrypted);
                setItems(data.items);
                setFolders(data.folders);
                importedVaultDataRef.current = null;
                setShowImportModal(false);
                showToast(`Imported ${data.items.length} items`, "success");
                setView("home");
              }}
            />
          </motion.div>
        )}

        {view === "home" && (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full flex-1 w-full flex flex-col relative"
          >
            <ErrorBoundary>
              <VaultList
              items={items}
              folders={folders}
              audit={securityAudit}
              masterPassword={masterPassword}
              onShowToast={showToast}
              onAdd={() => {
                setEditingItem(undefined);
                setPendingPassword("");
                setView("add");
              }}
              onAddFolder={async (name, color) => {
                const newFolder = { id: generateSecureId(), name, color };
                await saveItems(items, [...folders, newFolder]);
                showToast("Folder created", "success");
              }}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              onMoveToFolder={handleMoveToFolder}
              onBulkMove={handleBulkMove}
              onBulkDelete={handleBulkDelete}
              onBulkRestore={handleBulkRestore}
              onEdit={(item) => {
                setEditingItem(item);
                setView("preview");
              }}
              onDashboard={() => setView("dashboard")}
              onSettings={() => setView("settings")}
            />
            </ErrorBoundary>
            <BottomNav view={view} onViewChange={setView} />
          </motion.div>
        )}

        {view === "preview" && editingItem && (
          <motion.div
            key="preview"
            initial={{ x: 360 }}
            animate={{ x: 0 }}
            exit={{ x: 360 }}
            className="h-full flex-1 w-full flex flex-col relative"
          >
            <ErrorBoundary>
              <ItemPreview
                item={editingItem}
                folders={folders}
                masterPassword={masterPassword}
                onBack={() => setView("home")}
                onEdit={() => setView("edit")}
                onDelete={handleDelete}
                onRestore={handleRestore}
                onRestorePassword={async (id, oldPassword) => {
                  const existingItem = items.find((i) => i.id === id);
                  if (!existingItem) return;
                  const newEncryptedPassword = await encrypt(oldPassword, masterPassword);
                  const history = [
                    { password: existingItem.encryptedPassword, timestamp: existingItem.updatedAt },
                    ...(existingItem.passwordHistory || []),
                  ].slice(0, 5);
                  const updatedItem = {
                    ...existingItem,
                    encryptedPassword: newEncryptedPassword,
                    passwordHistory: history,
                    updatedAt: Date.now(),
                  };
                  const newItems = items.map((i) => (i.id === id ? updatedItem : i));
                  await saveItems(newItems);
                  setEditingItem(updatedItem);
                  showToast("Password restored from history", "success");
                }}
                onToggleFavorite={async (id) => {
                  const newItems = items.map((i) =>
                    i.id === id ? { ...i, isFavorite: !i.isFavorite, updatedAt: Date.now() } : i
                  );
                  await saveItems(newItems);
                  setEditingItem((prev) => prev?.id === id ? { ...prev, isFavorite: !prev.isFavorite } : prev);
                }}
                onShowToast={showToast}
              />
            </ErrorBoundary>
          </motion.div>
        )}

        {(view === "add" || view === "edit") && (
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full flex-1 w-full flex flex-col"
          >
            <ErrorBoundary>
              <AddVaultItem
              item={editingItem}
              folders={folders}
              masterPassword={masterPassword}
              decryptedPassword={decryptedEditingPassword}
              onSave={handleAdd}
              onDelete={handleDelete}
              onRestore={handleRestore}
              onCancel={() => {
                setView(editingItem ? "preview" : "home");
                setPendingPassword("");
              }}
              onShowToast={showToast}
            />
            </ErrorBoundary>
          </motion.div>
        )}

        {view === "dashboard" && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="h-full flex-1 w-full flex flex-col relative"
          >
            <ErrorBoundary>
              <DashboardView
              items={items}
              audit={securityAudit}
              masterPassword={masterPassword}
              decryptedPasswords={decryptedPasswords}
              isLoading={isAuditLoading}
              onBack={() => setView("home")}
              onEdit={(item) => {
                setEditingItem(item);
                setView("preview");
              }}
            />
            </ErrorBoundary>
            <BottomNav view={view} onViewChange={setView} />
          </motion.div>
        )}

        {view === "settings" && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="h-full flex-1 w-full flex flex-col relative"
          >
            <ErrorBoundary>
              <SettingsView
              items={items}
              folders={folders}
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
                localStorage.setItem("phantom_vault_autolock", timeout.toString());
                showToast("Auto-lock timeout updated", "success");
              }}
              onBack={() => setView("home")}
              onShowToast={showToast}
              onImport={async (newItems, newFolders) => {
                const combinedItems = [...items];
                newItems.forEach((ni) => {
                  if (!combinedItems.find((ci) => ci.title === ni.title && ci.username === ni.username)) {
                    combinedItems.push(ni);
                  }
                });
                const combinedFolders = newFolders ? [...folders, ...newFolders.filter((nf) => !folders.find((f) => f.id === nf.id))] : folders;
                await saveItems(combinedItems, combinedFolders);
              }}
              onLock={() => {
                clearSession();
                setView("unlock");
              }}
              onClear={() => {
                localStorage.clear();
                setItems([]);
                setMasterPassword("");
                setView("setup");
                setTimeout(() => {
                  window.location.reload();
                }, 100);
                }}
              onChangePassword={async (oldPassword, newPassword) => {
                const oldHash = await hashPassword(oldPassword);
                const storedHash = localStorage.getItem(MASTER_HASH_KEY);
                if (oldHash !== storedHash) return false;

                const newHash = await hashPassword(newPassword);
                localStorage.setItem(MASTER_HASH_KEY, newHash);

                const reencryptedItems = await Promise.all(
                  items.map(async (item) => {
                    const newItem = { ...item };
                    try {
                      const pass = await decrypt(item.encryptedPassword, oldPassword);
                      if (pass) newItem.encryptedPassword = await encrypt(pass, newPassword);
                    } catch {
                      newItem.encryptedPassword = item.encryptedPassword;
                    }
                    if (item.encryptedTotpSecret) {
                      try {
                        const totp = await decrypt(item.encryptedTotpSecret, oldPassword);
                        if (totp) newItem.encryptedTotpSecret = await encrypt(totp, newPassword);
                      } catch {
                        newItem.encryptedTotpSecret = item.encryptedTotpSecret;
                      }
                    }
                    if (item.passwordHistory && item.passwordHistory.length > 0) {
                      newItem.passwordHistory = await Promise.all(
                        item.passwordHistory.map(async (entry) => {
                          try {
                            const oldPass = await decrypt(entry.password, oldPassword);
                            if (oldPass) return { ...entry, password: await encrypt(oldPass, newPassword) };
                          } catch {}
                          return entry;
                        })
                      );
                    }
                    if (item.customFields && item.customFields.length > 0) {
                      newItem.customFields = await Promise.all(
                        item.customFields.map(async (cf) => {
                          if (cf.isSecret && cf.value) {
                            try {
                              const val = await decrypt(cf.value, oldPassword);
                              if (val) return { ...cf, value: await encrypt(val, newPassword) };
                            } catch {}
                          }
                          return cf;
                        })
                      );
                    }
                    return newItem;
                  })
                );

                const encrypted = await encrypt(
                  JSON.stringify({ items: reencryptedItems, folders }),
                  newPassword
                );
                localStorage.setItem(STORAGE_KEY, encrypted);
                setItems(reencryptedItems);
                setMasterPassword(newPassword);
                const token = generateSecureId();
                sessionTokenRef.current = token;
                lastActivityRef.current = Date.now();
                if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.session) {
                  chrome.storage.session.set({ [SESSION_KEY]: token, lastActivity: Date.now() });
                }
                return true;
              }}
              />
            </ErrorBoundary>
            <BottomNav view={view} onViewChange={setView} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed top-6 left-6 right-6 z-[110] pointer-events-none flex justify-center"
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
                <img src="/logo.svg" alt="Phantom" className="w-6 h-6" />
              )}
              <span className="text-sm font-medium">{toast.text}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
