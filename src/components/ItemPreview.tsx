import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowLeft01Icon, ArrowUp01Icon, Clock01Icon, Copy01Icon, CreditCardIcon, Delete02Icon, FileAttachmentIcon, GlobeIcon, Key01Icon, LockIcon, PencilIcon, RotateLeft01Icon, StarIcon, Tag01Icon, Tick01Icon, UserIcon, ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { VaultItem, VaultFolder } from "../types";
import { decrypt } from "../lib/crypto";
import * as OTPAuth from "otpauth";

const CopyButton = ({ field, text, copiedField, onCopy }: {
  field: string;
  text: string;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
}) => (
  <button
    type="button"
    onClick={() => onCopy(text, field)}
    className="p-2 text-zinc-500 hover:text-white transition-colors"
  >
    {copiedField === field ? (
      <HugeiconsIcon icon={Tick01Icon} className="w-4 h-4 text-green-500" />
    ) : (
      <HugeiconsIcon icon={Copy01Icon} className="w-4 h-4" />
    )}
  </button>
);

const FieldCard = ({ icon, label, value, isSecret, isMonospace, actions, showPassword, copiedField, onCopy }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  isSecret?: boolean;
  isMonospace?: boolean;
  actions?: React.ReactNode;
  showPassword: boolean;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
}) => (
  <div className="flex items-center gap-3 py-3">
    <div className="text-zinc-500 flex-shrink-0">{icon}</div>
    <div className="flex-1 min-w-0">
      <p className="text-[11px] text-zinc-500 font-medium">{label}</p>
      <p className={`text-sm text-white mt-0.5 truncate ${isMonospace ? "font-mono" : ""}`}>
        {isSecret && !showPassword ? (value ? "••••••••••••" : "—") : (value || "—")}
      </p>
    </div>
    <div className="flex items-center gap-0.5 flex-shrink-0">
      {actions}
      <CopyButton field={label} text={isSecret && !showPassword ? "" : value} copiedField={copiedField} onCopy={onCopy} />
    </div>
  </div>
);

interface ItemPreviewProps {
  item: VaultItem;
  folders?: VaultFolder[];
  masterPassword?: string;
  onBack: () => void;
  onEdit: () => void;
  onDelete: (id: string, permanent?: boolean) => void;
  onRestore?: (id: string) => void;
  onRestorePassword?: (id: string, oldPassword: string) => void;
  onToggleFavorite?: (id: string) => void;
  onShowToast: (text: string, type?: "success" | "error" | "info") => void;
}

