import React, { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  Plus,
  Key,
  ChevronRight,
  CreditCard,
  FileText,
  User,
  Star,
} from "lucide-react";
import { VaultItem, VaultFolder } from "../types";
import * as OTPAuth from "otpauth";
import { decrypt } from "../lib/crypto";

interface VaultListProps {
  items: VaultItem[];
  folders?: VaultFolder[];
  audit: {
    score: number;
    reused: number;
    breached: number;
    breachedIds: string[];
  };
  masterPassword?: string;
  onShowToast: (text: string, type?: "success" | "error" | "info") => void;
  onAdd: () => void;
  onAddFolder?: (name: string, color?: string) => void;
  onRenameFolder?: (id: string, newName: string) => void;
  onDeleteFolder?: (id: string) => void;
  onMoveToFolder?: (itemId: string, folderId: string | null) => void;
  onBulkMove?: (itemIds: string[], folderId: string | null) => void;
  onBulkDelete?: (itemIds: string[], permanent?: boolean) => void;
  onBulkRestore?: (itemIds: string[]) => void;
  onEdit: (item: VaultItem) => void;
  onDashboard: () => void;
  onSettings: () => void;
}

export default function VaultList({
  items,
  folders = [],
  audit,
  masterPassword,
  onShowToast,
  onAdd,
  onAddFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveToFolder,
  onBulkMove,
  onBulkDelete,
  onBulkRestore,
  onEdit,
  onDashboard,
  onSettings,
}: VaultListProps) {
  const [search, setSearch] = useState(() => {
    const params = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );
    return (
      params.get("search") || params.get("url") || params.get("domain") || ""
    );
  });

  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("#8b5cf6");
  const [failedFavicons, setFailedFavicons] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const [totpCodes, setTotpCodes] = useState<Record<string, string>>({});
  const totpSecretsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!masterPassword) return;
    const loadTotp = async () => {
      const codes: Record<string, string> = {};
      const secrets: Record<string, string> = {};
      for (const item of items) {
        if (item.encryptedTotpSecret && item.category === "Login") {
          try {
            const secret = await decrypt(item.encryptedTotpSecret, masterPassword);
            if (secret) {
              secrets[item.id] = secret;
              const totp = new OTPAuth.TOTP({
                algorithm: "SHA1",
                digits: 6,
                period: 30,
                secret: OTPAuth.Secret.fromBase32(secret.replace(/\s+/g, "")),
              });
              codes[item.id] = totp.generate();
            }
          } catch {}
        }
      }
      totpSecretsRef.current = secrets;
      setTotpCodes(codes);
    };
    loadTotp();
  }, [items, masterPassword]);

  useEffect(() => {
    const interval = setInterval(() => {
      const secrets = totpSecretsRef.current;
      if (Object.keys(secrets).length > 0) {
        const codes: Record<string, string> = {};
        Object.entries(secrets).forEach(([id, secret]) => {
          try {
            const totp = new OTPAuth.TOTP({
              algorithm: "SHA1",
              digits: 6,
              period: 30,
              secret: OTPAuth.Secret.fromBase32(secret.replace(/\s+/g, "")),
            });
            codes[id] = totp.generate();
          } catch {}
        });
        setTotpCodes(codes);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const tags = useMemo(() => {
    const allTags = new Set<string>();
    items.forEach((item) => {
      item.tags?.forEach((tag) => allTags.add(tag));
    });
    return Array.from(allTags).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        if (activeCategory === "Trash") {
          if (!item.deletedAt) return false;
        } else {
          if (item.deletedAt) return false;
        }

        const isSearching = search.trim().length > 0;

        if (!isSearching && activeCategory === "All") {
          const folderMatches = activeFolder
            ? item.folderId === activeFolder
            : !item.folderId;
          if (!folderMatches) return false;
        }

        const searchLower = search.toLowerCase();
        const matchesSearch =
          item.title.toLowerCase().includes(searchLower) ||
          (item.website && item.website.toLowerCase().includes(searchLower)) ||
          (item.username &&
            item.username.toLowerCase().includes(searchLower)) ||
          item.tags?.some((tag) => tag.toLowerCase().includes(searchLower));

        let matchesCategory =
          activeCategory === "All" ||
          activeCategory === "Trash" ||
          item.category === activeCategory;

        if (activeCategory === "Weak") {
          matchesCategory =
            item.category === "Login" &&
            ((item.strength || 0) < 3 || audit.breachedIds.includes(item.id));
        } else if (activeCategory === "Old") {
          const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
          matchesCategory =
            item.category === "Login" &&
            Date.now() - item.updatedAt > NINETY_DAYS;
        } else if (
          activeCategory !== "All" &&
          activeCategory !== "Trash" &&
          !["Login", "Card", "Note", "Identity"].includes(activeCategory)
        ) {
          matchesCategory = item.tags?.includes(activeCategory) || false;
        }

        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return b.updatedAt - a.updatedAt;
      });
  }, [items, search, activeCategory, activeFolder, audit.breachedIds]);

  const getIcon = (category: string) => {
    switch (category) {
      case "Card":
        return <CreditCard className="w-5 h-5" />;
      case "Note":
        return <FileText className="w-5 h-5" />;
      case "Identity":
        return <User className="w-5 h-5" />;
      default:
        return <Key className="w-5 h-5" />;
    }
  };

  const handleLongPressStart = (itemId: string) => {
    const timer = setTimeout(() => {
      setIsSelectMode(true);
      setSelectedIds([itemId]);
    }, 500);
    setLongPressTimer(timer);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const toggleSelect = (itemId: string) => {
    setSelectedIds((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId],
    );
  };

  const selectAll = () => {
    if (selectedIds.length === filteredItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map((i) => i.id));
    }
  };

  const exitSelectMode = () => {
    setIsSelectMode(false);
    setSelectedIds([]);
  };

  return (
    <div className="flex flex-col h-full flex-1 w-full bg-black">
      {/* Header */}
      <header className="px-3 pt-3 pb-2 space-y-2.5 flex-shrink-0">
        {/* Top row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="Phantom" className="w-7 h-7" />
            <span className="font-semibold text-lg tracking-tight text-white">
              Vault
            </span>
          </div>
          <div className="flex items-center gap-1">
            {isSelectMode ? (
              <button
                onClick={exitSelectMode}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white text-black"
              >
                Done
              </button>
            ) : (
              <button
                onClick={() => setIsSelectMode(true)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white transition-colors"
              >
                Select
              </button>
            )}
            <button
              onClick={() => setActiveCategory(activeCategory === "Trash" ? "All" : "Trash")}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                activeCategory === "Trash"
                  ? "bg-red-500/20 text-red-400"
                  : "text-zinc-500 hover:text-white hover:bg-zinc-900"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
            <button
              onClick={onSettings}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-900 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button
              onClick={onAdd}
              className="w-8 h-8 flex items-center justify-center bg-white rounded-lg hover:bg-zinc-200 transition-colors text-black"
            >
              <Plus className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vault..."
            className="w-full bg-zinc-900 rounded-lg py-2 pl-9 pr-3 outline-none text-xs text-white placeholder:text-zinc-500 transition-all focus:bg-zinc-800"
          />
        </div>

        {/* Categories */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {[
            { id: "All", label: "All" },
            { id: "Login", label: "Logins" },
            { id: "Card", label: "Cards" },
            { id: "Note", label: "Notes" },
            { id: "Identity", label: "IDs" },
            ...tags.map((tag) => ({ id: tag, label: `#${tag}` })),
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat.id);
                setActiveFolder(null);
              }}
              className={`px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                activeCategory === cat.id
                  ? "bg-white text-black"
                  : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </header>

      {/* Select mode actions */}
      <AnimatePresence>
        {isSelectMode && selectedIds.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-3 pb-2 flex items-center gap-2 flex-shrink-0"
          >
            <span className="text-xs text-zinc-500 flex-1">{selectedIds.length} selected</span>
            <button onClick={selectAll} className="text-xs text-zinc-400 hover:text-white px-2 py-1">
              {selectedIds.length === filteredItems.length && filteredItems.length > 0 ? "Deselect All" : "All"}
            </button>
            {activeCategory === "Trash" ? (
              <>
                <button
                  onClick={() => { if (onBulkRestore) { onBulkRestore(selectedIds); exitSelectMode(); } }}
                  className="text-xs text-white bg-zinc-800 px-3 py-1.5 rounded-lg hover:bg-zinc-700"
                >
                  Restore
                </button>
                <button
                  onClick={() => { if (onBulkDelete) { onBulkDelete(selectedIds, true); exitSelectMode(); } }}
                  className="text-xs text-red-400 bg-red-500/10 px-3 py-1.5 rounded-lg hover:bg-red-500/20"
                >
                  Delete
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowMoveModal(true)}
                  className="text-xs text-white bg-zinc-800 px-3 py-1.5 rounded-lg hover:bg-zinc-700"
                >
                  Move
                </button>
                <button
                  onClick={() => { if (onBulkDelete) { onBulkDelete(selectedIds, false); exitSelectMode(); } }}
                  className="text-xs text-red-400 bg-red-500/10 px-3 py-1.5 rounded-lg hover:bg-red-500/20"
                >
                  Trash
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 pb-16 space-y-0.5 no-scrollbar">
        {activeCategory === "All" && !search && (
          <div className="flex items-center justify-between mt-1 mb-1.5 px-2">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              {activeFolder ? "Folder Items" : "Folders"}
            </span>
            {!activeFolder ? (
              <button
                onClick={() => setCreatingFolder(true)}
                className="text-[10px] font-medium text-zinc-500 hover:text-white"
              >
                + New Folder
              </button>
            ) : (
              <button
                onClick={() => setActiveFolder(null)}
                className="text-[10px] font-medium text-zinc-500 hover:text-white"
              >
                ← Back
              </button>
            )}
          </div>
        )}

        {creatingFolder && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="flex items-center gap-2 bg-zinc-900 rounded-lg p-2 mb-1"
          >
            <div
              className="w-4 h-4 rounded-full cursor-pointer flex-shrink-0"
              style={{ backgroundColor: newFolderColor }}
              onClick={() => {
                const colors = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#6366f1"];
                setNewFolderColor(colors[(colors.indexOf(newFolderColor) + 1) % colors.length]);
              }}
            />
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFolderName && onAddFolder) {
                  onAddFolder(newFolderName, newFolderColor);
                  setCreatingFolder(false);
                  setNewFolderName("");
                } else if (e.key === "Escape") {
                  setCreatingFolder(false);
                }
              }}
              className="flex-1 bg-transparent border-none outline-none text-white text-xs font-medium placeholder-zinc-500"
            />
            <button
              onClick={() => {
                if (newFolderName && onAddFolder) onAddFolder(newFolderName, newFolderColor);
                setCreatingFolder(false);
                setNewFolderName("");
              }}
              className="px-2 py-1 bg-white text-black text-[10px] font-semibold rounded"
            >
              Create
            </button>
          </motion.div>
        )}

        {/* Folders */}
        {!activeFolder && !search && activeCategory === "All" && folders.map((folder) => {
          const folderItemCount = items.filter(
            (i) => i.folderId === folder.id && !i.deletedAt,
          ).length;

          return (
            <motion.div
              key={`folder-${folder.id}`}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2.5 py-2 px-2 rounded-lg cursor-pointer hover:bg-zinc-900/50 transition-colors"
              onClick={() => {
                if (editingFolderId !== folder.id) {
                  setActiveFolder(folder.id);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setEditingFolderName(folder.name);
                setEditingFolderId(folder.id);
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${folder.color || "#3b82f6"}15` }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ color: folder.color || "#3b82f6" }}
                >
                  <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                {editingFolderId === folder.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (editingFolderName.trim() && onRenameFolder) {
                        onRenameFolder(folder.id, editingFolderName.trim());
                      }
                      setEditingFolderId(null);
                    }}
                    className="flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="text"
                      autoFocus
                      value={editingFolderName}
                      onChange={(e) => setEditingFolderName(e.target.value)}
                      className="w-full bg-zinc-800 text-white outline-none rounded px-1.5 py-0.5 font-medium text-xs"
                      onBlur={() => {
                        if (editingFolderName.trim() && onRenameFolder) {
                          onRenameFolder(folder.id, editingFolderName.trim());
                        }
                        setEditingFolderId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditingFolderId(null);
                      }}
                      onFocus={(e) => e.target.select()}
                    />
                  </form>
                ) : (
                  <>
                    <h3 className="text-white font-medium text-xs truncate">{folder.name}</h3>
                    <p className="text-zinc-500 text-[10px]">{folderItemCount} item{folderItemCount !== 1 ? "s" : ""}</p>
                  </>
                )}
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-700 flex-shrink-0" />
            </motion.div>
          );
        })}

        {/* Items */}
        <AnimatePresence mode="popLayout">
          {filteredItems.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center mb-2">
                <Key className="w-4 h-4 text-zinc-600" />
              </div>
              <p className="text-zinc-500 text-xs">No items found</p>
            </motion.div>
          )}

          {filteredItems.flatMap((item, index) => {
            const totpCode = totpCodes[item.id];
            const isFirstFavorite = item.isFavorite && (index === 0 || !filteredItems[index - 1].isFavorite);
            const isFirstNormal = !item.isFavorite && index > 0 && filteredItems[index - 1].isFavorite;

            const elements: React.ReactNode[] = [];

            if (isFirstFavorite) {
              elements.push(
                <motion.div
                  key={`fav-header-${item.id}`}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1.5 mt-3 mb-1 first:mt-0 px-2"
                >
                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Favorites</span>
                </motion.div>,
              );
            }

            if (isFirstNormal) {
              elements.push(
                <motion.div
                  key={`other-header-${item.id}`}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center mt-3 mb-1 px-2"
                >
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Other</span>
                </motion.div>,
              );
            }

            elements.push(
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className={`flex items-center gap-2.5 py-2 px-2 rounded-lg cursor-pointer transition-all ${
                  selectedIds.includes(item.id)
                    ? "bg-white/10"
                    : "hover:bg-zinc-900/50"
                }`}
                onClick={() => {
                  if (isSelectMode) {
                    toggleSelect(item.id);
                  } else {
                    onEdit(item);
                  }
                }}
                onTouchStart={() => handleLongPressStart(item.id)}
                onTouchEnd={handleLongPressEnd}
                onTouchMove={handleLongPressEnd}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!isSelectMode) {
                    setIsSelectMode(true);
                    setSelectedIds([item.id]);
                  }
                }}
              >
                {/* Checkbox in select mode */}
                {isSelectMode && (
                  <div
                    className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center transition-all ${
                      selectedIds.includes(item.id)
                        ? "bg-white"
                        : "border border-zinc-600"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(item.id);
                    }}
                  >
                    {selectedIds.includes(item.id) && (
                      <svg className="w-2.5 h-2.5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                  </div>
                )}

                {/* Icon */}
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden bg-zinc-900"
                  style={item.customIconColor ? { backgroundColor: item.customIconColor } : {}}
                >
                  {item.customIcon ? (
                    item.customIcon.startsWith("http") || item.customIcon.startsWith("data:") ? (
                      <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${item.customIcon})` }} />
                    ) : (
                      <span className="text-base">{item.customIcon}</span>
                    )
                  ) : item.category === "Login" && item.website && !failedFavicons.has(item.id) ? (
                    <img
                      src={`https://www.google.com/s2/favicons?sz=64&domain=${item.website}`}
                      className="w-4 h-4 rounded opacity-80"
                      alt=""
                      onError={() => {
                        setFailedFavicons((prev) => new Set(prev).add(item.id));
                      }}
                    />
                  ) : (
                    <span className="text-zinc-400 text-xs font-medium">{item.title[0]?.toUpperCase()}</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h3 className="font-medium text-xs truncate text-zinc-200">{item.title}</h3>
                    {item.isFavorite && !isSelectMode && (
                      <Star className="w-2.5 h-2.5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 min-w-0">
                    <span className="text-zinc-500 text-[11px] truncate">
                      {item.category === "Login"
                        ? item.username
                        : item.category === "Card"
                          ? "•••• " + (item.cardDetails?.number.slice(-4) || "CARD")
                          : item.category === "Identity"
                            ? `${item.identityDetails?.firstName || ""} ${item.identityDetails?.lastName || ""}`.trim() || "Identity"
                            : "Secure Note"}
                    </span>
                    {totpCode && (
                      <span className="text-zinc-600 text-[10px] font-mono flex-shrink-0">
                        {totpCode.slice(0, 3)} {totpCode.slice(3)}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>,
            );

            return elements;
          })}
        </AnimatePresence>
      </div>

      {/* Move Modal */}
      <AnimatePresence>
        {showMoveModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowMoveModal(false)}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 rounded-xl w-full max-w-xs overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="text-white font-medium text-sm">Move {selectedIds.length} items</h3>
                <button onClick={() => setShowMoveModal(false)} className="text-zinc-500 hover:text-white">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
              <div className="max-h-[50vh] overflow-y-auto p-1.5">
                <button
                  onClick={() => { if (onBulkMove) onBulkMove(selectedIds, null); setShowMoveModal(false); setSelectedIds([]); }}
                  className="w-full text-left px-3 py-2.5 hover:bg-zinc-800 rounded-lg transition-colors text-white text-sm flex items-center gap-2.5"
                >
                  <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center">
                    <img src="/logo.svg" alt="Phantom" className="w-4 h-4" />
                  </div>
                  No Folder
                </button>
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => { if (onBulkMove) onBulkMove(selectedIds, folder.id); setShowMoveModal(false); setSelectedIds([]); }}
                    className="w-full text-left px-3 py-2.5 hover:bg-zinc-800 rounded-lg transition-colors text-white text-sm flex items-center gap-2.5"
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${folder.color || "#3b82f6"}20`, color: folder.color || "#3b82f6" }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" /></svg>
                    </div>
                    {folder.name}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
