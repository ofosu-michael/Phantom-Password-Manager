import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, ArrowLeft01Icon, Cancel01Icon, Copy01Icon, CreditCardIcon, Delete02Icon, FileAttachmentIcon, FloppyDiskIcon, GlobeIcon, Key01Icon, LockIcon, SparklesIcon, StarIcon, UserIcon, ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
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

const copyToClipboard = (text: string, label: string, onShowToast: (text: string, type?: "success" | "error" | "info") => void) => {
  if (text) {
    navigator.clipboard.writeText(text);
    onShowToast(`${label} copied`, "success");
    setTimeout(() => {
      navigator.clipboard.writeText("");
    }, 30000);
  }
};

const InputField = ({ icon, label, value, onChange, type = "text", placeholder, showCopy, showPasswordToggle, isMonospace, onShowToast, showPassword, setShowPassword }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (val: string) => void;
  type?: string;
  placeholder?: string;
  showCopy?: boolean;
  showPasswordToggle?: boolean;
  isMonospace?: boolean;
  onShowToast?: (text: string, type?: "success" | "error" | "info") => void;
  showPassword?: boolean;
  setShowPassword?: (val: boolean) => void;
}) => (
  <div className="flex items-center gap-3 py-3">
    <div className="text-zinc-500 flex-shrink-0">{icon}</div>
    <div className="flex-1 min-w-0">
      <p className="text-[11px] text-zinc-500 font-medium">{label}</p>
      <input
        type={showPasswordToggle && showPassword ? "text" : type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-transparent border-none py-0.5 outline-none text-white text-sm placeholder:text-zinc-600 ${isMonospace ? "font-mono" : ""}`}
      />
    </div>
    <div className="flex items-center gap-0.5 flex-shrink-0">
      {showCopy && value && (
        <button type="button" onClick={() => copyToClipboard(value, label, onShowToast!)} className="p-2 text-zinc-500 hover:text-white transition-colors">
          <HugeiconsIcon icon={Copy01Icon} className="w-4 h-4" />
        </button>
      )}
      {showPasswordToggle && (
        <button type="button" onClick={() => setShowPassword?.(!showPassword)} className="p-2 text-zinc-500 hover:text-white transition-colors">
          {showPassword ? <HugeiconsIcon icon={ViewOffIcon} className="w-4 h-4" /> : <HugeiconsIcon icon={ViewIcon} className="w-4 h-4" />}
        </button>
      )}
    </div>
  </div>
);

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
  const [title, setTitle] = useState(item?.title || "");
  const [website, setWebsite] = useState(item?.website || "");
  const [username, setUsername] = useState(item?.username || "");
  const [password, setPassword] = useState(decryptedPassword);
  const [totpSecret, setTotpSecret] = useState("");
  const [content, setContent] = useState(item?.content || "");
  const [cardDetails, setCardDetails] = useState(
    item?.cardDetails || { number: "", expiry: "", cvv: "" },
  );
  const [identityDetails, setIdentityDetails] = useState(
    item?.identityDetails || { firstName: "", lastName: "", idNumber: "", dob: "", address: "" },
  );
  const [customFields, setCustomFields] = useState<
    { id: string; name: string; value: string; isSecret: boolean; _show?: boolean }[]
  >(() => (item?.customFields || []).map((cf) => ({ ...cf, value: cf.value })));
  const [tags, setTags] = useState<string[]>(item?.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (decryptedPassword) setPassword(decryptedPassword);
  }, [decryptedPassword]);

  useEffect(() => {
    if (item?.encryptedTotpSecret && masterPassword) {
      decrypt(item.encryptedTotpSecret, masterPassword).then((val) => {
        if (val) setTotpSecret(val);
      });
    }
  }, [item?.encryptedTotpSecret, masterPassword]);

  useEffect(() => {
    if (item?.customFields && masterPassword) {
      item.customFields.forEach(async (cf) => {
        if (cf.isSecret && cf.value) {
          const val = await decrypt(cf.value, masterPassword);
          if (val) {
            setCustomFields((prev) =>
              prev.map((f) => (f.id === cf.id ? { ...f, value: val } : f))
            );
          }
        }
      });
    }
  }, [item?.customFields, masterPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    let history = item?.passwordHistory || [];

    if (item?.id && category === "Login" && password) {
      const oldPassRaw = await decrypt(item.encryptedPassword, masterPassword || "");
      if (oldPassRaw && oldPassRaw !== password) {
        const reencryptedOldPass = await encrypt(oldPassRaw, masterPassword || "");
        history = [
          { password: reencryptedOldPass, timestamp: item.updatedAt },
          ...(item.passwordHistory || []),
        ].slice(0, 5);
      }
    }

    const encryptedPassword = await encrypt(password || "", masterPassword || "");

    let encryptedTotpSecret = undefined;
    if (totpSecret.trim()) {
      encryptedTotpSecret = await encrypt(totpSecret.trim(), masterPassword || "");
    }

    const finalCustomFields = await Promise.all(
      customFields.map(async (cf) => ({
        id: cf.id,
        name: cf.name,
        value:
          cf.isSecret && masterPassword && cf.value
            ? await encrypt(cf.value, masterPassword)
            : cf.value,
        isSecret: cf.isSecret,
      }))
    );

    onSave({
      id: item?.id,
      category,
      title,
      website,
      username,
      encryptedPassword,
      encryptedTotpSecret,
      folderId: folderId || undefined,
      isFavorite,
      content,
      cardDetails,
      identityDetails,
      customFields: finalCustomFields.length > 0 ? finalCustomFields : undefined,
      tags,
      updatedAt: Date.now(),
    });
  };

  const handleGenerate = () => {
    const newPass = generateRandomPassword(16, { numbers: true, symbols: true, uppercase: true });
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
          onClick={onCancel}
          className="p-2 -ml-2 hover:bg-zinc-900 rounded-xl text-zinc-400 hover:text-white transition-colors"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="w-5 h-5" />
        </button>
        <h2 className="font-semibold text-white tracking-tight text-sm">
          {item ? "Edit Item" : "New Item"}
        </h2>
        <button
          onClick={() => setIsFavorite(!isFavorite)}
          className={`p-2 -mr-2 hover:bg-zinc-900 rounded-xl transition-colors ${isFavorite ? "text-yellow-500" : "text-zinc-600"}`}
        >
          <HugeiconsIcon icon={StarIcon} className={`w-5 h-5 ${isFavorite ? "fill-current" : ""}`} />
        </button>
      </header>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-2 space-y-4 no-scrollbar pb-20">
        {/* Category Picker */}
        <div className="grid grid-cols-4 gap-2 p-1 bg-zinc-900/50 rounded-xl">
          {(["Login", "Card", "Note", "Identity"] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-medium transition-all ${
                category === cat
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {cat === "Login" && <HugeiconsIcon icon={Key01Icon} className="w-4 h-4" />}
              {cat === "Card" && <HugeiconsIcon icon={CreditCardIcon} className="w-4 h-4" />}
              {cat === "Note" && <HugeiconsIcon icon={FileAttachmentIcon} className="w-4 h-4" />}
              {cat === "Identity" && <HugeiconsIcon icon={UserIcon} className="w-4 h-4" />}
              {cat}
            </button>
          ))}
        </div>

        {/* Title + Folder */}
        <div className="bg-zinc-900/30 rounded-2xl px-4 divide-y divide-zinc-800/50">
          <div className="flex items-center justify-between py-3">
            <div className="flex-1 min-w-0 mr-3">
              <p className="text-[11px] text-zinc-500 font-medium">Title</p>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. GitHub, Amazon"
                className="w-full bg-transparent border-none py-0.5 outline-none text-white text-sm font-medium placeholder:text-zinc-600"
              />
            </div>
            {folders.length > 0 && (
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-300 outline-none shrink-0"
              >
                <option value="">No folder</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Login fields */}
        {category === "Login" && (
          <div className="bg-zinc-900/30 rounded-2xl px-4 divide-y divide-zinc-800/50">
            <InputField
              icon={<HugeiconsIcon icon={GlobeIcon} className="w-4 h-4" />}
              label="Website"
              value={website}
              onChange={setWebsite}
              placeholder="google.com"
              showCopy
              onShowToast={onShowToast}
            />
            <InputField
              icon={<HugeiconsIcon icon={UserIcon} className="w-4 h-4" />}
              label="Username"
              value={username}
              onChange={setUsername}
              placeholder="name@example.com"
              showCopy
              onShowToast={onShowToast}
            />
            <div className="py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <HugeiconsIcon icon={LockIcon} className="w-4 h-4 text-zinc-500" />
                  <p className="text-[11px] font-semibold text-zinc-500">Password</p>
                </div>
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent-hover"
                >
                  <HugeiconsIcon icon={SparklesIcon} className="w-3 h-3" /> Generate
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="flex-1 bg-transparent border-none py-0.5 outline-none text-white text-sm font-mono placeholder:text-zinc-600"
                />
                <button type="button" onClick={() => copyToClipboard(password, "Password", onShowToast)} className="p-2 text-zinc-500 hover:text-white">
                  <HugeiconsIcon icon={Copy01Icon} className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="p-2 text-zinc-500 hover:text-white">
                  {showPassword ? <HugeiconsIcon icon={ViewOffIcon} className="w-4 h-4" /> : <HugeiconsIcon icon={ViewIcon} className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <InputField
              icon={<HugeiconsIcon icon={Key01Icon} className="w-4 h-4" />}
              label="TOTP Secret (2FA)"
              value={totpSecret}
              onChange={setTotpSecret}
              placeholder="JBSWY3DPEHPK3PXP"
              isMonospace
              onShowToast={onShowToast}
            />
          </div>
        )}

        {/* Card fields */}
        {category === "Card" && (
          <div className="bg-zinc-900/30 rounded-2xl px-4 divide-y divide-zinc-800/50">
            <InputField
              icon={<HugeiconsIcon icon={CreditCardIcon} className="w-4 h-4" />}
              label="Card Number"
              value={cardDetails.number}
              onChange={(v) => setCardDetails({ ...cardDetails, number: v })}
              placeholder="0000 0000 0000 0000"
              isMonospace
              showCopy
              onShowToast={onShowToast}
            />
            <div className="flex items-center gap-3 py-3">
              <div className="flex-1">
                <p className="text-[11px] text-zinc-500 font-medium">Expiry</p>
                <input
                  type="text"
                  value={cardDetails.expiry}
                  onChange={(e) => setCardDetails({ ...cardDetails, expiry: e.target.value })}
                  placeholder="MM/YY"
                  className="w-full bg-transparent border-none py-0.5 outline-none text-white text-sm font-mono placeholder:text-zinc-600"
                />
              </div>
              <div className="flex-1">
                <p className="text-[11px] text-zinc-500 font-medium">CVV</p>
                <input
                  type="text"
                  value={cardDetails.cvv}
                  onChange={(e) => setCardDetails({ ...cardDetails, cvv: e.target.value })}
                  placeholder="123"
                  className="w-full bg-transparent border-none py-0.5 outline-none text-white text-sm font-mono placeholder:text-zinc-600"
                />
              </div>
            </div>
          </div>
        )}

        {/* Identity fields */}
        {category === "Identity" && (
          <div className="bg-zinc-900/30 rounded-2xl px-4 divide-y divide-zinc-800/50">
            <div className="flex items-center gap-3 py-3">
              <div className="flex-1">
                <p className="text-[11px] text-zinc-500 font-medium">First Name</p>
                <input
                  type="text"
                  value={identityDetails.firstName}
                  onChange={(e) => setIdentityDetails({ ...identityDetails, firstName: e.target.value })}
                  className="w-full bg-transparent border-none py-0.5 outline-none text-white text-sm placeholder:text-zinc-600"
                />
              </div>
              <div className="flex-1">
                <p className="text-[11px] text-zinc-500 font-medium">Last Name</p>
                <input
                  type="text"
                  value={identityDetails.lastName}
                  onChange={(e) => setIdentityDetails({ ...identityDetails, lastName: e.target.value })}
                  className="w-full bg-transparent border-none py-0.5 outline-none text-white text-sm placeholder:text-zinc-600"
                />
              </div>
            </div>
            <InputField
              icon={<HugeiconsIcon icon={Key01Icon} className="w-4 h-4" />}
              label="ID Number"
              value={identityDetails.idNumber}
              onChange={(v) => setIdentityDetails({ ...identityDetails, idNumber: v })}
              placeholder="000-00-0000"
              isMonospace
              onShowToast={onShowToast}
            />
            <InputField
              icon={<HugeiconsIcon icon={UserIcon} className="w-4 h-4" />}
              label="Date of Birth"
              value={identityDetails.dob}
              onChange={(v) => setIdentityDetails({ ...identityDetails, dob: v })}
              type="date"
              onShowToast={onShowToast}
            />
            <div className="py-3">
              <p className="text-[11px] text-zinc-500 font-medium">Address</p>
              <textarea
                value={identityDetails.address}
                onChange={(e) => setIdentityDetails({ ...identityDetails, address: e.target.value })}
                className="w-full bg-transparent border-none py-0.5 outline-none text-white text-sm resize-none h-16 placeholder:text-zinc-600"
                placeholder="123 Main St..."
              />
            </div>
          </div>
        )}

        {/* Note */}
        {category === "Note" && (
          <div className="bg-zinc-900/30 rounded-2xl p-4">
            <p className="text-[11px] text-zinc-500 font-medium mb-2">Content</p>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your secure notes here..."
              className="w-full bg-transparent border-none outline-none text-white text-sm resize-none h-40 placeholder:text-zinc-600 leading-relaxed"
            />
          </div>
        )}

        {/* Custom Fields */}
        <div className="bg-zinc-900/30 rounded-2xl px-4 divide-y divide-zinc-800/50">
          <div className="flex items-center justify-between py-3">
            <p className="text-[11px] font-semibold text-zinc-500">Custom Fields</p>
            <button
              type="button"
              onClick={() => setCustomFields([...customFields, { id: crypto.randomUUID(), name: "", value: "", isSecret: false }])}
              className="flex items-center gap-1 text-[11px] font-medium text-accent"
            >
              <HugeiconsIcon icon={Add01Icon} className="w-3 h-3" /> Add
            </button>
          </div>
          {customFields.map((field, idx) => (
            <div key={field.id} className="flex gap-2 items-start py-3">
              <div className="flex-1 space-y-1.5">
                <input
                  type="text"
                  value={field.name}
                  onChange={(e) => {
                    const newFields = [...customFields];
                    newFields[idx].name = e.target.value;
                    setCustomFields(newFields);
                  }}
                  placeholder="Field name"
                  className="w-full bg-transparent border-none py-0 outline-none text-white text-sm placeholder:text-zinc-600"
                />
                <div className="flex items-center gap-2">
                  <input
                    type={field.isSecret && !field._show ? "password" : "text"}
                    value={field.value}
                    onChange={(e) => {
                      const newFields = [...customFields];
                      newFields[idx].value = e.target.value;
                      setCustomFields(newFields);
                    }}
                    placeholder="Value"
                    className="flex-1 bg-transparent border-none py-0 outline-none text-white text-sm font-mono placeholder:text-zinc-600"
                  />
                  {field.isSecret && (
                    <button
                      type="button"
                      onClick={() => {
                        const newFields = [...customFields];
                        newFields[idx]._show = !newFields[idx]._show;
                        setCustomFields(newFields);
                      }}
                      className="p-1 text-zinc-500 hover:text-white"
                    >
                      {field._show ? <HugeiconsIcon icon={ViewOffIcon} className="w-3.5 h-3.5" /> : <HugeiconsIcon icon={ViewIcon} className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    const newFields = [...customFields];
                    newFields[idx].isSecret = !newFields[idx].isSecret;
                    setCustomFields(newFields);
                  }}
                  className={`p-1 rounded transition-colors ${field.isSecret ? "text-accent" : "text-zinc-600"}`}
                >
                  <HugeiconsIcon icon={LockIcon} className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setCustomFields(customFields.filter((_, i) => i !== idx))}
                  className="p-1 rounded text-zinc-600 hover:text-red-400 transition-colors"
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Tags */}
        <div className="bg-zinc-900/30 rounded-2xl p-4 space-y-3">
          <p className="text-[11px] font-semibold text-zinc-500">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-zinc-800 text-[11px] font-medium text-zinc-300">
                {tag}
                <button type="button" onClick={() => removeTag(tag)} className="hover:text-white">
                  <HugeiconsIcon icon={Cancel01Icon} className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              placeholder="Add a tag..."
              className="flex-1 bg-zinc-800/50 rounded-lg px-3 py-1.5 outline-none text-white text-xs placeholder:text-zinc-600"
            />
            <button type="button" onClick={addTag} className="px-3 bg-zinc-800 text-zinc-300 text-xs rounded-lg hover:bg-zinc-700">Add</button>
          </div>
        </div>

        {/* Actions */}
        <div className="pt-2 space-y-2">
          {item?.deletedAt ? (
            <>
              {onRestore && (
                <button
                  type="button"
                  onClick={() => onRestore(item.id)}
                  className="w-full bg-white text-black font-semibold py-3 rounded-xl hover:bg-zinc-200 transition-colors active:scale-[0.98] text-sm"
                >
                  <HugeiconsIcon icon={FloppyDiskIcon} className="w-4 h-4 inline mr-2" /> Restore Item
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete?.(item.id, true)}
                className="w-full text-red-400 font-medium py-3 rounded-xl hover:bg-red-500/10 transition-colors text-sm"
              >
                <HugeiconsIcon icon={Delete02Icon} className="w-4 h-4 inline mr-2" /> Permanently Delete
              </button>
            </>
          ) : (
            <>
              <button
                type="submit"
                className="w-full bg-white text-black font-semibold py-3 rounded-xl hover:bg-zinc-200 transition-colors active:scale-[0.98] text-sm"
              >
                <HugeiconsIcon icon={FloppyDiskIcon} className="w-4 h-4 inline mr-2" /> {item ? "Save Changes" : "Create Item"}
              </button>
              {item && (
                <button
                  type="button"
                  onClick={() => onDelete?.(item.id)}
                  className="w-full text-red-400 font-medium py-3 rounded-xl hover:bg-red-500/10 transition-colors text-sm"
                >
                  <HugeiconsIcon icon={Delete02Icon} className="w-4 h-4 inline mr-2" /> Move to Trash
                </button>
              )}
            </>
          )}
        </div>
      </form>
    </motion.div>
  );
}