export default function ItemPreview({
  item,
  folders = [],
  masterPassword,
  onBack,
  onEdit,
  onDelete,
  onRestore,
  onRestorePassword,
  onToggleFavorite,
  onShowToast,
}: ItemPreviewProps) {
  const [password, setPassword] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [timeRemaining, setTimeRemaining] = useState(30 - (Math.floor(Date.now() / 1000) % 30));
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<
    { id: string; name: string; value: string; isSecret: boolean; _show?: boolean }[]
  >([]);
  const [showHistory, setShowHistory] = useState(false);
  const [decryptedHistory, setDecryptedHistory] = useState<{ password: string; timestamp: number }[]>([]);
  const [showHistoryEntry, setShowHistoryEntry] = useState<string | null>(null);
  const [showConfirmPermanentDelete, setShowConfirmPermanentDelete] = useState(false);
  const [decryptedCvv, setDecryptedCvv] = useState("");

  useEffect(() => {
    if (item.encryptedPassword && masterPassword) {
      decrypt(item.encryptedPassword, masterPassword).then((val) => {
        if (val) setPassword(val);
      });
    }
  }, [item.encryptedPassword, masterPassword]);

  useEffect(() => {
    if (item.encryptedTotpSecret && masterPassword) {
      decrypt(item.encryptedTotpSecret, masterPassword).then((val) => {
        if (val) setTotpSecret(val);
      });
    }
  }, [item.encryptedTotpSecret, masterPassword]);

  useEffect(() => {
    if (item.cardDetails?.encryptedCvv && masterPassword) {
      decrypt(item.cardDetails.encryptedCvv, masterPassword).then((val) => {
        if (val) setDecryptedCvv(val);
      });
    } else {
      setDecryptedCvv("");
    }
  }, [item.cardDetails?.encryptedCvv, masterPassword]);

  useEffect(() => {
    setCustomFields([]);
    if (!item.customFields || !masterPassword) return;
    const decrypted = item.customFields.map(async (cf) => {
      let val = cf.value;
      if (cf.isSecret && cf.value) {
        const d = await decrypt(cf.value, masterPassword);
        if (d) val = d;
      }
      return { ...cf, value: val };
    });
    Promise.all(decrypted).then((results) => setCustomFields(results));
  }, [item.id, item.customFields, masterPassword]);

  useEffect(() => {
    if (!item.passwordHistory || item.passwordHistory.length === 0 || !masterPassword) {
      setDecryptedHistory([]);
      return;
    }
    let cancelled = false;
    const decryptHistory = async () => {
      const results = await Promise.all(
        item.passwordHistory.map(async (entry) => {
          try {
            const pass = await decrypt(entry.password, masterPassword);
            return { password: pass || "", timestamp: entry.timestamp };
          } catch {
            return { password: "", timestamp: entry.timestamp };
          }
        })
      );
      if (!cancelled) setDecryptedHistory(results.filter((r) => r.password));
    };
    decryptHistory();
    return () => { cancelled = true; };
  }, [item.passwordHistory, masterPassword]);

  useEffect(() => {
    if (!totpSecret) return;

    const totp = new OTPAuth.TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(totpSecret.replace(/\s+/g, "")),
    });

    const generateTOTP = () => {
      try {
        const epoch = Math.floor(Date.now() / 1000);
        setTimeRemaining(30 - (epoch % 30));
        setTotpCode(totp.generate());
      } catch {
        setTotpCode("");
      }
    };

    generateTOTP();
    const interval = setInterval(generateTOTP, 1000);
    return () => clearInterval(interval);
  }, [totpSecret]);

  const handleCopy = (text: string, label: string) => {
    if (text) {
      navigator.clipboard.writeText(text);
      setCopiedField(label);
      onShowToast(`${label} copied`, "success");
      setTimeout(() => setCopiedField(null), 2000);
      setTimeout(() => {
        navigator.clipboard.writeText("");
      }, 30000);
    }
  };

  const timeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const folderName = folders.find((f) => f.id === item.folderId)?.name;

  return (
    <motion.div
      initial={{ x: 360 }}
      animate={{ x: 0 }}
      exit={{ x: 360 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="absolute inset-0 bg-black flex flex-col z-10"
    >
      {/* Header */}
      <header className="px-4 pt-4 pb-3 flex items-center justify-between">
        <button
          onClick={onBack}
          className="p-2 -ml-2 hover:bg-zinc-900 rounded-xl text-zinc-400 hover:text-white transition-colors"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="w-5 h-5" />
        </button>
        <h2 className="font-semibold text-white tracking-tight text-sm truncate max-w-[160px]">
          {item.title}
        </h2>
        <button
          onClick={() => onToggleFavorite?.(item.id)}
          className={`p-2 hover:bg-zinc-900 rounded-xl transition-colors ${item.isFavorite ? "text-yellow-500" : "text-zinc-600 hover:text-zinc-400"}`}
        >
          <HugeiconsIcon icon={StarIcon} className={`w-5 h-5 ${item.isFavorite ? "fill-current" : ""}`} />
        </button>
        <button
          onClick={onEdit}
          className="p-2 -mr-2 hover:bg-zinc-900 rounded-xl text-zinc-400 hover:text-white transition-colors"
        >
          <HugeiconsIcon icon={PencilIcon} className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4 no-scrollbar pb-20">
        {/* TOTP */}
        {totpCode && item.category === "Login" && (
          <div className="bg-zinc-900/50 rounded-2xl p-5 text-center">
            <p className="text-[11px] font-medium text-zinc-500 mb-2">Verification Code</p>
            <div className="flex items-center justify-center gap-4">
              <p className="text-4xl font-mono font-bold text-white tracking-[0.25em]">
                {totpCode.slice(0, 3)} {totpCode.slice(3)}
              </p>
              <div className="relative w-10 h-10">
                <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-zinc-800"
                    strokeDasharray="100, 100"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className={timeRemaining < 6 ? "text-red-500" : "text-white"}
                    strokeDasharray={`${(timeRemaining / 30) * 100}, 100`}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
            <button
              onClick={() => handleCopy(totpCode, "TOTP")}
              className="mt-3 text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1 mx-auto"
            >
              {copiedField === "TOTP" ? <HugeiconsIcon icon={Tick01Icon} className="w-3 h-3 text-green-500" /> : <HugeiconsIcon icon={Copy01Icon} className="w-3 h-3" />}
              {copiedField === "TOTP" ? "Copied" : "Tap to copy"}
            </button>
          </div>
        )}

        {/* Login fields */}
        {item.category === "Login" && (
          <div className="bg-zinc-900/30 rounded-2xl px-4 divide-y divide-zinc-800/50">
            <FieldCard
              icon={<HugeiconsIcon icon={UserIcon} className="w-4 h-4" />}
              label="Username"
              value={item.username}
              showPassword={showPassword}
              copiedField={copiedField}
              onCopy={handleCopy}
            />
            <FieldCard
              icon={<HugeiconsIcon icon={LockIcon} className="w-4 h-4" />}
              label="Password"
              value={password}
              isSecret
              actions={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-2 text-zinc-500 hover:text-white transition-colors"
                >
                  {showPassword ? <HugeiconsIcon icon={ViewOffIcon} className="w-4 h-4" /> : <HugeiconsIcon icon={ViewIcon} className="w-4 h-4" />}
                </button>
              }
              showPassword={showPassword}
              copiedField={copiedField}
              onCopy={handleCopy}
            />
            {item.website && (
              <FieldCard
                icon={<HugeiconsIcon icon={GlobeIcon} className="w-4 h-4" />}
                label="Website"
                value={item.website}
                showPassword={showPassword}
                copiedField={copiedField}
                onCopy={handleCopy}
              />
            )}
          </div>
        )}

        {/* Card fields */}
        {item.category === "Card" && (
          <div className="bg-zinc-900/30 rounded-2xl px-4 divide-y divide-zinc-800/50">
            <FieldCard
              icon={<HugeiconsIcon icon={CreditCardIcon} className="w-4 h-4" />}
              label="Card Number"
              value={item.cardDetails?.number || ""}
              isMonospace
              showPassword={showPassword}
              copiedField={copiedField}
              onCopy={handleCopy}
            />
            <div className="flex items-center gap-3 py-3">
              <div className="flex-1">
                <p className="text-[11px] text-zinc-500 font-medium">Expiry</p>
                <p className="text-sm font-mono text-white mt-0.5">{item.cardDetails?.expiry || "—"}</p>
              </div>
              <div className="flex-1">
                <p className="text-[11px] text-zinc-500 font-medium">CVV</p>
                <p className="text-sm font-mono text-white mt-0.5">{showPassword ? (decryptedCvv || "—") : (decryptedCvv ? "•••" : "—")}</p>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <CopyButton field="cardExpiry" text={item.cardDetails?.expiry || ""} copiedField={copiedField} onCopy={handleCopy} />
                <CopyButton field="cardCvv" text={showPassword ? decryptedCvv : ""} copiedField={copiedField} onCopy={handleCopy} />
              </div>
            </div>
          </div>
        )}

        {/* Note */}
        {item.category === "Note" && (
          <div className="bg-zinc-900/30 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <HugeiconsIcon icon={FileAttachmentIcon} className="w-4 h-4 text-zinc-500" />
              <p className="text-[11px] text-zinc-500 font-medium">Content</p>
            </div>
            <div
              className="text-sm text-zinc-300 leading-relaxed prose prose-invert prose-sm max-w-none prose-headings:text-white prose-a:text-accent prose-strong:text-white"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(marked.parse(item.content || "—") as string),
              }}
            />
          </div>
        )}

        {/* Identity */}
        {item.category === "Identity" && (
          <div className="bg-zinc-900/30 rounded-2xl px-4 divide-y divide-zinc-800/50">
            <div className="flex items-center gap-3 py-3">
              <div className="flex-1">
                <p className="text-[11px] text-zinc-500 font-medium">First Name</p>
                <p className="text-sm text-white mt-0.5">{item.identityDetails?.firstName || "—"}</p>
              </div>
              <div className="flex-1">
                <p className="text-[11px] text-zinc-500 font-medium">Last Name</p>
                <p className="text-sm text-white mt-0.5">{item.identityDetails?.lastName || "—"}</p>
              </div>
            </div>
            <FieldCard
              icon={<HugeiconsIcon icon={Key01Icon} className="w-4 h-4" />}
              label="ID Number"
              value={item.identityDetails?.idNumber || ""}
              isMonospace
              showPassword={showPassword}
              copiedField={copiedField}
              onCopy={handleCopy}
            />
            <FieldCard
              icon={<HugeiconsIcon icon={Clock01Icon} className="w-4 h-4" />}
              label="Date of Birth"
              value={item.identityDetails?.dob || ""}
              showPassword={showPassword}
              copiedField={copiedField}
              onCopy={handleCopy}
            />
            <div className="py-3">
              <p className="text-[11px] text-zinc-500 font-medium">Address</p>
              <p className="text-sm text-zinc-300 mt-0.5">{item.identityDetails?.address || "—"}</p>
            </div>
          </div>
        )}

        {/* Custom Fields */}
        {customFields.length > 0 && (
          <div className="bg-zinc-900/30 rounded-2xl px-4 divide-y divide-zinc-800/50">
            {customFields.map((field) => (
              <div key={field.id} className="flex items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-zinc-500 font-medium">{field.name}</p>
                  <p className="text-sm font-mono text-white mt-0.5 truncate">
                    {field.isSecret && !field._show
                      ? (field.value ? "••••••••" : "—")
                      : (field.value || "—")}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {field.isSecret && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomFields((prev) =>
                          prev.map((f) =>
                            f.id === field.id ? { ...f, _show: !f._show } : f
                          )
                        );
                      }}
                      className="p-2 text-zinc-500 hover:text-white transition-colors"
                    >
                      {field._show ? <HugeiconsIcon icon={ViewOffIcon} className="w-4 h-4" /> : <HugeiconsIcon icon={ViewIcon} className="w-4 h-4" />}
                    </button>
                  )}
                  <CopyButton field={field.id} text={field.value} copiedField={copiedField} onCopy={handleCopy} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex items-center gap-2 px-1">
            <HugeiconsIcon icon={Tag01Icon} className="w-3.5 h-3.5 text-zinc-600" />
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded-full bg-zinc-900 text-[11px] font-medium text-zinc-400">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="flex items-center gap-3 text-[11px] text-zinc-600 px-1">
          <div className="flex items-center gap-1">
            <HugeiconsIcon icon={Clock01Icon} className="w-3 h-3" />
            <span>{timeAgo(item.updatedAt)}</span>
          </div>
          {folderName && <span>· {folderName}</span>}
        </div>

        {/* Password History */}
        {item.category === "Login" && decryptedHistory.length > 0 && (
          <div className="bg-zinc-900/30 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={Clock01Icon} className="w-4 h-4 text-zinc-500" />
                <p className="text-sm font-medium text-white">Password History</p>
                <span className="text-[11px] text-zinc-500">({decryptedHistory.length})</span>
              </div>
              {showHistory ? <HugeiconsIcon icon={ArrowUp01Icon} className="w-4 h-4 text-zinc-500" /> : <HugeiconsIcon icon={ArrowDown01Icon} className="w-4 h-4 text-zinc-500" />}
            </button>
            <AnimatePresence>
              {showHistory && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-3 divide-y divide-zinc-800/50">
                    {decryptedHistory.map((entry, idx) => (
                      <div key={idx} className="py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono text-white truncate">
                            {showHistoryEntry === `hist-${idx}` ? entry.password : "••••••••••••"}
                          </p>
                          <p className="text-[11px] text-zinc-500 mt-0.5">{timeAgo(entry.timestamp)}</p>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => setShowHistoryEntry(showHistoryEntry === `hist-${idx}` ? null : `hist-${idx}`)}
                            className="p-2 text-zinc-500 hover:text-white transition-colors"
                          >
                            {showHistoryEntry === `hist-${idx}` ? <HugeiconsIcon icon={ViewOffIcon} className="w-4 h-4" /> : <HugeiconsIcon icon={ViewIcon} className="w-4 h-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(entry.password);
                              onShowToast("Password copied", "success");
                              setTimeout(() => {
                                navigator.clipboard.writeText("");
                              }, 30000);
                            }}
                            className="p-2 text-zinc-500 hover:text-white transition-colors"
                          >
                            <HugeiconsIcon icon={Copy01Icon} className="w-4 h-4" />
                          </button>
                          {onRestorePassword && (
                            <button
                              type="button"
                              onClick={() => onRestorePassword(item.id, entry.password)}
                              className="p-2 text-zinc-500 hover:text-white transition-colors"
                            >
                              <HugeiconsIcon icon={RotateLeft01Icon} className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Delete */}
        <div className="pt-2">
          {item.deletedAt ? (
            <>
              {onRestore && (
                <button
                  type="button"
                  onClick={() => onRestore(item.id)}
                  className="w-full bg-white text-black font-semibold py-3 rounded-xl hover:bg-zinc-200 transition-colors active:scale-[0.98] text-sm"
                >
                  Restore Item
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowConfirmPermanentDelete(true)}
                className="w-full text-red-400 font-medium py-3 rounded-xl hover:bg-red-500/10 transition-colors text-sm mt-2"
              >
                Permanently Delete
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              className="w-full text-red-400 font-medium py-3 rounded-xl hover:bg-red-500/10 transition-colors text-sm"
            >
              Move to Trash
            </button>
          )}
        </div>
      </div>

      {/* Permanent Delete Confirmation */}
      <AnimatePresence>
        {showConfirmPermanentDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirmPermanentDelete(false)}
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
                  <HugeiconsIcon icon={Delete02Icon} className="w-6 h-6 text-red-500" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-semibold text-white">Permanently Delete?</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    This will permanently delete <span className="text-white font-medium">{item.title}</span>.
                    This action <span className="text-red-400 font-semibold">cannot be undone</span>.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => { onDelete(item.id, true); setShowConfirmPermanentDelete(false); }}
                  className="w-full py-3 bg-red-500 text-white text-xs font-semibold rounded-xl hover:bg-red-600 transition-colors"
                >
                  Yes, Delete Permanently
                </button>
                <button
                  onClick={() => setShowConfirmPermanentDelete(false)}
                  className="w-full py-3 bg-zinc-800 text-white text-xs font-semibold rounded-xl hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
