import React, { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  Plus,
  Shield,
  Copy,
  Key,
  ChevronRight,
  CreditCard,
  FileText,
  User,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Clock,
  Tag,
  Star,
  Edit2,
  Trash2,
  MoreHorizontal,
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

  useEffect(() => {
    // If running as a Chrome extension, automatically search for the current active tab's domain
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url) {
          try {
            const url = new URL(tabs[0].url);
            let hostname = url.hostname;
            if (hostname.startsWith("www.")) {
              hostname = hostname.slice(4);
            }
            if (hostname) {
              setSearch(hostname);
            }
          } catch (e) {
            // Ignore invalid URLs
          }
        }
      });
    }
  }, []);

  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("#8b5cf6");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"Recent" | "A-Z" | "Z-A">("Recent");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<number | null>(null);

  const startAutoScroll = (e: React.DragEvent) => {
    if (!listRef.current) return;
    const rect = listRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const threshold = rect.height * 0.15;
    const speed = 8;

    if (scrollRef.current) cancelAnimationFrame(scrollRef.current);

    const scroll = () => {
      if (!listRef.current) return;
      const r = listRef.current.getBoundingClientRect();
      const cy = e.clientY - r.top;

      if (cy < threshold) {
        listRef.current.scrollTop -= speed * (1 - cy / threshold);
        scrollRef.current = requestAnimationFrame(scroll);
      } else if (cy > r.height - threshold) {
        listRef.current.scrollTop += speed * (1 - (r.height - cy) / threshold);
        scrollRef.current = requestAnimationFrame(scroll);
      }
    };

    scrollRef.current = requestAnimationFrame(scroll);
  };

  const stopAutoScroll = () => {
    if (scrollRef.current) {
      cancelAnimationFrame(scrollRef.current);
      scrollRef.current = null;
    }
  };

  // Timer for TOTP
  const [timeRemaining, setTimeRemaining] = useState(
    30 - (Math.floor(Date.now() / 1000) % 30),
  );

  useEffect(() => {
    return () => {
      if (scrollRef.current) cancelAnimationFrame(scrollRef.current);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(30 - (Math.floor(Date.now() / 1000) % 30));
    }, 1000);
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
        // Trash logic
        if (activeCategory === "Trash") {
          if (!item.deletedAt) return false;
        } else {
          if (item.deletedAt) return false;
        }

        const isSearching = search.trim().length > 0;

        // Folder logic: only apply if we aren't searching globally, and we are in "All" view
        if (!isSearching && activeCategory === "All") {
          const folderMatches = activeFolder
            ? item.folderId === activeFolder
            : !item.folderId;
          if (!folderMatches) return false;
        }

        const searchLower = search.toLowerCase();
        const matchesSearch =
          item.title.toLowerCase().includes(searchLower) ||
          item.website.toLowerCase().includes(searchLower) ||
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
          // Tag filter
          matchesCategory = item.tags?.includes(activeCategory) || false;
        }

        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        if (sortBy === "A-Z") return a.title.localeCompare(b.title);
        if (sortBy === "Z-A") return b.title.localeCompare(a.title);
        return b.updatedAt - a.updatedAt; // Recent
      });
  }, [items, search, activeCategory, activeFolder, audit.breachedIds, sortBy]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    onShowToast("Copied to clipboard", "success");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const generateTotp = (encryptedSecret?: string) => {
    if (!encryptedSecret || !masterPassword) return null;
    try {
      const secret = decrypt(encryptedSecret, masterPassword);
      if (!secret) return null;
      let totp = new OTPAuth.TOTP({
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret.replace(/\s+/g, "")),
      });
      return totp.generate();
    } catch (e) {
      return null;
    }
  };

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

  return (
    <div className="flex flex-col h-full flex-1 w-full bg-black">
      {/* Header */}
      <header className="px-3 pt-3 pb-2 space-y-2 flex-shrink-0">
        {/* Top row: Logo + Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center bg-white">
              <Shield className="w-3.5 h-3.5 text-black" />
            </div>
            <span className="font-semibold text-lg tracking-tight text-white">
              Vault
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() =>
                setActiveCategory(activeCategory === "Trash" ? "All" : "Trash")
              }
              className={`w-8 h-8 flex items-center justify-center border rounded-lg transition-colors cursor-pointer ${
                activeCategory === "Trash"
                  ? "bg-zinc-800 border-zinc-700 text-white"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
              }`}
              title="Trash"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-trash-2"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                <line x1="10" x2="10" y1="11" y2="17" />
                <line x1="14" x2="14" y1="11" y2="17" />
              </svg>
            </button>
            <button
              onClick={onAdd}
              className="w-8 h-8 flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer text-white"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Categories - compact pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar flex-nowrap">
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
              onClick={() => setActiveCategory(cat.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                activeCategory === cat.id
                  ? "bg-white text-black"
                  : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search row - compact */}
        <div className="flex gap-1.5 items-center">
          <div className="relative group flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 transition-colors" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg py-1.5 pl-8 pr-2 outline-none focus:border-zinc-700 transition-colors text-xs text-white placeholder:text-zinc-600"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-zinc-900/50 border border-zinc-800 rounded-lg py-1.5 px-1.5 outline-none focus:border-zinc-700 transition-colors text-[10px] text-white appearance-none cursor-pointer hover:bg-zinc-800 text-center flex-shrink-0"
          >
            <option value="Recent">Recent</option>
            <option value="A-Z">A-Z</option>
            <option value="Z-A">Z-A</option>
          </select>
          <button
            onClick={() => {
              if (
                selectedIds.length === filteredItems.length &&
                filteredItems.length > 0
              ) {
                setSelectedIds([]);
              } else {
                setSelectedIds(filteredItems.map((i) => i.id));
              }
            }}
            className={`w-8 h-8 flex-shrink-0 bg-zinc-900/50 border border-zinc-800 rounded-lg flex items-center justify-center transition-colors cursor-pointer hover:bg-zinc-800 ${
              selectedIds.length > 0
                ? "text-accent border-accent/50"
                : "text-zinc-500"
            }`}
            title="Select All"
          >
            <CheckCircle2 className="w-4 h-4" />
          </button>
        </div>

        {/* Security Summary - compact inline (Only visible in 'All') */}
        {activeCategory === "All" && items.length > 0 && (
          <button
            onClick={onDashboard}
            className="w-full text-left bg-zinc-900/30 hover:bg-zinc-900/50 border border-zinc-800/50 rounded-xl px-3 py-2 flex items-center justify-between transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center border ${audit.score > 80 ? "bg-zinc-800 border-zinc-700 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}
              >
                {audit.score > 80 ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <AlertTriangle className="w-4 h-4" />
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-white">
                  Security Score
                </p>
                <div className="text-[10px] text-zinc-500">
                  {audit.score}% • {audit.breached + audit.reused} issues
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600" />
          </button>
        )}
      </header>

      {/* List */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-3 pb-16 space-y-1.5 no-scrollbar"
        onDragOver={(e) => {
          if (draggedItemId) {
            e.preventDefault();
            startAutoScroll(e);
            setDragOverFolderId("__root__");
          }
        }}
        onDragLeave={(e) => {
          stopAutoScroll();
          setDragOverFolderId(null);
        }}
        onDrop={(e) => {
          stopAutoScroll();
          e.preventDefault();
          setDragOverFolderId(null);
          if (dragOverFolderId === "__root__" && draggedItemId && onMoveToFolder) {
            onMoveToFolder(draggedItemId, null);
            onShowToast("Moved to root", "success");
          }
        }}
      >
        {activeCategory === "All" && !search && (
          <div className="flex items-center justify-between mt-1 mb-2">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              {activeFolder ? "Folder Items" : "Folders"}
            </span>
            {!activeFolder ? (
              <button
                onClick={() => setCreatingFolder(true)}
                className="text-[10px] font-medium text-zinc-400 hover:text-white"
              >
                + New Folder
              </button>
            ) : (
              <button
                onClick={() => setActiveFolder(null)}
                className="text-[10px] font-medium text-zinc-400 hover:text-white"
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
            className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 mb-2"
          >
            <div
              className="w-6 h-6 rounded-full cursor-pointer flex-shrink-0"
              style={{ backgroundColor: newFolderColor }}
              onClick={() => {
                const colors = [
                  "#8b5cf6",
                  "#3b82f6",
                  "#10b981",
                  "#f59e0b",
                  "#ef4444",
                  "#6366f1",
                ];
                setNewFolderColor(
                  colors[(colors.indexOf(newFolderColor) + 1) % colors.length],
                );
              }}
            />
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder Name"
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
                if (newFolderName && onAddFolder)
                  onAddFolder(newFolderName, newFolderColor);
                setCreatingFolder(false);
                setNewFolderName("");
              }}
              className="px-2.5 py-1 bg-white text-black text-[10px] font-semibold rounded-md"
            >
              Save
            </button>
          </motion.div>
        )}

        {!activeFolder &&
          !search &&
          activeCategory === "All" &&
          folders.map((folder) => {
            const folderItemCount = items.filter(
              (i) => i.folderId === folder.id && !i.deletedAt,
            ).length;

            return (
              <motion.div
                key={`folder-${folder.id}`}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`group relative border rounded-xl p-3 transition-all duration-200 cursor-pointer ${
                  dragOverFolderId === folder.id
                    ? "border-dashed border-2 bg-zinc-900/80 scale-[1.01]"
                    : "bg-zinc-900/20 hover:bg-zinc-900/50 border-zinc-800/40 hover:border-zinc-700/60"
                }`}
                style={
                  dragOverFolderId === folder.id
                    ? { borderColor: `${folder.color || "#3b82f6"}60`, backgroundColor: `${folder.color || "#3b82f6"}08` }
                    : {}
                }
                onClick={() => {
                  if (editingFolderId !== folder.id) {
                    setActiveFolder(folder.id);
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverFolderId(folder.id);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragOverFolderId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverFolderId(null);
                  const itemId = e.dataTransfer.getData("text/plain");
                  if (itemId && onMoveToFolder) {
                    onMoveToFolder(itemId, folder.id);
                    onShowToast(`Moved to ${folder.name}`, "success");
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  {/* Folder icon with gradient */}
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                      dragOverFolderId === folder.id ? "scale-110" : "group-hover:scale-105"
                    }`}
                    style={{
                      background: `linear-gradient(135deg, ${folder.color || "#3b82f6"}30, ${folder.color || "#3b82f6"}15)`,
                      boxShadow: `inset 0 1px 0 ${folder.color || "#3b82f6"}20`,
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ color: folder.color || "#3b82f6" }}
                    >
                      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                      <path d="M2 10h20" />
                    </svg>
                  </div>

                  {/* Folder info */}
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
                          className="w-full bg-zinc-800 text-white outline-none border border-zinc-700/50 rounded-lg px-2 py-1 font-medium focus:border-zinc-500 focus:bg-zinc-700/50 transition-colors text-sm"
                          onBlur={() => {
                            if (editingFolderName.trim() && onRenameFolder) {
                              onRenameFolder(
                                folder.id,
                                editingFolderName.trim(),
                              );
                            }
                            setEditingFolderId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setEditingFolderId(null);
                            }
                          }}
                          onFocus={(e) => e.target.select()}
                        />
                      </form>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-white font-medium text-sm truncate">
                            {folder.name}
                          </h3>
                          <p className="text-zinc-500 text-[10px] mt-0.5">
                            {folderItemCount} item{folderItemCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                        {dragOverFolderId === folder.id && (
                          <span className="text-[10px] font-medium text-accent flex-shrink-0 ml-2">
                            Move here
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {editingFolderId !== folder.id && (
                    <>
                      <div
                        className={`flex items-center transition-opacity z-10 ${
                          folderMenuOpen === folder.id
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100"
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setFolderMenuOpen(
                              folderMenuOpen === folder.id ? null : folder.id,
                            );
                          }}
                          className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 text-zinc-600 transition-opacity ${
                          folderMenuOpen === folder.id ? "opacity-0" : "group-hover:opacity-0"
                        }`}
                      />
                    </>
                  )}
                </div>

                {/* Folder menu dropdown */}
                {folderMenuOpen === folder.id && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFolderMenuOpen(null);
                      }}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -5 }}
                      transition={{ duration: 0.1, ease: "easeOut" }}
                      className="absolute right-3 top-12 w-44 bg-zinc-800/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] overflow-hidden z-50 flex flex-col"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingFolderName(folder.name);
                          setEditingFolderId(folder.id);
                          setFolderMenuOpen(null);
                        }}
                        className="w-full text-left px-3 py-2.5 text-xs font-medium text-white hover:bg-white/10 transition-colors flex items-center justify-between border-b border-white/5 active:bg-white/20"
                      >
                        Rename
                        <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            window.confirm(
                              `Delete "${folder.name}"? Items will be moved to root.`,
                            ) && onDeleteFolder
                          ) {
                            onDeleteFolder(folder.id);
                          }
                          setFolderMenuOpen(null);
                        }}
                        className="w-full text-left px-3 py-2.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors flex items-center justify-between active:bg-red-500/20"
                      >
                        Delete
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </motion.div>
                  </>
                )}
              </motion.div>
            );
          })}

        <AnimatePresence mode="popLayout">
          {filteredItems.length === 0 &&
          (!folders.length ||
            search ||
            activeCategory !== "All" ||
            activeFolder) ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-12 text-center space-y-3"
            >
              <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800">
                <Key className="w-5 h-5 text-zinc-600" />
              </div>
              <p className="text-zinc-500 text-xs">No items found</p>
            </motion.div>
          ) : (
            filteredItems.flatMap((item, index) => {
              const totpCode = generateTotp(item.encryptedTotpSecret);

              const isFirstFavorite =
                item.isFavorite &&
                (index === 0 || !filteredItems[index - 1].isFavorite);
              const isFirstNormal =
                !item.isFavorite &&
                index > 0 &&
                filteredItems[index - 1].isFavorite;

              const elements: React.ReactNode[] = [];

              if (isFirstFavorite) {
                elements.push(
                  <motion.div
                    key={`fav-header-${item.id}`}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-1.5 mt-3 mb-1 first:mt-0"
                  >
                    <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                      Favorites
                    </span>
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
                    className="flex items-center mt-3 mb-1"
                  >
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                      Other Items
                    </span>
                  </motion.div>,
                );
              }

              elements.push(
                <motion.div
                  key={item.id}
                  layout
                  draggable={selectedIds.length === 0}
                  onDragStart={(e: any) => {
                    if (selectedIds.length > 0) {
                      e.preventDefault();
                      return;
                    }
                    e.dataTransfer.setData("text/plain", item.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDraggedItemId(item.id);
                  }}
                  onDragEnd={() => {
                    stopAutoScroll();
                    setDraggedItemId(null);
                    setDragOverFolderId(null);
                  }}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className={`group relative border rounded-xl transition-all duration-200 cursor-pointer flex items-center gap-2.5 ${
                    draggedItemId === item.id
                      ? "opacity-40 scale-[0.98] border-zinc-700 bg-zinc-900/20"
                      : selectedIds.includes(item.id)
                        ? "bg-accent/10 border-accent/50"
                        : "bg-zinc-900/40 border-zinc-800/50 hover:bg-zinc-800/60 hover:border-zinc-700"
                  } p-2.5`}
                  onClick={(e) => {
                    if (
                      selectedIds.length > 0 ||
                      e.shiftKey ||
                      e.metaKey ||
                      e.ctrlKey
                    ) {
                      e.stopPropagation();
                      setSelectedIds((prev) =>
                        prev.includes(item.id)
                          ? prev.filter((id) => id !== item.id)
                          : [...prev, item.id],
                      );
                    } else {
                      onEdit(item);
                    }
                  }}
                >
                  {/* Drag handle indicator */}
                  <div className="flex-shrink-0 opacity-0 group-hover:opacity-40 transition-opacity cursor-grab active:cursor-grabbing">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="text-zinc-400">
                      <circle cx="3" cy="2" r="1" />
                      <circle cx="9" cy="2" r="1" />
                      <circle cx="3" cy="6" r="1" />
                      <circle cx="9" cy="6" r="1" />
                      <circle cx="3" cy="10" r="1" />
                      <circle cx="9" cy="10" r="1" />
                    </svg>
                  </div>

                  <div className="relative">
                    <div
                      className={`absolute -top-1.5 -left-1.5 z-10 transition-all duration-200 ${selectedIds.length > 0 || selectedIds.includes(item.id) ? "opacity-100 scale-100" : "opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100"}`}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedIds((prev) =>
                            prev.includes(item.id)
                              ? prev.filter((id) => id !== item.id)
                              : [...prev, item.id],
                          );
                        }}
                        className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center transition-all duration-200 ${
                          selectedIds.includes(item.id)
                            ? "bg-accent border-none shadow"
                            : "border border-zinc-500 bg-zinc-800 hover:border-zinc-400"
                        }`}
                      >
                        <CheckCircle2
                          className={`w-2.5 h-2.5 text-white transition-opacity ${selectedIds.includes(item.id) ? "opacity-100" : "opacity-0"}`}
                        />
                      </button>
                    </div>
                    <div
                      className="w-9 h-9 bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-center flex-shrink-0 bg-cover bg-center overflow-hidden transition-transform duration-200 group-hover:scale-105"
                      style={
                        item.customIconColor
                          ? { backgroundColor: item.customIconColor }
                          : {}
                      }
                    >
                      {item.customIcon ? (
                        item.customIcon.startsWith("http") ||
                        item.customIcon.startsWith("data:") ? (
                          <div
                            className="w-full h-full bg-cover bg-center"
                            style={{
                              backgroundImage: `url(${item.customIcon})`,
                            }}
                          />
                        ) : (
                          <span className="text-base">{item.customIcon}</span>
                        )
                      ) : item.category === "Login" && item.website ? (
                        <img
                          src={`https://www.google.com/s2/favicons?sz=64&domain=${item.website}`}
                          className="w-4 h-4 rounded opacity-80"
                          alt=""
                          onError={(e) => {
                            (e.target as any).src = "";
                            (e.target as any).className = "hidden";
                            (e.target as any).parentElement.innerHTML =
                              '<span class="text-white text-xs font-medium uppercase">' +
                              item.title[0] +
                              "</span>";
                          }}
                        />
                      ) : (
                        <div className="text-zinc-500">
                          {getIcon(item.category)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 flex items-center justify-between">
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                        <h3 className="font-medium text-xs truncate text-zinc-200">
                          {item.title}
                        </h3>
                        {item.isFavorite && (
                          <Star className="w-2.5 h-2.5 text-yellow-500 fill-current flex-shrink-0" />
                        )}
                        {audit.breachedIds.includes(item.id) && (
                          <span className="flex items-center gap-0.5 text-[9px] uppercase font-bold text-red-500 bg-red-500/10 px-1 py-0.5 rounded-full flex-shrink-0">
                            <AlertTriangle className="w-2.5 h-2.5" /> Pwned
                          </span>
                        )}
                      </div>
                      <div className="text-zinc-500 text-[10px] mt-0.5 flex items-center gap-1.5 min-w-0">
                        <span className="truncate">
                          {item.category === "Login"
                            ? item.username
                            : item.category === "Card"
                              ? "•••• " +
                                (item.cardDetails?.number.slice(-4) || "CARD")
                              : item.category === "Identity"
                              ? `${item.identityDetails?.firstName || ""} ${item.identityDetails?.lastName || ""}`.trim() || "Identity"
                              : "Secure Note"}
                        </span>

                        {totpCode && (
                          <div
                            className="flex items-center gap-1 bg-zinc-800/80 px-1.5 py-0.5 rounded text-white font-mono select-all border border-zinc-700/50 flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(totpCode, item.id + "-totp");
                            }}
                          >
                            <Clock className="w-2.5 h-2.5 opacity-50 flex-shrink-0" />
                            <span className="text-[10px]">
                              {copiedId === item.id + "-totp"
                                ? "Copied"
                                : `${totpCode.slice(0, 3)} ${totpCode.slice(3)}`}
                            </span>
                            <div className="relative w-2.5 h-2.5 flex items-center justify-center flex-shrink-0">
                              <svg
                                className="-rotate-90 w-2.5 h-2.5"
                                viewBox="0 0 36 36"
                              >
                                <path
                                  className="text-zinc-700"
                                  strokeDasharray="100, 100"
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                />
                                <path
                                  className={`${timeRemaining < 6 ? "text-red-500" : "text-accent"} transition-all duration-1000 ease-linear`}
                                  strokeDasharray={`${(timeRemaining / 30) * 100}, 100`}
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                />
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(item.username || item.title, item.id);
                      }}
                      className="p-1.5 hover:bg-zinc-700 rounded-md transition-colors text-zinc-400 hover:text-white"
                    >
                      {copiedId === item.id ? (
                        <span className="text-[10px] font-medium">Copied</span>
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <div className="w-6 flex items-center justify-center">
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                    </div>
                  </div>
                  </motion.div>,
              );

              return elements;
            })
          )}
        </AnimatePresence>
      </div>

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 shadow-2xl rounded-2xl px-6 py-4 flex items-center gap-6 z-40 w-[90%] max-w-sm"
          >
            <div className="flex flex-col">
              <span className="text-white font-medium text-sm">
                {selectedIds.length} selected
              </span>
              <button
                onClick={() => setSelectedIds([])}
                className="text-xs text-zinc-400 hover:text-white transition-colors text-left"
              >
                Deselect all
              </button>
            </div>
            <div className="flex-1"></div>
            {activeCategory === "Trash" ? (
              <>
                <button
                  onClick={() => {
                    if (onBulkRestore) onBulkRestore(selectedIds);
                    setSelectedIds([]);
                  }}
                  className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white transition-colors text-sm font-medium"
                >
                  Restore
                </button>
                <button
                  onClick={() => {
                    if (onBulkDelete) {
                      onBulkDelete(selectedIds, true);
                      setSelectedIds([]);
                    }
                  }}
                  className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded-lg transition-colors text-sm font-medium"
                >
                  Delete
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowMoveModal(true)}
                  className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white transition-colors text-sm font-medium"
                >
                  Move
                </button>
                <button
                  onClick={() => {
                    if (onBulkDelete) {
                      onBulkDelete(selectedIds, false);
                      setSelectedIds([]);
                    }
                  }}
                  className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded-lg transition-colors text-sm font-medium"
                >
                  Trash
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMoveModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowMoveModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
                <h3 className="text-white font-medium">
                  Move {selectedIds.length} items to...
                </h3>
              </div>
              <div className="max-h-[50vh] overflow-y-auto p-2 space-y-1">
                <button
                  onClick={() => {
                    if (onBulkMove) onBulkMove(selectedIds, null);
                    setShowMoveModal(false);
                    setSelectedIds([]);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-zinc-800 rounded-xl transition-colors text-white text-sm font-medium flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4 text-zinc-400" />
                  </div>
                  No Folder (Root)
                </button>
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => {
                      if (onBulkMove) onBulkMove(selectedIds, folder.id);
                      setShowMoveModal(false);
                      setSelectedIds([]);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-zinc-800 rounded-xl transition-colors text-white text-sm font-medium flex items-center gap-3"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: `${folder.color || "#3b82f6"}20`,
                        color: folder.color || "#3b82f6",
                      }}
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
                      >
                        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                      </svg>
                    </div>
                    {folder.name}
                  </button>
                ))}
              </div>
              <div className="p-4 border-t border-zinc-800 flex justify-end bg-zinc-900/50">
                <button
                  onClick={() => setShowMoveModal(false)}
                  className="px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
