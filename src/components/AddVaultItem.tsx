import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Save,
  Trash2,
  Key,
  Globe,
  User,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  CreditCard,
  FileText,
  LayoutGrid,
  Clock,
  Tag,
  X,
  Star,
  ShieldAlert,
  Plus,
  Copy,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { VaultItem, VaultFolder } from "../types";
import { generateRandomPassword, decrypt, encrypt } from "../lib/crypto";

interface AddVaultItemProps {
  item?: VaultItem;
  folders?: VaultFolder[];
  masterPassword?: string;
  onSave: (item: Partial<VaultItem>) => void;
  onDelete?: (id: string, permanent?: boolean) => void;
  onRestore?: (id: string) => void;
  onCancel: () => void;
  decryptedPassword?: string;
  onShowToast: (text: string, type?: "success" | "error" | "info") => void;
}

export default function AddVaultItem({
  item,
  folders = [],
  masterPassword,
  onSave,
  onDelete,
  onRestore,
  onCancel,
  decryptedPassword = "",
  onShowToast,
}: AddVaultItemProps) {
  const [category, setCategory] = useState<VaultItem["category"]>(
    item?.category || "Login",
  );
  const [folderId, setFolderId] = useState<string>(item?.folderId || "");
  const [isFavorite, setIsFavorite] = useState<boolean>(
    item?.isFavorite || false,
  );
  const [customIcon, setCustomIcon] = useState(item?.customIcon || "");
  const [customIconColor, setCustomIconColor] = useState(
    item?.customIconColor || "",
  );
  const [showHistory, setShowHistory] = useState(false);
  const [title, setTitle] = useState(item?.title || "");
  const [website, setWebsite] = useState(item?.website || "");
  const [username, setUsername] = useState(item?.username || "");
  const [password, setPassword] = useState(decryptedPassword);

  // Decrypt TOTP back to raw for editing
  const initialTotp =
    item?.encryptedTotpSecret && masterPassword
      ? decrypt(item.encryptedTotpSecret, masterPassword) || ""
      : "";
  const [totpSecret, setTotpSecret] = useState(initialTotp);

  const [content, setContent] = useState(item?.content || "");
  const [cardDetails, setCardDetails] = useState(
    item?.cardDetails || { number: "", expiry: "", cvv: "" },
  );
  
  const [identityDetails, setIdentityDetails] = useState(
    item?.identityDetails || { firstName: "", lastName: "", idNumber: "", dob: "", address: "" },
  );

  const [customFields, setCustomFields] = useState<
    {
      id: string;
      name: string;
      value: string;
      isSecret: boolean;
      _show?: boolean;
    }[]
  >(() => {
    return (item?.customFields || []).map((cf) => ({
      ...cf,
      value:
        cf.isSecret && masterPassword && cf.value
          ? decrypt(cf.value, masterPassword) || ""
          : cf.value,
    }));
  });

  const [tags, setTags] = useState<string[]>(item?.tags || []);
  const [tagInput, setTagInput] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showGenSettings, setShowGenSettings] = useState(false);
  const [genOptions, setGenOptions] = useState({ length: 16, numbers: true, symbols: true, uppercase: true });
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => {
    if (decryptedPassword) {
      setPassword(decryptedPassword);
    }
  }, [decryptedPassword]);

  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: "None", color: "bg-zinc-800" };
    let score = 0;
    if (pass.length > 8) score++;
    if (pass.length > 12) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score <= 2) return { score, label: "Weak", color: "bg-red-500" };
    if (score <= 4) return { score, label: "Strong", color: "bg-yellow-500" };
    return { score, label: "Very Strong", color: "bg-green-500" };
  };

  const strength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    let encryptedTotpSecret = undefined;
    if (category === "Login" && totpSecret.trim() && masterPassword) {
      encryptedTotpSecret = encrypt(totpSecret.trim(), masterPassword);
    }

    if (category === "Login" && (window as any).PasswordCredential && !item) {
      try {
        const cred = new (window as any).PasswordCredential({
          id: username || title,
          password: password,
          name: title,
        });
        await navigator.credentials.store(cred);
      } catch (err) {
        console.error("Failed to store credentials in browser:", err);
      }
    }

    const finalCustomFields = customFields.map((cf) => ({
      id: cf.id,
      name: cf.name,
      value:
        cf.isSecret && masterPassword && cf.value
          ? encrypt(cf.value, masterPassword)
          : cf.value,
      isSecret: cf.isSecret,
    }));

    onSave({
      id: item?.id,
      category,
      title,
      website,
      username,
      encryptedPassword: password || "",
      encryptedTotpSecret,
      folderId: folderId || undefined,
      isFavorite,
      customIcon: customIcon || undefined,
      customIconColor: customIconColor || undefined,
      content,
      cardDetails,
      identityDetails,
      customFields:
        finalCustomFields.length > 0 ? finalCustomFields : undefined,
      strength: strength.score,
      tags,
      updatedAt: Date.now(),
    });
  };

  const handleGenerate = () => {
    const newPass = generateRandomPassword(genOptions.length, genOptions);
    setPassword(newPass);
    setShowPassword(true);
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
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

  return (
    <motion.div
      initial={{ x: 360 }}
      animate={{ x: 0 }}
      exit={{ x: 360 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="absolute inset-0 bg-black flex flex-col z-10"
    >
      <header className="px-3 pt-4 pb-3 flex items-center justify-between border-b border-zinc-900 bg-black">
        <button
          onClick={onCancel}
          className="p-1.5 -ml-1.5 hover:bg-zinc-900 rounded-lg text-zinc-500 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="font-semibold text-white tracking-tight text-sm">
          {item ? "Edit Item" : "New Item"}
        </h2>
        <div className="w-8" />
      </header>

      <form
        onSubmit={handleSubmit}
        className="flex-1 overflow-y-auto px-3 py-4 space-y-4 no-scrollbar pb-20"
      >
        {/* Category Picker */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-zinc-900/50 border border-zinc-800 rounded-2xl">
          {(["Login", "Card", "Note", "Identity"] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[10px] font-medium transition-all ${
                category === cat
                  ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {cat === "Login" && <Key className="w-4 h-4 mb-0.5" />}
              {cat === "Card" && <CreditCard className="w-4 h-4 mb-0.5" />}
              {cat === "Note" && <FileText className="w-4 h-4 mb-0.5" />}
              {cat === "Identity" && <User className="w-4 h-4 mb-0.5" />}
              {cat}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 space-y-1.5 focus-within:border-zinc-700 transition-all">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-500 block">
                Title
              </label>
              <button
                type="button"
                onClick={() => setIsFavorite(!isFavorite)}
                className={`transition-colors ${isFavorite ? "text-yellow-500" : "text-zinc-600 hover:text-zinc-400"}`}
              >
                <Star
                  className={`w-4 h-4 ${isFavorite ? "fill-current" : ""}`}
                />
              </button>
            </div>
            <div className="relative">
              <LayoutGrid className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. GitHub, Amazon"
                className="w-full bg-transparent border-none py-2 pl-7 pr-0 outline-none text-white text-sm font-medium placeholder:text-zinc-700"
              />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 space-y-1.5 focus-within:border-zinc-700 transition-all">
              <label className="text-xs font-semibold text-zinc-500 block">
                Folder
              </label>
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="w-full bg-transparent border-none py-2 text-white text-sm font-medium outline-none cursor-pointer appearance-none min-w-0"
              >
                <option value="" className="text-zinc-900">
                  None
                </option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id} className="text-zinc-900">
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 space-y-1.5 focus-within:border-zinc-700 transition-all">
              <label className="text-xs font-semibold text-zinc-500 block">
                Custom Icon
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={customIconColor || "#3b82f6"}
                  onChange={(e) => setCustomIconColor(e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer border-none p-0 bg-transparent flex-shrink-0"
                />
                <input
                  type="text"
                  value={customIcon}
                  onChange={(e) => setCustomIcon(e.target.value)}
                  placeholder="Emoji, URL, etc."
                  className="w-full min-w-0 bg-transparent border-none outline-none text-white text-sm font-medium placeholder:text-zinc-700"
                />
              </div>
            </div>
          </div>

          {category === "Login" && (
            <>
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 space-y-1.5 focus-within:border-zinc-700 transition-all">
                <label className="text-xs font-semibold text-zinc-500 block">
                  Website URL
                </label>
                <div className="relative">
                  <Globe className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                  <input
                    type="text"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="google.com"
                    className="w-full bg-transparent border-none py-2 pl-7 pr-0 outline-none text-white text-sm font-medium placeholder:text-zinc-700"
                  />
                </div>
              </div>

              <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 space-y-1.5 focus-within:border-zinc-700 transition-all">
                <label className="text-xs font-semibold text-zinc-500 block">
                  Username / Email
                </label>
                <div className="relative">
                  <User className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full bg-transparent border-none py-2 pl-7 pr-10 outline-none text-white text-sm font-medium placeholder:text-zinc-700"
                  />
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center pr-1">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(username);
                        onShowToast("Username copied to clipboard", "success");
                      }}
                      className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                      title="Copy username"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 space-y-1.5 focus-within:border-zinc-700 transition-all group">
                <label className="text-xs font-semibold text-zinc-500 block">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-transparent border-none py-2 pl-7 pr-16 outline-none text-white text-base font-mono placeholder:text-zinc-700 tracking-tight"
                  />
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center pr-1">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(password);
                        onShowToast("Password copied to clipboard", "success");
                      }}
                      className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                      title="Copy password"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="pt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowGenSettings(!showGenSettings)}
                    className="flex items-center gap-2 text-xs font-medium text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
                    Auto-Generate Password
                  </button>
                </div>
                {showGenSettings && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }} 
                    animate={{ opacity: 1, height: 'auto' }} 
                    className="pt-2 overflow-hidden"
                  >
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-zinc-400">Length: {genOptions.length}</label>
                        <input 
                          type="range" min="8" max="64" 
                          value={genOptions.length}
                          onChange={e => setGenOptions({...genOptions, length: parseInt(e.target.value)})}
                          className="w-2/3 accent-[var(--accent)]"
                        />
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs font-medium text-zinc-400">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={genOptions.numbers} onChange={e => setGenOptions({...genOptions, numbers: e.target.checked})} className="accent-[var(--accent)] rounded" />
                          Numbers
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={genOptions.symbols} onChange={e => setGenOptions({...genOptions, symbols: e.target.checked})} className="accent-[var(--accent)] rounded" />
                          Symbols
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={genOptions.uppercase} onChange={e => setGenOptions({...genOptions, uppercase: e.target.checked})} className="accent-[var(--accent)] rounded" />
                          Uppercase
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={handleGenerate}
                        className="w-full bg-accent hover:bg-accent-hover text-white text-xs font-bold py-2 rounded-lg transition-colors"
                      >
                        Generate & Apply
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 space-y-1.5 focus-within:border-zinc-700 transition-all">
                <label className="text-xs font-semibold text-zinc-500 block">
                  TOTP Setup Key (2FA)
                </label>
                <div className="relative">
                  <ShieldAlert className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                  <input
                    type="text"
                    value={totpSecret}
                    onChange={(e) => setTotpSecret(e.target.value)}
                    placeholder="JBSWY3DPEHPK3PXP"
                    className="w-full bg-transparent border-none py-2 pl-7 pr-10 outline-none text-white text-sm font-mono placeholder:text-zinc-700 tracking-wider"
                  />
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center pr-1">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(totpSecret);
                        onShowToast("TOTP secret copied to clipboard", "success");
                      }}
                      className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                      title="Copy TOTP secret"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-zinc-500 pt-1">
                  Paste the base32 secret key provided by the service to act as
                  an authenticator app.
                </p>
              </div>
            </>
          )}

          {category === "Card" && (
            <div className="space-y-4">
              {/* Realistic Card Visual */}
              <div className={`relative w-full aspect-[1.586/1] rounded-2xl p-6 flex flex-col justify-between overflow-hidden shadow-xl bg-gradient-to-br ${
                (() => {
                  const n = cardDetails.number.replace(/\D/g, "");
                  if (n.startsWith("4")) return "from-[#1A1F71] to-[#0A0D3B] text-white"; // Visa
                  if (/^5[1-5]/.test(n)) return "from-[#EB001B] to-[#F79E1B] text-white"; // Mastercard
                  if (/^3[47]/.test(n)) return "from-[#2A8297] to-[#1D5E6D] text-white"; // Amex
                  if (/^6(?:011|5)/.test(n)) return "from-[#E65C00] to-[#F9A021] text-white"; // Discover
                  return "from-zinc-800 to-zinc-950 text-white";
                })()
              }`}>
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white via-white/50 to-transparent" />
                
                <div className="flex justify-between items-start relative z-10 opacity-80">
                  <div className="w-12 h-8 rounded-md bg-gradient-to-br from-yellow-200 to-yellow-500/80 shadow-sm opacity-90 border border-yellow-100/20" />
                  <div className="font-bold text-lg italic tracking-wider opacity-90 truncate max-w-[100px]">
                    {(() => {
                      const n = cardDetails.number.replace(/\D/g, "");
                      if (n.startsWith("4")) return "VISA";
                      if (/^5[1-5]/.test(n)) return "MasterCard";
                      if (/^3[47]/.test(n)) return "AMEX";
                      if (/^6(?:011|5)/.test(n)) return "DISCOVER";
                      return "";
                    })()}
                  </div>
                </div>

                <div className="relative z-10 space-y-4">
                  <div className="font-mono text-xl tracking-wider textShadow flex justify-between gap-1 break-all">
                    {cardDetails.number || "•••• •••• •••• ••••"}
                  </div>
                  <div className="flex justify-between items-end">
                    <div className="space-y-1 max-w-[60%]">
                      <div className="text-[10px] uppercase tracking-widest opacity-60">Cardholder</div>
                      <div className="font-semibold tracking-widest text-sm truncate uppercase">
                        {title || "YOUR NAME"}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-widest opacity-60 text-right">Expires</div>
                      <div className="font-mono text-sm tracking-widest text-right">
                        {cardDetails.expiry || "MM/YY"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 block">
                    Card Number
                  </label>
                  <input
                    type="text"
                    value={cardDetails.number}
                    onChange={(e) =>
                      setCardDetails({ ...cardDetails, number: e.target.value })
                    }
                    placeholder="0000 0000 0000 0000"
                    className="w-full bg-transparent border-none py-1 outline-none text-white text-base font-mono placeholder:text-zinc-700"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-500 block">
                      Expiry
                    </label>
                    <input
                      type="text"
                      value={cardDetails.expiry}
                      onChange={(e) =>
                        setCardDetails({ ...cardDetails, expiry: e.target.value })
                      }
                      placeholder="MM/YY"
                      className="w-full bg-transparent border-none py-1 outline-none text-white text-base font-mono placeholder:text-zinc-700"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-500 block">
                      CVV
                    </label>
                    <input
                      type="text"
                      value={cardDetails.cvv}
                      onChange={(e) =>
                        setCardDetails({ ...cardDetails, cvv: e.target.value })
                      }
                      placeholder="123"
                      className="w-full bg-transparent border-none py-1 outline-none text-white text-base font-mono placeholder:text-zinc-700"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {category === "Identity" && (
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 block">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={identityDetails.firstName}
                    onChange={(e) => setIdentityDetails({ ...identityDetails, firstName: e.target.value })}
                    className="w-full bg-transparent border-none py-1 outline-none text-white text-sm placeholder:text-zinc-700"
                    placeholder="John"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 block">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={identityDetails.lastName}
                    onChange={(e) => setIdentityDetails({ ...identityDetails, lastName: e.target.value })}
                    className="w-full bg-transparent border-none py-1 outline-none text-white text-sm placeholder:text-zinc-700"
                    placeholder="Doe"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 block">
                  SSN / ID Number
                </label>
                <input
                  type="text"
                  value={identityDetails.idNumber}
                  onChange={(e) => setIdentityDetails({ ...identityDetails, idNumber: e.target.value })}
                  className="w-full bg-transparent border-none py-1 outline-none text-white text-sm font-mono placeholder:text-zinc-700"
                  placeholder="000-00-0000"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 block">
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={identityDetails.dob}
                  onChange={(e) => setIdentityDetails({ ...identityDetails, dob: e.target.value })}
                  className="w-full bg-transparent border-none py-1 outline-none text-white text-sm placeholder:text-zinc-700 [color-scheme:dark]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 block">
                  Address
                </label>
                <textarea
                  value={identityDetails.address}
                  onChange={(e) => setIdentityDetails({ ...identityDetails, address: e.target.value })}
                  className="w-full bg-transparent border-none py-1 outline-none text-white text-sm resize-none h-20 placeholder:text-zinc-700"
                  placeholder="123 Main St..."
                />
              </div>
            </div>
          )}

          {category === "Note" && (
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 space-y-2 min-h-[200px] flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-zinc-500 block">
                  Content (Markdown)
                </label>
                <button
                  type="button"
                  onClick={() => setIsPreview(!isPreview)}
                  className="text-xs font-medium text-white px-2 py-1 bg-zinc-800 rounded-md"
                >
                  {isPreview ? "Edit" : "Preview"}
                </button>
              </div>
              {isPreview ? (
                <div className="flex-1 text-sm text-zinc-300 prose prose-invert max-w-none prose-sm leading-relaxed">
                  <ReactMarkdown>{content || "*No content*"}</ReactMarkdown>
                </div>
              ) : (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your secure notes here..."
                  className="flex-1 bg-transparent border-none py-2 outline-none text-white text-sm font-sans resize-none min-h-[150px] placeholder:text-zinc-700"
                />
              )}
            </div>
          )}

          {/* Custom Fields */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-500 block">
                Custom Fields
              </label>
              <button
                type="button"
                onClick={() =>
                  setCustomFields([
                    ...customFields,
                    {
                      id: Date.now().toString(),
                      name: "",
                      value: "",
                      isSecret: false,
                    },
                  ])
                }
                className="text-xs flex items-center gap-1 font-medium text-accent hover:text-accent-hover transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Field
              </button>
            </div>
            {customFields.length > 0 ? (
              <div className="space-y-3">
                {customFields.map((field, idx) => (
                  <div
                    key={field.id}
                    className="flex gap-2 items-start relative group"
                  >
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={field.name}
                        onChange={(e) => {
                          const newFields = [...customFields];
                          newFields[idx].name = e.target.value;
                          setCustomFields(newFields);
                        }}
                        placeholder="Field Name (e.g., SSH Key)"
                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg py-1.5 px-3 outline-none text-white text-sm placeholder:text-zinc-700 focus:border-zinc-700 transition-colors"
                      />
                      <div className="relative">
                        <input
                          type={
                            field.isSecret && !field["_show"]
                              ? "password"
                              : "text"
                          }
                          value={field.value}
                          onChange={(e) => {
                            const newFields = [...customFields];
                            newFields[idx].value = e.target.value;
                            setCustomFields(newFields);
                          }}
                          placeholder="Value"
                          className={`w-full bg-zinc-900/50 border border-zinc-800 rounded-lg py-1.5 px-3 outline-none text-white text-sm font-mono placeholder:text-zinc-700 focus:border-zinc-700 transition-colors ${field.isSecret ? "pr-14" : "pr-8"}`}
                        />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center pr-1">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(field.value);
                              onShowToast("Field copied to clipboard", "success");
                            }}
                            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                            title="Copy field"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          {field.isSecret && (
                            <button
                              type="button"
                              onClick={() => {
                                const newFields = [...customFields];
                                newFields[idx]["_show"] =
                                  !newFields[idx]["_show"];
                                setCustomFields(newFields);
                              }}
                              className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                              {field["_show"] ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 mt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const newFields = [...customFields];
                          newFields[idx].isSecret = !newFields[idx].isSecret;
                          setCustomFields(newFields);
                        }}
                        className={`p-1.5 rounded-md border transition-colors ${field.isSecret ? "bg-zinc-800 border-zinc-700 text-accent" : "border-zinc-800 text-zinc-500 hover:text-zinc-300"}`}
                        title={
                          field.isSecret ? "Secret Field" : "Plaintext Field"
                        }
                      >
                        <Lock className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const newFields = customFields.filter(
                            (_, i) => i !== idx,
                          );
                          setCustomFields(newFields);
                        }}
                        className="p-1.5 rounded-md border border-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-500/50 transition-colors"
                        title="Delete Field"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600 bg-zinc-900/50 py-3 px-4 rounded-lg border border-zinc-800/50 text-center font-medium">
                No custom fields added
              </p>
            )}
          </div>

          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 space-y-3">
            <label className="text-xs font-semibold text-zinc-500 block">
              Tags
            </label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-800 text-xs font-medium text-zinc-300"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="relative focus-within:border-zinc-700 transition-all border border-transparent rounded-lg">
              <Tag className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add a tag and press Enter..."
                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg py-2 py-1.5 pl-8 pr-3 outline-none text-white text-sm placeholder:text-zinc-700"
              />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-900/20 border border-zinc-800/50 rounded-2xl p-4">
              <p className="text-xs text-zinc-500 font-semibold mb-2">
                Password Strength
              </p>
              <div className="flex gap-1 mb-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                      i <= (category === "Login" ? strength.score : 4)
                        ? strength.color
                        : "bg-zinc-800"
                    }`}
                  />
                ))}
              </div>
              <p
                className={`text-xs font-semibold transition-colors ${
                  category === "Login" && strength.score > 0
                    ? strength.color.replace("bg-", "text-")
                    : "text-zinc-500"
                }`}
              >
                {category === "Login" ? strength.label : "N/A"}
              </p>
            </div>
            <div className="bg-zinc-900/20 border border-zinc-800/50 rounded-2xl p-4">
              <p className="text-xs text-zinc-500 font-semibold mb-2">
                Last Modified
              </p>
              <p className="text-sm font-medium text-white pt-1">
                {item ? timeAgo(item.updatedAt) : "Never"}
              </p>
            </div>
          </div>
        </div>

        <div className="pt-4 space-y-3">
          {item?.deletedAt ? (
            <>
              {onRestore && (
                <button
                  type="button"
                  onClick={() => onRestore(item.id)}
                  className="w-full bg-white text-black font-semibold py-4 rounded-xl hover:bg-zinc-200 transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  Restore Item
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(item.id, true)}
                  className="w-full bg-zinc-900/50 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 text-zinc-500 hover:text-red-500 font-medium py-3.5 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-5 h-5" />
                  Permanently Delete
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="submit"
                className="w-full bg-white text-black font-semibold py-4 rounded-xl hover:bg-zinc-200 transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Save className="w-5 h-5" />
                {item ? "Save Changes" : "Create Item"}
              </button>

              {item && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  className="w-full bg-zinc-900/50 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 text-zinc-500 hover:text-red-500 font-medium py-3.5 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-5 h-5" />
                  {item.deletedAt ? "Permanently Delete" : "Move to Trash"}
                </button>
              )}
            </>
          )}
        </div>

        <div className="bg-zinc-900/30 border border-zinc-800 p-4 rounded-xl">
          <p className="text-xs text-zinc-500 font-medium leading-relaxed">
            This {category.toLowerCase()} is protected by your end-to-end
            encrypted vault, securely stored locally.
          </p>
        </div>

        {item?.passwordHistory && item.passwordHistory.length > 0 && (
          <div className="space-y-4 pb-8 border-t border-zinc-800/50 pt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-accent" />
                Password History
              </h3>
              <span className="text-xs bg-zinc-800 text-zinc-400 px-2.5 py-0.5 rounded-full font-medium">
                {item.passwordHistory.length}
              </span>
            </div>

            <div className="relative pl-3 space-y-6 before:absolute before:inset-0 before:ml-[15px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-zinc-800 before:to-transparent">
              {item.passwordHistory.map((h, i) => (
                <div
                  key={i}
                  className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full border-4 border-zinc-950 bg-zinc-800 text-zinc-400 z-10 shrink-0">
                    <div className="w-2 h-2 rounded-full bg-zinc-600"></div>
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-4 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-zinc-500 font-medium">
                        {new Date(h.timestamp).toLocaleString()}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (masterPassword) {
                            const dec = decrypt(h.password, masterPassword);
                            if (dec) setPassword(dec);
                          }
                        }}
                        className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
                      >
                        Restore
                      </button>
                    </div>
                    <div className="text-sm font-mono text-zinc-300 break-all select-all">
                      {masterPassword
                        ? decrypt(h.password, masterPassword)
                        : "••••••••"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </form>
    </motion.div>
  );
}
